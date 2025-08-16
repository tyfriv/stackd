// convex/showcases/showcaseOperations.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";

/**
 * Get user's Top 4 showcases with full media details
 */
export const getUserShowcases = query({
  args: {
    userId: v.optional(v.id("users")), // If not provided, gets current user's showcases
  },
  handler: async (ctx, args) => {
    // Get target user (or current user if not specified)
    let targetUserId = args.userId;
    
    if (!targetUserId) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Not authenticated");
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (!user) {
        throw new Error("User not found");
      }
      
      targetUserId = user._id;
    }

    const user = await ctx.db.get(targetUserId);
    if (!user) {
      throw new Error("User not found");
    }

    // Get media details for each showcase
    const getMediaDetails = async (mediaIds: string[]) => {
      const mediaItems = await Promise.all(
        mediaIds.map(async (id) => {
          const media = await ctx.db.get(id as any);
          return media;
        })
      );
      return mediaItems.filter(item => item !== null);
    };

    const [topMovies, topTvShows, topGames, topMusic] = await Promise.all([
      getMediaDetails(user.topMovies),
      getMediaDetails(user.topTvShows),
      getMediaDetails(user.topGames),
      getMediaDetails(user.topMusic),
    ]);

    return {
      topMovies,
      topTvShows,
      topGames,
      topMusic,
    };
  },
});

/**
 * Add media to a specific Top 4 showcase
 */
export const addToShowcase = mutation({
  args: {
    mediaId: v.id("media"),
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    position: v.optional(v.number()), // 0-3, if not provided, adds to next available slot
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify media exists and matches the showcase type
    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("Media not found");
    }

    // Validate media type matches showcase type
    const typeMapping = {
      movies: "movie",
      tvShows: "tv",
      games: "game",
      music: "music",
    };

    if (media.type !== typeMapping[args.showcaseType]) {
      throw new Error(`Media type ${media.type} doesn't match showcase type ${args.showcaseType}`);
    }

    // Get current showcase array
    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic">;
    const currentShowcase = [...(user[showcaseField] as string[])];

    // Check if media is already in showcase
    if (currentShowcase.includes(args.mediaId)) {
      throw new Error("Media is already in your Top 4 showcase");
    }

    // Determine position
    let position = args.position;
    if (position === undefined) {
      // Find next available slot
      position = currentShowcase.length < 4 ? currentShowcase.length : 3;
    }

    // Validate position
    if (position < 0 || position > 3) {
      throw new Error("Position must be between 0 and 3");
    }

    // Update showcase array
    if (position < currentShowcase.length) {
      // Insert at specific position, shift others
      currentShowcase.splice(position, 0, args.mediaId);
    } else {
      // Add to end
      currentShowcase.push(args.mediaId);
    }

    // Ensure we only keep 4 items
    const updatedShowcase = currentShowcase.slice(0, 4);

    // Update user
    const updates = { [showcaseField]: updatedShowcase };
    await ctx.db.patch(user._id, updates);

    console.log(`📌 Added ${media.title} to ${args.showcaseType} showcase for user ${user.username}`);
    return updatedShowcase;
  },
});

/**
 * Remove media from a specific Top 4 showcase
 */
export const removeFromShowcase = mutation({
  args: {
    mediaId: v.id("media"),
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Get current showcase array
    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic">;
    const currentShowcase = [...(user[showcaseField] as string[])];

    // Check if media is in showcase
    const mediaIndex = currentShowcase.indexOf(args.mediaId);
    if (mediaIndex === -1) {
      throw new Error("Media is not in your showcase");
    }

    // Remove media
    currentShowcase.splice(mediaIndex, 1);

    // Update user
    const updates = { [showcaseField]: currentShowcase };
    await ctx.db.patch(user._id, updates);

    console.log(`🗑️ Removed media from ${args.showcaseType} showcase for user ${user.username}`);
    return currentShowcase;
  },
});

/**
 * Reorder showcase items
 */
