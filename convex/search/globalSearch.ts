// convex/search/globalSearch.ts
import { v } from "convex/values";
import { query, action } from "../_generated/server";
import { api, internal } from "../_generated/api";

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
  handler: async (ctx, args) => {
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
    const results: any = {
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
            // Simple contains search - you might want to add a search index later
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
      if (type === "users") continue; // Skip media if only searching users
      
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
        type: mediaType,
        description: media.description
      }));
    }

    // Calculate total results
    results.totalResults = Object.values(results)
      .filter(arr => Array.isArray(arr))
      .reduce((total: number, arr: any[]) => total + arr.length, 0);

    return results;
  }
});

/**
 * Search with external API integration for new content
 * This would integrate with your existing TMDB/RAWG/Spotify actions
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
  handler: async (ctx, args): Promise<{
    users: any[];
    movies: any[];
    tv: any[];
    games: any[];
    music: any[];
    totalResults: number;
    isFromCache: boolean;
  }> => {
    const { query, type = "all", includeExternal = true } = args;
    
    // First get local cached results with explicit type annotation
    const localResults: {
      users: any[];
      movies: any[];
      tv: any[];
      games: any[];
      music: any[];
      totalResults: number;
    } = await ctx.runQuery(api.search.globalSearch.globalSearch, {
      query,
      type,
      limit: 20
    });

    // If we have enough local results or not including external, return local only
    if (!includeExternal || localResults.totalResults >= 20) {
      return {
        ...localResults,
        isFromCache: true
      };
    }

    // TODO: Integrate with your existing API actions
    // You would call your existing TMDB/RAWG/Spotify search actions here
    // Example:
    // if (type === "all" || type === "movies") {
    //   const tmdbResults = await ctx.runAction(api.tmdb.searchMovies, { query });
    //   // Process and merge results
    // }

    const externalResults = {
      movies: [] as any[],
      tv: [] as any[],
      games: [] as any[],
      music: [] as any[]
    };

    // Merge local and external results
    const mergedResults = {
      users: localResults.users,
      movies: [...localResults.movies, ...externalResults.movies].slice(0, 20),
      tv: [...localResults.tv, ...externalResults.tv].slice(0, 20),
      games: [...localResults.games, ...externalResults.games].slice(0, 20),
      music: [...localResults.music, ...externalResults.music].slice(0, 20),
      totalResults: 0,
      isFromCache: localResults.totalResults === 0 ? false : true
    };

    mergedResults.totalResults = Object.values(mergedResults)
      .filter(arr => Array.isArray(arr))
      .reduce((total: number, arr: any[]) => total + arr.length, 0);

    return mergedResults;
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
      .take(100); // Get more to have a good sample

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
  handler: async (ctx, args): Promise<any> => {
    const media = await ctx.db.get(args.mediaId);
    if (!media) return null;

    // Get basic stats with explicit type annotation
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
      // Would need to add popularity metrics - for now just use recent activity
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