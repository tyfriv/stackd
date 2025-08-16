// convex/search/globalSearch.ts - Fixed version
import { v } from "convex/values";
import { query, action } from "../_generated/server";
import { api, internal } from "../_generated/api";

// Type definitions
interface LocalSearchResult {
  _id: string;
  externalId?: string;
  username?: string;
  profileImage?: string;
  bio?: string;
  title?: string;
  releaseYear?: number;
  posterUrl?: string;
  artist?: string;
  season?: number;
  description?: string;
  type: "user" | "movie" | "tv" | "game" | "music";
}

interface SearchResults {
  users: LocalSearchResult[];
  movies: LocalSearchResult[];
  tv: LocalSearchResult[];
  games: LocalSearchResult[];
  music: LocalSearchResult[];
  totalResults: number;
  isFromCache?: boolean;
}

interface ExternalSearchResult {
  _id: string;
  externalId: string;
  title: string;
  releaseYear: number;
  posterUrl: string;
  description?: string;
  artist?: string;
  season?: number;
  type: "movie" | "tv" | "game" | "music";
}

/**
 * Global search across users and media content
 */
export const globalSearch = query({
  args: { 
    query: v.string(),
    type: v.optional(v.union(
      v.literal("all"),
      v.literal("users"), 
      v.literal("movies"),
      v.literal("tv"),
      v.literal("games"), 
      v.literal("music")
    )),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<SearchResults> => {
    const { query, type = "all", limit = 50 } = args;
    
    if (!query.trim()) {
      return {
        users: [],
        movies: [],
        tv: [],
        games: [],
        music: [],
        totalResults: 0
      };
    }

    const searchTerm = query.trim().toLowerCase();
    const results: SearchResults = {
      users: [],
      movies: [],
      tv: [],
      games: [],
      music: [],
      totalResults: 0
    };

    // Search users if type is "all" or "users"
    if (type === "all" || type === "users") {
      const userResults = await ctx.db
        .query("users")
        .withIndex("by_username")
        .filter((q) => 
          q.or(
            q.eq(q.field("username"), searchTerm),
            q.gte(q.field("username"), searchTerm)
          )
        )
        .take(limit);

      results.users = userResults
        .filter(user => user.username.toLowerCase().includes(searchTerm))
        .map(user => ({
          _id: user._id,
          username: user.username,
          profileImage: user.profileImage,
          bio: user.bio,
          type: "user" as const
        }));
    }

    // Search media by type
    const mediaTypes = type === "all" 
      ? ["movies", "tv", "games", "music"] as const
      : [type as "movies" | "tv" | "games" | "music"];

    for (const mediaType of mediaTypes) {
      if (type === "users") continue;
      
      const dbType = mediaType === "movies" ? "movie" 
                   : mediaType === "tv" ? "tv"
                   : mediaType === "games" ? "game" 
                   : "music";

      const mediaResults = await ctx.db
        .query("media")
        .withSearchIndex("search_title", (q) => q.search("title", searchTerm))
        .filter((q) => q.eq(q.field("type"), dbType))
        .take(limit);

      results[mediaType] = mediaResults.map(media => ({
        _id: media._id,
        externalId: media.externalId,
        title: media.title,
        releaseYear: media.releaseYear,
        posterUrl: media.posterUrl,
        artist: media.artist,
        season: media.season,
        type: dbType,
        description: media.description
      }));
    }

    results.totalResults = Object.values(results)
      .filter((arr): arr is LocalSearchResult[] => Array.isArray(arr))
      .reduce((total: number, arr: LocalSearchResult[]) => total + arr.length, 0);

    return results;
  }
});

/**
 * Helper function to merge local and external results without duplicates
 */
function mergeResults(local: LocalSearchResult[], external: ExternalSearchResult[], maxResults = 20): LocalSearchResult[] {
  const combined: LocalSearchResult[] = [...local];
  
  for (const externalItem of external) {
    const exists = combined.some(localItem => 
      localItem.externalId === externalItem.externalId ||
      (localItem.title === externalItem.title && localItem.releaseYear === externalItem.releaseYear)
    );
    
    if (!exists && combined.length < maxResults) {
      combined.push(externalItem);
    }
  }
  
  return combined.slice(0, maxResults);
}

/**
 * MAIN SEARCH ACTION - This is what your frontend should call
 * Searches local cache first, then hits external APIs if needed
 */
export const searchWithAPIs = action({
  args: { 
    query: v.string(),
    type: v.optional(v.union(
      v.literal("all"),
      v.literal("movies"),
      v.literal("tv"), 
      v.literal("games"),
      v.literal("music")
    )),
    includeExternal: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<SearchResults & { isFromCache: boolean }> => {
    const { query, type = "all", includeExternal = true } = args;
    
    // Track this search
    await ctx.runMutation(internal.search.searchHelpers.trackSearch, {
      query,
      resultCount: 0,
      searchType: type
    });

    // First get local cached results with explicit typing
    const localResults: SearchResults = await ctx.runQuery(api.search.globalSearch.globalSearch, {
      query,
      type,
      limit: 20
    });

    // If we have enough local results or not including external, return local only
    if (!includeExternal || localResults.totalResults >= 10) {
      return {
        ...localResults,
        isFromCache: true
      };
    }

    // Now search external APIs for missing results
    const externalResults: {
      movies: ExternalSearchResult[];
      tv: ExternalSearchResult[];
      games: ExternalSearchResult[];
      music: ExternalSearchResult[];
    } = {
      movies: [],
      tv: [],
      games: [],
      music: []
    };

    try {
      // Search movies via TMDB if needed
      if ((type === "all" || type === "movies") && localResults.movies.length < 5) {
        console.log("🔍 Searching TMDB for movies:", query);
        const tmdbMovies = await ctx.runAction(api.media.tmdb.searchMovies, { 
          query, 
          page: 1 
        });
        
        externalResults.movies = tmdbMovies.slice(0, 10).map(movie => ({
          _id: movie.externalId,
          externalId: movie.externalId,
          title: movie.title,
          releaseYear: movie.releaseYear,
          posterUrl: movie.posterUrl,
          description: movie.description,
          type: "movie" as const
        }));
      }

      // Search TV shows via TMDB if needed
      if ((type === "all" || type === "tv") && localResults.tv.length < 5) {
        console.log("🔍 Searching TMDB for TV shows:", query);
        const tmdbTV = await ctx.runAction(api.media.tmdb.searchTVShows, { 
          query, 
          page: 1 
        });
        
        externalResults.tv = tmdbTV.slice(0, 10).map(show => ({
          _id: show.externalId,
          externalId: show.externalId,
          title: show.title,
          releaseYear: show.releaseYear,
          posterUrl: show.posterUrl,
          description: show.description,
          season: show.season,
          type: "tv" as const
        }));
      }

      // Search games via RAWG if needed
      if ((type === "all" || type === "games") && localResults.games.length < 5) {
        console.log("🔍 Searching RAWG for games:", query);
        const rawgGames = await ctx.runAction(api.media.rawg.searchGames, { 
          query, 
          pageSize: 10 
        });
        
        externalResults.games = rawgGames.slice(0, 10).map(game => ({
          _id: game.externalId,
          externalId: game.externalId,
          title: game.title,
          releaseYear: game.releaseYear,
          posterUrl: game.posterUrl,
          description: game.description,
          type: "game" as const
        }));
      }

      // Search music via Spotify if needed
      if ((type === "all" || type === "music") && localResults.music.length < 5) {
        console.log("🔍 Searching Spotify for music:", query);
        const spotifyMusic = await ctx.runAction(api.media.spotify.searchMusic, { 
          query, 
          limit: 10 
        });
        
        externalResults.music = spotifyMusic.slice(0, 10).map(track => ({
          _id: track.externalId,
          externalId: track.externalId,
          title: track.title,
          releaseYear: track.releaseYear,
          posterUrl: track.posterUrl,
          description: track.description,
          artist: track.artist,
          type: "music" as const
        }));
      }

    } catch (error) {
      console.error("🔍 External API search error:", error);
      // Continue with local results even if external APIs fail
    }

    // Merge local and external results, avoiding duplicates
    const mergedResults: SearchResults = {
      users: localResults.users,
      movies: mergeResults(localResults.movies, externalResults.movies),
      tv: mergeResults(localResults.tv, externalResults.tv),
      games: mergeResults(localResults.games, externalResults.games),
      music: mergeResults(localResults.music, externalResults.music),
      totalResults: 0
    };

    mergedResults.totalResults = Object.values(mergedResults)
      .filter((arr): arr is LocalSearchResult[] => Array.isArray(arr))
      .reduce((total: number, arr: LocalSearchResult[]) => total + arr.length, 0);

    return {
      ...mergedResults,
      isFromCache: false
    };
  }
});

/**
 * Get search suggestions (for autocomplete)
 */
export const getSearchSuggestions = query({
  args: { 
    query: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const { query, limit = 10 } = args;
    
    if (query.length < 2) return [];

    const searchTerm = query.trim().toLowerCase();
    
    // Get user suggestions
    const userSuggestions = await ctx.db
      .query("users")
      .withIndex("by_username")
      .filter((q) => q.gte(q.field("username"), searchTerm))
      .take(3);

    // Get media suggestions
    const mediaSuggestions = await ctx.db
      .query("media")
      .withSearchIndex("search_title", (q) => q.search("title", searchTerm))
      .take(limit - userSuggestions.length);

    const suggestions = [
      ...userSuggestions
        .filter(user => user.username.toLowerCase().includes(searchTerm))
        .map(user => ({
          text: user.username,
          type: "user" as const,
          id: user._id
        })),
      ...mediaSuggestions.map(media => ({
        text: media.title,
        type: media.type as "movie" | "tv" | "game" | "music",
        id: media._id
      }))
    ];

    return suggestions.slice(0, limit);
  }
});

/**
 * Get trending searches based on recent activity
 */
export const getTrendingContent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { limit = 10 } = args;
    
    // Get recently logged media (trending content)
    const recentLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility_logged_at", (q) => 
        q.eq("visibility", "public")
      )
      .order("desc")
      .take(100);

    // Group by media and count occurrences
    const mediaCount = recentLogs.reduce((acc, log) => {
      const mediaId = log.mediaId;
      acc[mediaId] = (acc[mediaId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Sort by count and get top media
    const sortedMedia = Object.entries(mediaCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit);

    // Get media details
    const trendingMedia = await Promise.all(
      sortedMedia.map(async ([mediaId, count]) => {
        const media = await ctx.db.get(mediaId as any);
        return media ? {
          ...media,
          logCount: count
        } : null;
      })
    );

    return trendingMedia.filter(media => media !== null);
  }
});

/**
 * Quick search for specific media item (for when user clicks on search suggestions)
 */
export const quickMediaSearch = query({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    if (!media) return null;

    const stats: {
      totalLogs: number;
      totalReviews: number;
      averageRating: number;
    } = await ctx.runQuery(api.logs.logOperations.getMediaStats, {
      mediaId: args.mediaId
    });

    return {
      ...media,
      stats
    };
  }
});

/**
 * Search within specific media type with better filtering
 */
export const searchMediaByType = query({
  args: {
    query: v.string(),
    mediaType: v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music")),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("relevance"), v.literal("year"), v.literal("popularity")))
  },
  handler: async (ctx, args) => {
    const { query, mediaType, limit = 20, sortBy = "relevance" } = args;

    let results = await ctx.db
      .query("media")
      .withSearchIndex("search_title", (q) => q.search("title", query))
      .filter((q) => q.eq(q.field("type"), mediaType))
      .take(limit);

    // Sort results if needed
    if (sortBy === "year") {
      results.sort((a, b) => b.releaseYear - a.releaseYear);
    } else if (sortBy === "popularity") {
      results.sort((a, b) => b.lastUpdated - a.lastUpdated);
    }

    return results.map(media => ({
      _id: media._id,
      externalId: media.externalId,
      title: media.title,
      releaseYear: media.releaseYear,
      posterUrl: media.posterUrl,
      artist: media.artist,
      season: media.season,
      type: mediaType,
      description: media.description
    }));
  }
});

/**
 * ADVANCED SEARCH ACTION with filters
 * Supports year range, sorting, and popularity filtering
 */
export const advancedSearchWithAPIs = action({
  args: { 
    query: v.string(),
    type: v.optional(v.union(
      v.literal("all"),
      v.literal("movies"),
      v.literal("tv"), 
      v.literal("games"),
      v.literal("music")
    )),
    filters: v.optional(v.object({
      yearStart: v.optional(v.number()),
      yearEnd: v.optional(v.number()),
      sortBy: v.optional(v.union(
        v.literal("relevance"),
        v.literal("year_desc"),
        v.literal("year_asc"),
        v.literal("popularity"),
        v.literal("rating")
      )),
      popularOnly: v.optional(v.boolean()),
      limit: v.optional(v.number())
    })),
    includeExternal: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<SearchResults & { isFromCache: boolean }> => {
    const { 
      query, 
      type = "all", 
      filters = {}, 
      includeExternal = true 
    } = args;
    
    const {
      yearStart,
      yearEnd,
      sortBy = "relevance",
      popularOnly = false,
      limit = 20
    } = filters;

    // Track this advanced search
    await ctx.runMutation(internal.search.searchHelpers.trackSearch, {
      query,
      resultCount: 0,
      searchType: `advanced_${type}_${sortBy}`
    });

    // First get local cached results with filters applied
    const localResults: SearchResults = await ctx.runQuery(api.search.globalSearch.globalSearch, {
      query,
      type,
      limit: Math.floor(limit * 0.7) // Reserve 30% for external results
    });

    // Apply year filters to local results
    if (yearStart || yearEnd) {
      const filterByYear = (items: LocalSearchResult[]) => 
        items.filter(item => {
          if (!item.releaseYear) return true; // Keep items without year data
          if (yearStart && item.releaseYear < yearStart) return false;
          if (yearEnd && item.releaseYear > yearEnd) return false;
          return true;
        });

      localResults.movies = filterByYear(localResults.movies);
      localResults.tv = filterByYear(localResults.tv);
      localResults.games = filterByYear(localResults.games);
      localResults.music = filterByYear(localResults.music);
      
      // Recalculate total
      localResults.totalResults = Object.values(localResults)
        .filter((arr): arr is LocalSearchResult[] => Array.isArray(arr))
        .reduce((total, arr) => total + arr.length, 0);
    }

    // Apply popularity filter if requested
    if (popularOnly) {
      // Get popular media IDs from recent logs
      const recentLogs = await ctx.runQuery(internal.search.searchHelpers.getPopularSearches, {
        limit: 100
      });
      
      const popularTitles = new Set(recentLogs.map(title => title?.toLowerCase()));
      
      const filterByPopularity = (items: LocalSearchResult[]) => 
        items.filter(item => 
          item.title && popularTitles.has(item.title.toLowerCase())
        );

      if (popularTitles.size > 0) {
        localResults.movies = filterByPopularity(localResults.movies);
        localResults.tv = filterByPopularity(localResults.tv);
        localResults.games = filterByPopularity(localResults.games);
        localResults.music = filterByPopularity(localResults.music);
        
        // Recalculate total
        localResults.totalResults = Object.values(localResults)
          .filter((arr): arr is LocalSearchResult[] => Array.isArray(arr))
          .reduce((total, arr) => total + arr.length, 0);
      }
    }

    // Apply sorting to local results
    const applySorting = (items: LocalSearchResult[]) => {
      const sortedItems = [...items];
      
      switch (sortBy) {
        case "year_desc":
          return sortedItems.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
        case "year_asc":
          return sortedItems.sort((a, b) => (a.releaseYear || 0) - (b.releaseYear || 0));
        case "popularity":
          // Sort by recency in cache as a proxy for popularity
          return sortedItems; // Already sorted by relevance from search
        case "rating":
          // Would need rating data in cache - for now use relevance
          return sortedItems;
        case "relevance":
        default:
          return sortedItems; // Already sorted by search relevance
      }
    };

    localResults.movies = applySorting(localResults.movies);
    localResults.tv = applySorting(localResults.tv);
    localResults.games = applySorting(localResults.games);
    localResults.music = applySorting(localResults.music);

    // If we have enough local results or not including external, return local only
    if (!includeExternal || localResults.totalResults >= Math.floor(limit * 0.8)) {
      return {
        ...localResults,
        isFromCache: true
      };
    }

    // Search external APIs with advanced parameters
    const externalResults = {
      movies: [] as ExternalSearchResult[],
      tv: [] as ExternalSearchResult[],
      games: [] as ExternalSearchResult[],
      music: [] as ExternalSearchResult[]
    };

    const remainingLimit = limit - localResults.totalResults;
    const perTypeLimit = Math.max(5, Math.floor(remainingLimit / 3));

    try {
      // Search movies with year filters
      if ((type === "all" || type === "movies") && localResults.movies.length < perTypeLimit) {
        console.log("🔍 Advanced search TMDB movies:", query, { yearStart, yearEnd });
        const tmdbMovies = await ctx.runAction(api.media.tmdb.searchMovies, { 
          query, 
          page: 1 
        });
        
        let filteredMovies = tmdbMovies;
        if (yearStart || yearEnd) {
          filteredMovies = tmdbMovies.filter(movie => {
            if (yearStart && movie.releaseYear < yearStart) return false;
            if (yearEnd && movie.releaseYear > yearEnd) return false;
            return true;
          });
        }
        
        externalResults.movies = filteredMovies.slice(0, perTypeLimit).map(movie => ({
          _id: movie.externalId,
          externalId: movie.externalId,
          title: movie.title,
          releaseYear: movie.releaseYear,
          posterUrl: movie.posterUrl,
          description: movie.description,
          type: "movie" as const
        }));
      }

      // Search TV shows with year filters
      if ((type === "all" || type === "tv") && localResults.tv.length < perTypeLimit) {
        console.log("🔍 Advanced search TMDB TV:", query, { yearStart, yearEnd });
        const tmdbTV = await ctx.runAction(api.media.tmdb.searchTVShows, { 
          query, 
          page: 1 
        });
        
        let filteredTV = tmdbTV;
        if (yearStart || yearEnd) {
          filteredTV = tmdbTV.filter(show => {
            if (yearStart && show.releaseYear < yearStart) return false;
            if (yearEnd && show.releaseYear > yearEnd) return false;
            return true;
          });
        }
        
        externalResults.tv = filteredTV.slice(0, perTypeLimit).map(show => ({
          _id: show.externalId,
          externalId: show.externalId,
          title: show.title,
          releaseYear: show.releaseYear,
          posterUrl: show.posterUrl,
          description: show.description,
          season: show.season,
          type: "tv" as const
        }));
      }

      // Search games with filters
      if ((type === "all" || type === "games") && localResults.games.length < perTypeLimit) {
        console.log("🔍 Advanced search RAWG games:", query, { yearStart, yearEnd });
        const rawgGames = await ctx.runAction(api.media.rawg.searchGames, { 
          query, 
          pageSize: perTypeLimit * 2 // Get more to filter
        });
        
        let filteredGames = rawgGames;
        if (yearStart || yearEnd) {
          filteredGames = rawgGames.filter(game => {
            if (yearStart && game.releaseYear < yearStart) return false;
            if (yearEnd && game.releaseYear > yearEnd) return false;
            return true;
          });
        }
        
        externalResults.games = filteredGames.slice(0, perTypeLimit).map(game => ({
          _id: game.externalId,
          externalId: game.externalId,
          title: game.title,
          releaseYear: game.releaseYear,
          posterUrl: game.posterUrl,
          description: game.description,
          type: "game" as const
        }));
      }

      // Search music with filters
      if ((type === "all" || type === "music") && localResults.music.length < perTypeLimit) {
        console.log("🔍 Advanced search Spotify music:", query, { yearStart, yearEnd });
        const spotifyMusic = await ctx.runAction(api.media.spotify.searchMusic, { 
          query, 
          limit: perTypeLimit * 2
        });
        
        let filteredMusic = spotifyMusic;
        if (yearStart || yearEnd) {
          filteredMusic = spotifyMusic.filter(track => {
            if (yearStart && track.releaseYear < yearStart) return false;
            if (yearEnd && track.releaseYear > yearEnd) return false;
            return true;
          });
        }
        
        externalResults.music = filteredMusic.slice(0, perTypeLimit).map(track => ({
          _id: track.externalId,
          externalId: track.externalId,
          title: track.title,
          releaseYear: track.releaseYear,
          posterUrl: track.posterUrl,
          description: track.description,
          artist: track.artist,
          type: "music" as const
        }));
      }

    } catch (error) {
      console.error("🔍 Advanced search external API error:", error);
    }

    // Apply sorting to external results
    const sortExternalResults = (items: ExternalSearchResult[]) => {
      const sortedItems = [...items];
      
      switch (sortBy) {
        case "year_desc":
          return sortedItems.sort((a, b) => b.releaseYear - a.releaseYear);
        case "year_asc":
          return sortedItems.sort((a, b) => a.releaseYear - b.releaseYear);
        case "popularity":
        case "rating":
        case "relevance":
        default:
          return sortedItems; // Keep API order (usually by relevance)
      }
    };

    externalResults.movies = sortExternalResults(externalResults.movies);
    externalResults.tv = sortExternalResults(externalResults.tv);
    externalResults.games = sortExternalResults(externalResults.games);
    externalResults.music = sortExternalResults(externalResults.music);

    // Merge results
    const mergedResults: SearchResults = {
      users: localResults.users,
      movies: mergeResults(localResults.movies, externalResults.movies, Math.floor(limit * 0.25)),
      tv: mergeResults(localResults.tv, externalResults.tv, Math.floor(limit * 0.25)),
      games: mergeResults(localResults.games, externalResults.games, Math.floor(limit * 0.25)),
      music: mergeResults(localResults.music, externalResults.music, Math.floor(limit * 0.25)),
      totalResults: 0
    };

    // Trim to requested limit and recalculate total
    const trimToLimit = (items: LocalSearchResult[], maxItems: number) => items.slice(0, maxItems);
    
    const itemsPerType = Math.floor(limit / 4); // Distribute evenly across types
    
    mergedResults.movies = trimToLimit(mergedResults.movies, itemsPerType);
    mergedResults.tv = trimToLimit(mergedResults.tv, itemsPerType);
    mergedResults.games = trimToLimit(mergedResults.games, itemsPerType);
    mergedResults.music = trimToLimit(mergedResults.music, itemsPerType);

    mergedResults.totalResults = Object.values(mergedResults)
      .filter((arr): arr is LocalSearchResult[] => Array.isArray(arr))
      .reduce((total, arr) => total + arr.length, 0);

    return {
      ...mergedResults,
      isFromCache: false
    };
  }
});