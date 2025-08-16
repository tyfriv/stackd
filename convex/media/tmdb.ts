// convex/media/tmdb.ts
import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { APIError, extractYear, cleanDescription, standardizePosterUrl } from "../lib/apiHelpers";
import type { MediaSearchResult } from "../lib/apiHelpers";

// TMDB API configuration
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  console.error("TMDB_API_KEY is not set in environment variables");
}

// TMDB API rate limit: Much higher than RAWG, using 100 per hour to be safe
async function checkTMDBRateLimit(ctx: any): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  const userRateLimitKey = identity ? `tmdb_${identity.subject}` : 'tmdb_anonymous';
  
  const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
    key: userRateLimitKey,
    limit: 100, // 100 requests per hour per user
    windowMs: 60 * 60 * 1000 // 1 hour
  });

  if (!rateLimitAllowed) {
    throw new APIError("TMDB API rate limit exceeded", "tmdb", 429);
  }
}

interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  genre_ids: number[];
}

interface TMDBTVShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  genre_ids: number[];
}

interface TMDBSearchResponse {
  results: (TMDBMovie | TMDBTVShow)[];
  total_results: number;
  total_pages: number;
  page: number;
}

/**
 * Transform TMDB movie data to standardized MediaSearchResult format
 */
function transformTMDBMovie(movie: TMDBMovie): MediaSearchResult {
  const releaseYear = movie.release_date ? extractYear(movie.release_date) : new Date().getFullYear();
  
  return {
    externalId: movie.id.toString(),
    type: "movie" as const,
    title: movie.title,
    releaseYear: releaseYear,
    posterUrl: standardizePosterUrl(movie.poster_path, 'tmdb'),
    description: cleanDescription(movie.overview),
    artist: undefined, // Movies don't have artists
    season: undefined  // Movies don't have seasons
  };
}

/**
 * Transform TMDB TV show data to standardized MediaSearchResult format
 */
function transformTMDBTVShow(show: TMDBTVShow): MediaSearchResult {
  const releaseYear = show.first_air_date ? extractYear(show.first_air_date) : new Date().getFullYear();
  
  return {
    externalId: show.id.toString(),
    type: "tv" as const,
    title: show.name,
    releaseYear: releaseYear,
    posterUrl: standardizePosterUrl(show.poster_path, 'tmdb'),
    description: cleanDescription(show.overview),
    artist: undefined, // TV shows don't have artists
    season: 1  // Default to season 1 for TV shows
  };
}

/**
 * Search for movies using TMDB API
 */
