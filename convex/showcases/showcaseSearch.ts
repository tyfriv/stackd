// convex/showcases/showcaseSearch.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { SHOWCASE_TO_MEDIA_TYPE } from "./showcaseUtils";
import type { ShowcaseType } from "./showcaseUtils";

/**
 * Search for media items that can be added to a specific showcase
 * This searches both cached media and can be extended to search external APIs
 */
export const searchForShowcase = query({
  args: {
    query: v.string(),
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { query, showcaseType, limit = 20 } = args;
    
    // Get the media type that matches this showcase
    const mediaType = SHOWCASE_TO_MEDIA_TYPE[showcaseType as ShowcaseType];
    
    // Get current user to check what's already in their showcase
    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    let currentShowcase: string[] = [];
    
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
        
      if (currentUser) {
        const showcaseField = `top${showcaseType.charAt(0).toUpperCase() + showcaseType.slice(1)}` as keyof typeof currentUser;
        currentShowcase = (currentUser[showcaseField] as string[]) || [];
      }
    }
    
    // Search cached media items
    let searchResults = await ctx.db
      .query("media")
      .withSearchIndex("search_title", (q) => q.search("title", query))
      .filter((q) => q.eq(q.field("type"), mediaType))
      .take(limit * 2); // Get more results to filter out duplicates

    // If no results from title search, try a broader search by type
    if (searchResults.length === 0) {
      searchResults = await ctx.db
        .query("media")
        .withIndex("by_type", (q) => q.eq("type", mediaType))
        .filter((q) => 
          q.or(
            q.gte(q.field("title"), query),
            q.lte(q.field("title"), query + "\uffff")
          )
        )
        .take(limit * 2);
    }

    // Format results with additional showcase-specific info
    const formattedResults = searchResults
      .slice(0, limit)
      .map((media) => ({
        ...media,
        isInCurrentShowcase: currentShowcase.includes(media._id),
        canAddToShowcase: !currentShowcase.includes(media._id) && currentShowcase.length < 4,
      }));

    return {
      results: formattedResults,
      showcaseType,
      mediaType,
      currentShowcaseCount: currentShowcase.length,
      showcaseIsFull: currentShowcase.length >= 4,
    };
  },
});

/**
 * Get popular/recommended media for a showcase type
 * This can help users discover items to add to their showcases
 */
export const getShowcaseRecommendations = query({
  args: {
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { showcaseType, limit = 12 } = args;
    const mediaType = SHOWCASE_TO_MEDIA_TYPE[showcaseType as ShowcaseType];
    
    // Get current user's showcase to exclude items already added
    const identity = await ctx.auth.getUserIdentity();
    let currentShowcase: string[] = [];
    
    if (identity) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
        
      if (currentUser) {
        const showcaseField = `top${showcaseType.charAt(0).toUpperCase() + showcaseType.slice(1)}` as keyof typeof currentUser;
        currentShowcase = (currentUser[showcaseField] as string[]) || [];
      }
    }
    
    // Get media items of the correct type, ordered by recency or popularity
    // For now, we'll order by most recent, but this could be enhanced with popularity metrics
    const mediaItems = await ctx.db
      .query("media")
      .withIndex("by_type", (q) => q.eq("type", mediaType))
      .filter((q) => {
        // Exclude items already in user's showcase
        if (currentShowcase.length > 0) {
          return q.not(
            q.or(
              ...currentShowcase.map(id => q.eq(q.field("_id"), id))
            )
          );
        }
        return q.eq(q.field("_id"), q.field("_id")); // No filter if no showcase items
      })
      .order("desc")
      .take(limit);

    return {
      recommendations: mediaItems.map((media) => ({
        ...media,
        isInCurrentShowcase: false, // Already filtered out
        canAddToShowcase: currentShowcase.length < 4,
      })),
      showcaseType,
      mediaType,
      currentShowcaseCount: currentShowcase.length,
    };
  },
});

/**
 * Get recently added media that could be added to showcase
 */
