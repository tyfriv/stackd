import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { 
  MediaSearchResult, 
  APIError, 
  handleAPIResponse, 
  standardizePosterUrl, 
  extractYear, 
  cleanDescription
} from "../lib/apiHelpers";

// TMDB API configuration
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  console.error("TMDB_API_KEY is not set in environment variables");
}

// TMDB API response types (minimal - only what we need)
interface TMDBMovieResult {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
}

interface TMDBTVResult {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
}

interface TMDBSearchResponse {
  results: (TMDBMovieResult | TMDBTVResult)[];
  total_results: number;
  page: number;
  total_pages: number;
}

// Helper function to make secure API calls
async function makeSecureTMDBRequest(endpoint: string, params: Record<string, string> = {}): Promise<Response> {
  if (!TMDB_API_KEY) {
    throw new APIError("TMDB API key not configured", "tmdb");
  }

  const url = new URL(endpoint, TMDB_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  return await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${TMDB_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    method: 'GET'
  });
}

// Search movies via TMDB API
export const searchMovies = action({
  args: { query: v.string(), page: v.optional(v.number()) },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    if (!TMDB_API_KEY) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    // Get current user for rate limiting
    const identity = await ctx.auth.getUserIdentity();
    const userRateLimitKey = identity ? `tmdb_${identity.subject}` : 'tmdb_anonymous';

    // Check rate limiting with database-backed implementation
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: userRateLimitKey,
      limit: 30, // 30 requests per hour per user
      windowMs: 60 * 60 * 1000 // 1 hour
    });

    if (!rateLimitAllowed) {
      throw new APIError("Rate limit exceeded for TMDB API", "tmdb", 429);
    }

    const page = args.page || 1;
    
    try {
      const response = await makeSecureTMDBRequest('/search/movie', {
        query: encodeURIComponent(args.query.trim()),
        page: page.toString()
      });

      const data: TMDBSearchResponse = await handleAPIResponse(response, "tmdb");

      const results: MediaSearchResult[] = [];

      for (const movie of data.results) {
        const movieResult = movie as TMDBMovieResult;
        
        // Check cache first
        const cached = await ctx.runQuery(internal.media.mediaQueries.getCachedMedia, {
          externalId: movieResult.id.toString(),
          type: "movie"
        });

        if (cached) {
          results.push({
            externalId: cached.externalId,
            type: cached.type,
            title: cached.title,
            releaseYear: cached.releaseYear,
            posterUrl: cached.posterUrl,
            description: cached.description,
          });
        } else {
          // Transform and cache new result
          const mediaResult: MediaSearchResult = {
            externalId: movieResult.id.toString(),
            type: "movie",
            title: movieResult.title,
            releaseYear: extractYear(movieResult.release_date),
            posterUrl: standardizePosterUrl(movieResult.poster_path, "tmdb"),
            description: cleanDescription(movieResult.overview),
          };

          // Cache the result - store minimal data instead of full rawData
          await ctx.runMutation(internal.media.mediaQueries.cacheMediaItem, {
            externalId: mediaResult.externalId,
            type: mediaResult.type,
            title: mediaResult.title,
            releaseYear: mediaResult.releaseYear,
            posterUrl: mediaResult.posterUrl,
            description: mediaResult.description,
            rawData: {
              id: movieResult.id,
              title: movieResult.title,
              release_date: movieResult.release_date,
              poster_path: movieResult.poster_path
            }, // Store only essential fields
          });

          results.push(mediaResult);
        }
      }

      return results;

    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        `Failed to search movies: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "tmdb",
        undefined,
        error
      );
    }
  },
});

// Search TV shows via TMDB API
export const searchTVShows = action({
  args: { query: v.string(), page: v.optional(v.number()) },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    if (!TMDB_API_KEY) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    // Get current user for rate limiting
    const identity = await ctx.auth.getUserIdentity();
    const userRateLimitKey = identity ? `tmdb_${identity.subject}` : 'tmdb_anonymous';

    // Check rate limiting with database-backed implementation
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: userRateLimitKey,
      limit: 30, // 30 requests per hour per user
      windowMs: 60 * 60 * 1000 // 1 hour
    });

    if (!rateLimitAllowed) {
      throw new APIError("Rate limit exceeded for TMDB API", "tmdb", 429);
    }

    const page = args.page || 1;
    
    try {
      const response = await makeSecureTMDBRequest('/search/tv', {
        query: encodeURIComponent(args.query.trim()),
        page: page.toString()
      });

      const data: TMDBSearchResponse = await handleAPIResponse(response, "tmdb");

      const results: MediaSearchResult[] = [];

      for (const show of data.results) {
        const tvResult = show as TMDBTVResult;
        
        // Check cache first
        const cached = await ctx.runQuery(internal.media.mediaQueries.getCachedMedia, {
          externalId: tvResult.id.toString(),
          type: "tv"
        });

        if (cached) {
          results.push({
            externalId: cached.externalId,
            type: cached.type,
            title: cached.title,
            releaseYear: cached.releaseYear,
            posterUrl: cached.posterUrl,
            description: cached.description,
            season: cached.season,
          });
        } else {
          // Transform and cache new result
          const mediaResult: MediaSearchResult = {
            externalId: tvResult.id.toString(),
            type: "tv",
            title: tvResult.name,
            releaseYear: extractYear(tvResult.first_air_date),
            posterUrl: standardizePosterUrl(tvResult.poster_path, "tmdb"),
            description: cleanDescription(tvResult.overview),
            season: 1, // Default to season 1 for new TV shows
          };

          // Cache the result
          await ctx.runMutation(internal.media.mediaQueries.cacheMediaItem, {
            externalId: mediaResult.externalId,
            type: mediaResult.type,
            title: mediaResult.title,
            releaseYear: mediaResult.releaseYear,
            posterUrl: mediaResult.posterUrl,
            description: mediaResult.description,
            season: mediaResult.season,
            rawData: {
              id: tvResult.id,
              name: tvResult.name,
              first_air_date: tvResult.first_air_date,
              poster_path: tvResult.poster_path
            }, // Store minimal data
          });

          results.push(mediaResult);
        }
      }

      return results;

    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        `Failed to search TV shows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "tmdb",
        undefined,
        error
      );
    }
  },
});