export const searchMovies = action({
  args: { 
    query: v.string(),
    page: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    const { query, page = 1 } = args;

    // SECURITY FIX: Better input validation
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }
    
    if (trimmedQuery.length < 2) {
      throw new Error("Search query must be at least 2 characters");
    }
    
    if (trimmedQuery.length > 100) {
      throw new Error("Search query too long");
    }

    // Rate limiting check
    await checkTMDBRateLimit(ctx);

    // Check cache first - search for movies with matching titles
    const cachedResults = await ctx.runQuery(
      api.media.mediaQueries.searchCachedMedia,
      { query: trimmedQuery, type: "movie", limit: 20 }
    );

    // If we have enough cached results, return them
    if (cachedResults.length >= Math.min(20, 10)) {
      console.log(`🎬 TMDB: Returning ${cachedResults.length} cached movies for "${trimmedQuery}"`);
      return cachedResults;
    }

    // Call TMDB API
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    try {
      const searchParams = new URLSearchParams({
        api_key: apiKey,
        query: trimmedQuery,
        page: page.toString(),
        language: 'en-US'
      });

      console.log(`🎬 TMDB: Searching movies for "${trimmedQuery}"`);
      
      const response = await fetch(
        `${TMDB_BASE_URL}/search/movie?${searchParams.toString()}`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new APIError("TMDB API rate limit exceeded", "tmdb", 429);
        }
        if (response.status === 401) {
          throw new APIError("TMDB API authentication failed - check API key", "tmdb", 401);
        }
        throw new APIError(`TMDB API error: ${response.status}`, "tmdb", response.status);
      }

      const data: TMDBSearchResponse = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        console.warn("🎬 TMDB: Unexpected API response structure");
        return cachedResults; // Return cached results as fallback
      }

      console.log(`🎬 TMDB: Found ${data.results.length} movies`);

      // Transform and cache results
      const transformedResults: MediaSearchResult[] = [];
      
      for (const movie of data.results) {
        try {
          const movieData = movie as TMDBMovie;
          const transformed = transformTMDBMovie(movieData);
          
          // Cache the movie
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
              rawData: movieData
            }
          );

          transformedResults.push(transformed);
        } catch (error) {
          console.error(`🎬 TMDB: Error processing movie ${(movie as TMDBMovie).id}:`, error);
          // Continue processing other movies
        }
      }

      // Combine with cached results, removing duplicates
      const allResults = [...cachedResults];
      for (const newResult of transformedResults) {
        if (!allResults.some(cached => cached.externalId === newResult.externalId)) {
          allResults.push(newResult);
        }
      }

      return allResults.slice(0, 20);

    } catch (error) {
      console.error("🎬 TMDB: Search movies error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached results as fallback
      if (cachedResults.length > 0) {
        console.log(`🎬 TMDB: Returning cached results due to API error`);
        return cachedResults;
      }
      
      throw new APIError("Failed to search movies", "tmdb");
    }
  }
});

/**
 * Search for TV shows using TMDB API
 */
export const searchTVShows = action({
  args: { 
    query: v.string(),
    page: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    const { query, page = 1 } = args;

    // SECURITY FIX: Better input validation
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }
    
    if (trimmedQuery.length < 2) {
      throw new Error("Search query must be at least 2 characters");
    }
    
    if (trimmedQuery.length > 100) {
      throw new Error("Search query too long");
    }

    // Rate limiting check
    await checkTMDBRateLimit(ctx);

    // Check cache first - search for TV shows with matching titles
    const cachedResults = await ctx.runQuery(
      api.media.mediaQueries.searchCachedMedia,
      { query: trimmedQuery, type: "tv", limit: 20 }
    );

    // If we have enough cached results, return them
    if (cachedResults.length >= Math.min(20, 10)) {
      console.log(`🎬 TMDB: Returning ${cachedResults.length} cached TV shows for "${trimmedQuery}"`);
      return cachedResults;
    }

    // Call TMDB API
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    try {
      const searchParams = new URLSearchParams({
        api_key: apiKey,
        query: trimmedQuery,
        page: page.toString(),
        language: 'en-US'
      });

      console.log(`🎬 TMDB: Searching TV shows for "${trimmedQuery}"`);
      
      const response = await fetch(
        `${TMDB_BASE_URL}/search/tv?${searchParams.toString()}`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new APIError("TMDB API rate limit exceeded", "tmdb", 429);
        }
        if (response.status === 401) {
          throw new APIError("TMDB API authentication failed - check API key", "tmdb", 401);
        }
        throw new APIError(`TMDB API error: ${response.status}`, "tmdb", response.status);
      }

      const data: TMDBSearchResponse = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        console.warn("🎬 TMDB: Unexpected API response structure");
        return cachedResults; // Return cached results as fallback
      }

      console.log(`🎬 TMDB: Found ${data.results.length} TV shows`);

      // Transform and cache results
      const transformedResults: MediaSearchResult[] = [];
      
      for (const show of data.results) {
        try {
          const tvData = show as TMDBTVShow;
          const transformed = transformTMDBTVShow(tvData);
          
          // Cache the TV show
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
              rawData: tvData
            }
          );

          transformedResults.push(transformed);
        } catch (error) {
          console.error(`🎬 TMDB: Error processing TV show ${(show as TMDBTVShow).id}:`, error);
          // Continue processing other shows
        }
      }

      // Combine with cached results, removing duplicates
      const allResults = [...cachedResults];
      for (const newResult of transformedResults) {
        if (!allResults.some(cached => cached.externalId === newResult.externalId)) {
          allResults.push(newResult);
        }
      }

      return allResults.slice(0, 20);

    } catch (error) {
      console.error("🎬 TMDB: Search TV shows error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached results as fallback
      if (cachedResults.length > 0) {
        console.log(`🎬 TMDB: Returning cached results due to API error`);
        return cachedResults;
      }
      
      throw new APIError("Failed to search TV shows", "tmdb");
    }
  }
});