export const reorderShowcase = mutation({
  args: {
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    newOrder: v.array(v.id("media")), // Array of media IDs in new order
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate new order
    if (args.newOrder.length > 4) {
      throw new Error("Showcase cannot have more than 4 items");
    }

    // Get current showcase array
    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic">;
    const currentShowcase = user[showcaseField] as string[];

    // Validate that all items in newOrder exist in current showcase
    for (const mediaId of args.newOrder) {
      if (!currentShowcase.includes(mediaId)) {
        throw new Error(`Media ${mediaId} is not in your current showcase`);
      }
    }

    // Update user
    const updates = { [showcaseField]: args.newOrder };
    await ctx.db.patch(user._id, updates);

    console.log(`🔄 Reordered ${args.showcaseType} showcase for user ${user.username}`);
    return args.newOrder;
  },
});

/**
 * Replace entire showcase (bulk update)
 */
export const replaceShowcase = mutation({
  args: {
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
    mediaIds: v.array(v.id("media")), // New showcase items
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate array length
    if (args.mediaIds.length > 4) {
      throw new Error("Showcase cannot have more than 4 items");
    }

    // Validate all media items exist and are correct type
    const typeMapping = {
      movies: "movie",
      tvShows: "tv",
      games: "game",
      music: "music",
    };

    const expectedType = typeMapping[args.showcaseType];

    for (const mediaId of args.mediaIds) {
      const media = await ctx.db.get(mediaId);
      if (!media) {
        throw new Error(`Media ${mediaId} not found`);
      }
      if (media.type !== expectedType) {
        throw new Error(`Media ${media.title} is not a ${expectedType}`);
      }
    }

    // Get showcase field name
    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic">;

    // Update user
    const updates = { [showcaseField]: args.mediaIds };
    await ctx.db.patch(user._id, updates);

    console.log(`🔄 Replaced entire ${args.showcaseType} showcase for user ${user.username}`);
    return args.mediaIds;
  },
});

/**
 * Clear entire showcase
 */
export const clearShowcase = mutation({
  args: {
    showcaseType: v.union(v.literal("movies"), v.literal("tvShows"), v.literal("games"), v.literal("music")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Get showcase field name
    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic">;

    // Update user
    const updates = { [showcaseField]: [] };
    await ctx.db.patch(user._id, updates);

    console.log(`🗑️ Cleared ${args.showcaseType} showcase for user ${user.username}`);
    return [];
  },
});

/**
 * Get showcase availability (how many slots are free)
 */
export const getShowcaseAvailability = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get target user (or current user if not specified)
    let targetUserId = args.userId;
    
    if (!targetUserId) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Not authenticated");
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (!user) {
        throw new Error("User not found");
      }
      
      targetUserId = user._id;
    }

    const user = await ctx.db.get(targetUserId);
    if (!user) {
      throw new Error("User not found");
    }

    return {
      movies: {
        current: user.topMovies.length,
        available: 4 - user.topMovies.length,
        isFull: user.topMovies.length >= 4,
      },
      tvShows: {
        current: user.topTvShows.length,
        available: 4 - user.topTvShows.length,
        isFull: user.topTvShows.length >= 4,
      },
      games: {
        current: user.topGames.length,
        available: 4 - user.topGames.length,
        isFull: user.topGames.length >= 4,
      },
      music: {
        current: user.topMusic.length,
        available: 4 - user.topMusic.length,
        isFull: user.topMusic.length >= 4,
      },
    };
  },
});

/**
 * Check if specific media is in any showcase
 */
export const checkMediaInShowcases = query({
  args: {
    mediaId: v.id("media"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get target user (or current user if not specified)
    let targetUserId = args.userId;
    
    if (!targetUserId) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return null;

      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (!user) return null;
      targetUserId = user._id;
    }

    const user = await ctx.db.get(targetUserId);
    if (!user) return null;

    const showcases = {
      movies: user.topMovies.includes(args.mediaId),
      tvShows: user.topTvShows.includes(args.mediaId),
      games: user.topGames.includes(args.mediaId),
      music: user.topMusic.includes(args.mediaId),
    };

    // Find which showcase contains this media
    const inShowcase = Object.entries(showcases).find(([_, isIncluded]) => isIncluded);

    return {
      isInAnyShowcase: !!inShowcase,
      showcaseType: inShowcase ? inShowcase[0] : null,
      showcases,
    };
  },
});