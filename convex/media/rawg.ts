// convex/media/rawg.ts
import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { APIError, extractYear, cleanDescription, standardizePosterUrl } from "../lib/apiHelpers";
import type { MediaSearchResult } from "../lib/apiHelpers";

// RAWG API rate limit: 20,000 requests per month (~22 per hour to be safe)
async function checkRAWGRateLimit(ctx: any): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  const userRateLimitKey = identity ? `rawg_${identity.subject}` : 'rawg_anonymous';
  
  const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
    key: userRateLimitKey,
    limit: 22, // 22 requests per hour per user (safe for monthly limit)
    windowMs: 60 * 60 * 1000 // 1 hour
  });

  if (!rateLimitAllowed) {
    throw new APIError("RAWG API rate limit exceeded", "rawg", 429);
  }
}

interface RAWGGame {
  id: number;
  name: string;
  released: string;
  background_image: string;
  rating: number;
  metacritic: number;
  genres: Array<{ name: string }>;
  platforms: Array<{ platform: { name: string } }>;
  short_screenshots: Array<{ image: string }>;
  description_raw?: string;
}

interface RAWGSearchResponse {
  results: RAWGGame[];
  count: number;
}

interface RAWGGameDetails extends RAWGGame {
  description_raw: string;
  developers: Array<{ name: string }>;
  publishers: Array<{ name: string }>;
  esrb_rating?: { name: string };
}

/**
 * Transform RAWG game data to standardized MediaSearchResult format
 */
function transformRAWGGame(game: RAWGGame): MediaSearchResult {
  const releaseYear = game.released ? extractYear(game.released) : new Date().getFullYear();
  
  // Create description from available info
  let description = "";
  if (game.description_raw) {
    description = cleanDescription(game.description_raw) || "";
  } else {
    const genres = game.genres?.map(g => g.name).join(", ") || "";
    const platforms = game.platforms?.slice(0, 3).map(p => p.platform.name).join(", ") || "";
    description = `${genres ? `Genres: ${genres}` : ""}${platforms ? ` | Platforms: ${platforms}` : ""}`;
  }

  return {
    externalId: game.id.toString(),
    type: "game" as const,
    title: game.name,
    releaseYear: releaseYear,
    posterUrl: standardizePosterUrl(game.background_image, 'rawg'),
    description: description,
    artist: undefined, // Games don't have artists
    season: undefined  // Games don't have seasons
  };
}

/**
 * Search for games using RAWG API
 */