/**
 * Get detailed information about a specific movie
 */
export const getMovieDetails = action({
  args: { movieId: v.string() },
  handler: async (ctx, args): Promise<MediaSearchResult | null> => {
    const { movieId } = args;

    // Rate limiting check
    await checkTMDBRateLimit(ctx);

    // Check cache first
    const cached = await ctx.runQuery(
      internal.media.mediaQueries.getCachedMedia,
      { externalId: movieId, type: "movie" }
    );

    if (cached && cached._creationTime > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      console.log(`🎬 TMDB: Returning cached movie details for ${movieId}`);
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

    // Call TMDB API for details
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    try {
      console.log(`🎬 TMDB: Fetching movie details for ${movieId}`);
      
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/${movieId}?api_key=${apiKey}&language=en-US`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        if (response.status === 429) {
          throw new APIError("TMDB API rate limit exceeded", "tmdb", 429);
        }
        if (response.status === 401) {
          throw new APIError("TMDB API authentication failed", "tmdb", 401);
        }
        throw new APIError(`TMDB API error: ${response.status}`, "tmdb", response.status);
      }

      const movie: TMDBMovie = await response.json();
      const transformed = transformTMDBMovie(movie);

      // Cache the detailed movie info
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
          rawData: movie
        }
      );

      console.log(`🎬 TMDB: Cached movie details for "${movie.title}"`);
      return transformed;

    } catch (error) {
      console.error("🎬 TMDB: Movie details error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached result as fallback (even if older)
      if (cached) {
        console.log(`🎬 TMDB: Returning stale cache due to API error`);
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
      
      throw new APIError("Failed to get movie details", "tmdb");
    }
  }
});

/**
 * Get detailed information about a specific TV show
 */
export const getTVDetails = action({
  args: { tvId: v.string() },
  handler: async (ctx, args): Promise<MediaSearchResult | null> => {
    const { tvId } = args;

    // Rate limiting check
    await checkTMDBRateLimit(ctx);

    // Check cache first
    const cached = await ctx.runQuery(
      internal.media.mediaQueries.getCachedMedia,
      { externalId: tvId, type: "tv" }
    );

    if (cached && cached._creationTime > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      console.log(`🎬 TMDB: Returning cached TV details for ${tvId}`);
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

    // Call TMDB API for details
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    try {
      console.log(`🎬 TMDB: Fetching TV details for ${tvId}`);
      
      const response = await fetch(
        `${TMDB_BASE_URL}/tv/${tvId}?api_key=${apiKey}&language=en-US`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'STACKD/1.0'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        if (response.status === 429) {
          throw new APIError("TMDB API rate limit exceeded", "tmdb", 429);
        }
        if (response.status === 401) {
          throw new APIError("TMDB API authentication failed", "tmdb", 401);
        }
        throw new APIError(`TMDB API error: ${response.status}`, "tmdb", response.status);
      }

      const show: TMDBTVShow = await response.json();
      const transformed = transformTMDBTVShow(show);

      // Cache the detailed TV show info
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
          rawData: show
        }
      );

      console.log(`🎬 TMDB: Cached TV details for "${show.name}"`);
      return transformed;

    } catch (error) {
      console.error("🎬 TMDB: TV details error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached result as fallback (even if older)
      if (cached) {
        console.log(`🎬 TMDB: Returning stale cache due to API error`);
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
      
      throw new APIError("Failed to get TV details", "tmdb");
    }
  }
});