export const getRecentMediaForShowcase = query({
  args: {
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { showcaseType, limit = 10 } = args;
    const mediaType = SHOWCASE_TO_MEDIA_TYPE[showcaseType as ShowcaseType];
    
    // Get current user's showcase
    const identity = await ctx.auth.getUserIdentity();
    let currentShowcase: string[] = [];
    
    if (identity) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
        
      if (currentUser) {
        const showcaseField = `top${showcaseType.charAt(0).toUpperCase() + showcaseType.slice(1)}` as keyof typeof currentUser;
        currentShowcase = (currentUser[showcaseField] as string[]) || [];
      }
    }
    
    // Get recently cached media items
    const recentMedia = await ctx.db
      .query("media")
      .withIndex("by_type", (q) => q.eq("type", mediaType))
      .order("desc")
      .take(limit * 2);
    
    // Filter out items already in showcase and limit results
    const filteredMedia = recentMedia
      .filter(media => !currentShowcase.includes(media._id))
      .slice(0, limit);

    return {
      recentMedia: filteredMedia.map((media) => ({
        ...media,
        isInCurrentShowcase: false,
        canAddToShowcase: currentShowcase.length < 4,
      })),
      showcaseType,
      mediaType,
    };
  },
});

/**
 * Get media from user's logs that could be added to showcase
 * This suggests items the user has already logged/rated
 */
export const getLoggedMediaForShowcase = query({
  args: {
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { showcaseType, limit = 20 } = args;
    const mediaType = SHOWCASE_TO_MEDIA_TYPE[showcaseType as ShowcaseType];
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        loggedMedia: [],
        showcaseType,
        mediaType,
        message: "Not authenticated",
      };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return {
        loggedMedia: [],
        showcaseType,
        mediaType,
        message: "User not found",
      };
    }

    // Get current showcase
    const showcaseField = `top${showcaseType.charAt(0).toUpperCase() + showcaseType.slice(1)}` as keyof typeof currentUser;
    const currentShowcase = (currentUser[showcaseField] as string[]) || [];

    // Get user's logs for this media type
    const userLogs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .order("desc")
      .take(100); // Get more logs to filter

    // Get media details for logs and filter by type
    const loggedMediaWithDetails = await Promise.all(
      userLogs.map(async (log) => {
        const media = await ctx.db.get(log.mediaId);
        if (!media || media.type !== mediaType) {
          return null;
        }
        
        // Skip if already in showcase
        if (currentShowcase.includes(media._id)) {
          return null;
        }

        return {
          ...media,
          userRating: log.rating,
          loggedAt: log.loggedAt,
          hasReview: !!log.review,
          isInCurrentShowcase: false,
          canAddToShowcase: currentShowcase.length < 4,
        };
      })
    );

    // Filter null values and sort by rating (highest first), then by logged date
    const validLoggedMedia = loggedMediaWithDetails
      .filter((item) => item !== null)
      .sort((a, b) => {
        // First sort by rating (highest first)
        if (a!.userRating && b!.userRating) {
          if (a!.userRating !== b!.userRating) {
            return b!.userRating - a!.userRating;
          }
        } else if (a!.userRating && !b!.userRating) {
          return -1;
        } else if (!a!.userRating && b!.userRating) {
          return 1;
        }
        
        // Then sort by logged date (most recent first)
        return b!.loggedAt - a!.loggedAt;
      })
      .slice(0, limit);

    return {
      loggedMedia: validLoggedMedia,
      showcaseType,
      mediaType,
      currentShowcaseCount: currentShowcase.length,
      showcaseIsFull: currentShowcase.length >= 4,
    };
  },
});

/**
 * Quick add media to showcase (combines search and add)
 */
export const quickAddToShowcase = query({
  args: {
    mediaId: v.id("media"),
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
  },
  handler: async (ctx, args) => {
    // Verify media exists and is correct type
    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      return { canAdd: false, reason: "Media not found" };
    }

    const expectedMediaType = SHOWCASE_TO_MEDIA_TYPE[args.showcaseType as ShowcaseType];
    if (media.type !== expectedMediaType) {
      return { 
        canAdd: false, 
        reason: `Media type ${media.type} doesn't match showcase type ${args.showcaseType}` 
      };
    }

    // Check user's current showcase
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canAdd: false, reason: "Not authenticated" };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return { canAdd: false, reason: "User not found" };
    }

    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof typeof currentUser;
    const currentShowcase = (currentUser[showcaseField] as string[]) || [];

    // Check if already in showcase
    if (currentShowcase.includes(args.mediaId)) {
      return { canAdd: false, reason: "Already in showcase" };
    }

    // Check if showcase is full
    if (currentShowcase.length >= 4) {
      return { canAdd: false, reason: "Showcase is full (4 items maximum)" };
    }

    return {
      canAdd: true,
      media,
      currentPosition: currentShowcase.length,
      showcaseInfo: {
        type: args.showcaseType,
        currentCount: currentShowcase.length,
        availableSlots: 4 - currentShowcase.length,
      },
    };
  },
});