export const searchGames = action({
  args: { 
    query: v.string(),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    const { query, page = 1, pageSize = 20 } = args;

    if (!query.trim()) {
      return [];
    }

    // Rate limiting check
    await checkRAWGRateLimit(ctx);

    // Check cache first - search for games with matching titles
    // Note: searchCachedMedia is a public query, so we use api. not internal.
    const cachedResults = await ctx.runQuery(
      api.media.mediaQueries.searchCachedMedia,
      { query: query.trim(), type: "game", limit: pageSize }
    );

    // If we have enough cached results, return them
    if (cachedResults.length >= Math.min(pageSize, 10)) {
      console.log(`🎮 RAWG: Returning ${cachedResults.length} cached games for "${query}"`);
      return cachedResults;
    }

    // Call RAWG API
    const apiKey = process.env.RAWG_API_KEY;
    if (!apiKey) {
      throw new APIError("RAWG API key not configured", "rawg");
    }

    try {
      const searchParams = new URLSearchParams({
        key: apiKey,
        search: query.trim(),
        page: page.toString(),
        page_size: Math.min(pageSize, 40).toString(), // RAWG allows up to 40 per page
        ordering: "-rating,-metacritic" // Order by rating and metacritic score
      });

      console.log(`🎮 RAWG: Searching games for "${query}"`);
      
      const response = await fetch(
        `https://api.rawg.io/api/games?${searchParams.toString()}`,
        {
          headers: {
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new APIError("RAWG API rate limit exceeded", "rawg", 429);
        }
        throw new APIError(`RAWG API error: ${response.status}`, "rawg", response.status);
      }

      const data: RAWGSearchResponse = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        console.warn("🎮 RAWG: Unexpected API response structure");
        return cachedResults; // Return cached results as fallback
      }

      console.log(`🎮 RAWG: Found ${data.results.length} games`);

      // Transform and cache results
      const transformedResults: MediaSearchResult[] = [];
      
      for (const game of data.results) {
        try {
          const transformed = transformRAWGGame(game);
          
          // Cache the game
          await ctx.runMutation(
            internal.media.mediaQueries.cacheMediaItem,
            {
              externalId: transformed.externalId,
              type: transformed.type,
              title: transformed.title,
              releaseYear: transformed.releaseYear,
              posterUrl: transformed.posterUrl,
              description: transformed.description,
              artist: transformed.artist,
              season: transformed.season,
              rawData: JSON.stringify(game)
            }
          );

          transformedResults.push(transformed);
        } catch (error) {
          console.error(`🎮 RAWG: Error processing game ${game.id}:`, error);
          // Continue processing other games
        }
      }

      // Combine with cached results, removing duplicates
      const allResults = [...cachedResults];
      for (const newResult of transformedResults) {
        if (!allResults.some(cached => cached.externalId === newResult.externalId)) {
          allResults.push(newResult);
        }
      }

      return allResults.slice(0, pageSize);

    } catch (error) {
      console.error("🎮 RAWG: Search error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached results as fallback
      if (cachedResults.length > 0) {
        console.log(`🎮 RAWG: Returning cached results due to API error`);
        return cachedResults;
      }
      
      throw new APIError("Failed to search games", "rawg");
    }
  }
});

/**
 * Get detailed information about a specific game
 */
export const getGameDetails = action({
  args: { gameId: v.string() },
  handler: async (ctx, args): Promise<MediaSearchResult | null> => {
    const { gameId } = args;

    // Rate limiting check
    await checkRAWGRateLimit(ctx);

    // Check cache first
    const cached = await ctx.runQuery(
      internal.media.mediaQueries.getCachedMedia,
      { externalId: gameId, type: "game" }
    );

    if (cached && cached._creationTime > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      console.log(`🎮 RAWG: Returning cached game details for ${gameId}`);
      return {
        externalId: cached.externalId,
        type: cached.type,
        title: cached.title,
        releaseYear: cached.releaseYear,
        posterUrl: cached.posterUrl,
        description: cached.description,
        artist: cached.artist,
        season: cached.season
      };
    }

    // Call RAWG API for details
    const apiKey = process.env.RAWG_API_KEY;
    if (!apiKey) {
      throw new APIError("RAWG API key not configured", "rawg");
    }

    try {
      console.log(`🎮 RAWG: Fetching game details for ${gameId}`);
      
      const response = await fetch(
        `https://api.rawg.io/api/games/${gameId}?key=${apiKey}`,
        {
          headers: {
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        if (response.status === 429) {
          throw new APIError("RAWG API rate limit exceeded", "rawg", 429);
        }
        throw new APIError(`RAWG API error: ${response.status}`, "rawg", response.status);
      }

      const game: RAWGGameDetails = await response.json();
      const transformed = transformRAWGGame(game);

      // Cache the detailed game info
      await ctx.runMutation(
        internal.media.mediaQueries.cacheMediaItem,
        {
          externalId: transformed.externalId,
          type: transformed.type,
          title: transformed.title,
          releaseYear: transformed.releaseYear,
          posterUrl: transformed.posterUrl,
          description: transformed.description,
          artist: transformed.artist,
          season: transformed.season,
          rawData: JSON.stringify(game)
        }
      );

      console.log(`🎮 RAWG: Cached game details for "${game.name}"`);
      return transformed;

    } catch (error) {
      console.error("🎮 RAWG: Details error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached result as fallback (even if older)
      if (cached) {
        console.log(`🎮 RAWG: Returning stale cache due to API error`);
        return {
          externalId: cached.externalId,
          type: cached.type,
          title: cached.title,
          releaseYear: cached.releaseYear,
          posterUrl: cached.posterUrl,
          description: cached.description,
          artist: cached.artist,
          season: cached.season
        };
      }
      
      throw new APIError("Failed to get game details", "rawg");
    }
  }
});

/**
 * Get popular/trending games
 */
export const getTrendingGames = action({
  args: { 
    limit: v.optional(v.number()),
    page: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    const { limit = 20, page = 1 } = args;

    // Rate limiting check
    await checkRAWGRateLimit(ctx);

    const apiKey = process.env.RAWG_API_KEY;
    if (!apiKey) {
      throw new APIError("RAWG API key not configured", "rawg");
    }

    try {
      const searchParams = new URLSearchParams({
        key: apiKey,
        page: page.toString(),
        page_size: Math.min(limit, 40).toString(),
        ordering: "-added", // Most popular games
        dates: `${new Date().getFullYear() - 2}-01-01,${new Date().getFullYear()}-12-31` // Last 2 years
      });

      console.log(`🎮 RAWG: Fetching trending games`);
      
      const response = await fetch(
        `https://api.rawg.io/api/games?${searchParams.toString()}`,
        {
          headers: {
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new APIError("RAWG API rate limit exceeded", "rawg", 429);
        }
        throw new APIError(`RAWG API error: ${response.status}`, "rawg", response.status);
      }

      const data: RAWGSearchResponse = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        console.warn("🎮 RAWG: Unexpected API response structure");
        return [];
      }

      console.log(`🎮 RAWG: Found ${data.results.length} trending games`);

      // Transform and cache results
      const results: MediaSearchResult[] = [];
      
      for (const game of data.results) {
        try {
          const transformed = transformRAWGGame(game);
          
          // Cache the game
          await ctx.runMutation(
            internal.media.mediaQueries.cacheMediaItem,
            {
              externalId: transformed.externalId,
              type: transformed.type,
              title: transformed.title,
              releaseYear: transformed.releaseYear,
              posterUrl: transformed.posterUrl,
              description: transformed.description,
              artist: transformed.artist,
              season: transformed.season,
              rawData: JSON.stringify(game)
            }
          );

          results.push(transformed);
        } catch (error) {
          console.error(`🎮 RAWG: Error processing trending game ${game.id}:`, error);
          // Continue processing other games
        }
      }

      return results;

    } catch (error) {
      console.error("🎮 RAWG: Trending games error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      throw new APIError("Failed to get trending games", "rawg");
    }
  }
});