import { v } from "convex/values";
import { internalMutation, internalQuery, query, mutation } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { MediaSearchResult, isCacheValid, mediaDocToSearchResult } from "../lib/apiHelpers";

// Get cached media item by external ID and type
export const getCachedMedia = internalQuery({
  args: { 
    externalId: v.string(), 
    type: v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music"))
  },
  handler: async (ctx, args) => {
    const media = await ctx.db
      .query("media")
      .withIndex("by_external_id_type", (q) => 
        q.eq("externalId", args.externalId).eq("type", args.type)
      )
      .unique();

    // Check if cache is still valid
    if (media && isCacheValid(media.lastUpdated)) {
      return media;
    }

    return null; // Cache miss or expired
  },
});

// Cache a media item from API response
export const cacheMediaItem = internalMutation({
  args: {
    externalId: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music")),
    title: v.string(),
    releaseYear: v.number(),
    posterUrl: v.string(),
    description: v.optional(v.string()),
    artist: v.optional(v.string()),
    season: v.optional(v.number()),
    rawData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if already exists
    const existing = await ctx.db
      .query("media")
      .withIndex("by_external_id_type", (q) => 
        q.eq("externalId", args.externalId).eq("type", args.type)
      )
      .unique();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        title: args.title,
        releaseYear: args.releaseYear,
        posterUrl: args.posterUrl,
        description: args.description,
        artist: args.artist,
        season: args.season,
        rawData: args.rawData,
        lastUpdated: now,
      });
      return existing._id;
    } else {
      // Create new record
      return await ctx.db.insert("media", {
        externalId: args.externalId,
        type: args.type,
        title: args.title,
        releaseYear: args.releaseYear,
        posterUrl: args.posterUrl,
        description: args.description,
        artist: args.artist,
        season: args.season,
        rawData: args.rawData,
        lastUpdated: now,
      });
    }
  },
});

// Search cached media by title (for user showcase selection)
export const searchCachedMedia = query({
  args: { 
    query: v.string(),
    type: v.optional(v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music"))),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    // SECURITY FIX: Validate search input, but allow empty for internal API cache checks
    const trimmedQuery = args.query.trim();
    
    if (trimmedQuery.length === 0) {
      return []; // Return empty results for empty queries
    }
    
    if (trimmedQuery.length < 2) {
      throw new Error("Search query must be at least 2 characters");
    }
    
    if (args.query.length > 100) {
      throw new Error("Search query too long");
    }

    const limit = Math.min(Math.max(args.limit || 10, 1), 50); // Clamp between 1-50
    
    let searchQuery = ctx.db.query("media").withSearchIndex("search_title", (q) => 
      q.search("title", trimmedQuery)
    );

    if (args.type) {
      searchQuery = searchQuery.filter((q) => q.eq(q.field("type"), args.type));
    }

    const results = await searchQuery.take(limit);
    
    return results.map(mediaDocToSearchResult);
  },
});

// Get media by ID (internal - for actions calling from TMDB/RAWG/Spotify)
export const getMediaById = internalQuery({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.mediaId);
  },
});

// Get media by ID (public - for displaying in logs, reviews, etc.)
export const getMediaByIdPublic = query({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.mediaId);
  },
});

// Get multiple media items by IDs (for Top 4 showcases)
export const getMediaByIds = query({
  args: { mediaIds: v.array(v.id("media")) },
  handler: async (ctx, args) => {
    const mediaItems = await Promise.all(
      args.mediaIds.map(id => ctx.db.get(id))
    );
    
    // Filter out null results (deleted media)
    return mediaItems.filter((item): item is Doc<"media"> => item !== null);
  },
});

// Get media by external ID (public query for dynamic pages)
export const getMediaByExternalId = query({
  args: { 
    externalId: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music"))
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("media")
      .withIndex("by_external_id_type", (q) => 
        q.eq("externalId", args.externalId).eq("type", args.type)
      )
      .unique();
  },
});

// Clean up expired cache entries (run periodically)
export const cleanExpiredCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const expiredItems = await ctx.db
      .query("media")
      .filter((q) => q.lt(q.field("lastUpdated"), oneDayAgo))
      .take(100); // Process in batches
    
    for (const item of expiredItems) {
      // Only delete if no logs reference this media
      const hasLogs = await ctx.db
        .query("logs")
        .withIndex("by_media", (q) => q.eq("mediaId", item._id))
        .first();
      
      if (!hasLogs) {
        await ctx.db.delete(item._id);
      }
    }
    
    return expiredItems.length;
  },
});



// Helper function to get or create media item from search result
export const getOrCreateMediaFromSearch = mutation({
  args: {
    externalId: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music")),
    title: v.string(),
    releaseYear: v.number(),
    posterUrl: v.string(),
    description: v.optional(v.string()),
    artist: v.optional(v.string()),
    season: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // First check if it exists
    const existing = await ctx.db
      .query("media")
      .withIndex("by_external_id_type", (q) => 
        q.eq("externalId", args.externalId).eq("type", args.type)
      )
      .unique();

    if (existing) {
      return existing;
    }

    // Create new media item
    const mediaId = await ctx.db.insert("media", {
      externalId: args.externalId,
      type: args.type,
      title: args.title,
      releaseYear: args.releaseYear,
      posterUrl: args.posterUrl,
      description: args.description,
      artist: args.artist,
      season: args.season,
      lastUpdated: Date.now(),
    });

    return await ctx.db.get(mediaId);
  },
});