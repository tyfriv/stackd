// convex/search/searchHelpers.ts
import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

/**
 * Helper to track popular searches for analytics/trending
 */
export const trackSearch = internalMutation({
  args: {
    query: v.string(),
    userId: v.optional(v.id("users")),
    resultCount: v.number(),
    searchType: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // You could create a searches table to track analytics
    // For now, just log it
    console.log(`🔍 Search: "${args.query}" by user ${args.userId}, ${args.resultCount} results`);
  }
});

/**
 * Get popular search terms (could be used for search suggestions)
 */
export const getPopularSearches = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // This would query a searches tracking table if you implement one
    // For now, return popular media based on recent logs
    const recentLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .order("desc")
      .take(50);

    const mediaIds = [...new Set(recentLogs.map(log => log.mediaId))];
    const popularMedia = await Promise.all(
      mediaIds.slice(0, args.limit || 10).map(async (mediaId) => {
        const media = await ctx.db.get(mediaId);
        return media?.title;
      })
    );

    return popularMedia.filter(Boolean);
  }
});

/**
 * Search result types for type safety
 */
export type SearchResult = {
  _id: string;
  type: "user" | "movie" | "tv" | "game" | "music";
  title?: string;
  username?: string;
  releaseYear?: number;
  posterUrl?: string;
  profileImage?: string;
  artist?: string;
  bio?: string;
  description?: string;
};

export type SearchResults = {
  users: SearchResult[];
  movies: SearchResult[];
  tv: SearchResult[];
  games: SearchResult[];
  music: SearchResult[];
  totalResults: number;
  isFromCache?: boolean;
};

/**
 * Utility to format search results consistently
 */
export const formatSearchResults = (results: any): SearchResults => {
  return {
    users: results.users || [],
    movies: results.movies || [],
    tv: results.tv || [],
    games: results.games || [],
    music: results.music || [],
    totalResults: results.totalResults || 0,
    isFromCache: results.isFromCache || false
  };
};