// Get detailed movie info (for dynamic pages)
export const getMovieDetails = action({
  args: { movieId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    if (!TMDB_API_KEY) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    // Check cache first
    const cached = await ctx.runQuery(internal.media.mediaQueries.getCachedMedia, {
      externalId: args.movieId,
      type: "movie"
    });

    if (cached) {
      return cached;
    }

    // Get current user for rate limiting
    const identity = await ctx.auth.getUserIdentity();
    const userRateLimitKey = identity ? `tmdb_${identity.subject}` : 'tmdb_anonymous';

    // Check rate limiting with database-backed implementation
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: userRateLimitKey,
      limit: 30, // 30 requests per hour per user
      windowMs: 60 * 60 * 1000 // 1 hour
    });

    if (!rateLimitAllowed) {
      throw new APIError("Rate limit exceeded for TMDB API", "tmdb", 429);
    }

    try {
      const response = await makeSecureTMDBRequest(`/movie/${args.movieId}`);
      const movie: TMDBMovieResult = await handleAPIResponse(response, "tmdb");

      // Cache and return detailed info
      const mediaId = await ctx.runMutation(internal.media.mediaQueries.cacheMediaItem, {
        externalId: movie.id.toString(),
        type: "movie",
        title: movie.title,
        releaseYear: extractYear(movie.release_date),
        posterUrl: standardizePosterUrl(movie.poster_path, "tmdb"),
        description: cleanDescription(movie.overview),
        rawData: {
          id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          poster_path: movie.poster_path
        },
      });

      return await ctx.runQuery(internal.media.mediaQueries.getMediaById, { mediaId });

    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        `Failed to get movie details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "tmdb",
        undefined,
        error
      );
    }
  },
});

// Get detailed TV show info (for dynamic pages)
export const getTVDetails = action({
  args: { tvId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    if (!TMDB_API_KEY) {
      throw new APIError("TMDB API key not configured", "tmdb");
    }

    // Check cache first
    const cached = await ctx.runQuery(internal.media.mediaQueries.getCachedMedia, {
      externalId: args.tvId,
      type: "tv"
    });

    if (cached) {
      return cached;
    }

    // Get current user for rate limiting
    const identity = await ctx.auth.getUserIdentity();
    const userRateLimitKey = identity ? `tmdb_${identity.subject}` : 'tmdb_anonymous';

    // Check rate limiting with database-backed implementation
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: userRateLimitKey,
      limit: 30, // 30 requests per hour per user
      windowMs: 60 * 60 * 1000 // 1 hour
    });

    if (!rateLimitAllowed) {
      throw new APIError("Rate limit exceeded for TMDB API", "tmdb", 429);
    }

    try {
      const response = await makeSecureTMDBRequest(`/tv/${args.tvId}`);
      const show: TMDBTVResult = await handleAPIResponse(response, "tmdb");

      // Cache and return detailed info
      const mediaId = await ctx.runMutation(internal.media.mediaQueries.cacheMediaItem, {
        externalId: show.id.toString(),
        type: "tv",
        title: show.name,
        releaseYear: extractYear(show.first_air_date),
        posterUrl: standardizePosterUrl(show.poster_path, "tmdb"),
        description: cleanDescription(show.overview),
        season: 1,
        rawData: {
          id: show.id,
          name: show.name,
          first_air_date: show.first_air_date,
          poster_path: show.poster_path
        },
      });

      return await ctx.runQuery(internal.media.mediaQueries.getMediaById, { mediaId });

    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        `Failed to get TV details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "tmdb",
        undefined,
        error
      );
    }
  },
});