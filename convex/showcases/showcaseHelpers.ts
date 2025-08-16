// convex/showcases/showcaseHelpers.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { calculateShowcaseStats, getShowcaseTypeForMedia } from "./showcaseUtils";

/**
 * Get comprehensive showcase data for a user's profile page
 */
export const getProfileShowcaseData = query({
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

    // Get media details for all showcases
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

    // Calculate stats
    const stats = calculateShowcaseStats(user);

    // Check if current user can edit these showcases
    const identity = await ctx.auth.getUserIdentity();
    let canEdit = false;
    
    if (identity) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
      
      canEdit = currentUser?._id === targetUserId;
    }

    return {
      user: {
        _id: user._id,
        username: user.username,
        profileImage: user.profileImage,
        bio: user.bio,
      },
      showcases: {
        movies: topMovies,
        tvShows: topTvShows,
        games: topGames,
        music: topMusic,
      },
      stats,
      canEdit,
    };
  },
});

/**
 * Smart add to showcase - automatically detects the correct showcase type
 */
export const smartAddToShowcase = mutation({
  args: {
    mediaId: v.id("media"),
    position: v.optional(v.number()),
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

    // Get media and determine showcase type
    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("Media not found");
    }

    const showcaseType = getShowcaseTypeForMedia(media);
    
    // Use the existing addToShowcase mutation logic
    const showcaseField = `top${showcaseType.charAt(0).toUpperCase() + showcaseType.slice(1)}` as keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic">;
    const currentShowcase = [...(user[showcaseField] as string[])];

    // Check if already in showcase
    if (currentShowcase.includes(args.mediaId)) {
      throw new Error("Media is already in your showcase");
    }

    // Determine position
    let position = args.position;
    if (position === undefined) {
      position = currentShowcase.length < 4 ? currentShowcase.length : 3;
    }

    if (position < 0 || position > 3) {
      throw new Error("Position must be between 0 and 3");
    }

    // Update showcase array
    if (position < currentShowcase.length) {
      currentShowcase.splice(position, 0, args.mediaId);
    } else {
      currentShowcase.push(args.mediaId);
    }

    const updatedShowcase = currentShowcase.slice(0, 4);

    // Update user
    const updates = { [showcaseField]: updatedShowcase };
    await ctx.db.patch(user._id, updates);

    console.log(`📌 Smart added ${media.title} to ${showcaseType} showcase for user ${user.username}`);
    
    return {
      showcaseType,
      mediaType: media.type,
      mediaTitle: media.title,
      position: updatedShowcase.indexOf(args.mediaId),
      showcaseCount: updatedShowcase.length,
    };
  },
});

/**
 * Batch update multiple showcases at once
 */
export const batchUpdateShowcases = mutation({
  args: {
    updates: v.object({
      movies: v.optional(v.array(v.id("media"))),
      tvShows: v.optional(v.array(v.id("media"))),
      games: v.optional(v.array(v.id("media"))),
      music: v.optional(v.array(v.id("media"))),
    }),
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

    const updateData: any = {};

    // Validate and prepare updates for each showcase type
    for (const [showcaseType, mediaIds] of Object.entries(args.updates)) {
      if (!mediaIds || mediaIds.length === 0) continue;

      if (mediaIds.length > 4) {
        throw new Error(`${showcaseType} showcase cannot have more than 4 items`);
      }

      // Validate media items
      const expectedMediaType = {
        movies: "movie",
        tvShows: "tv",
        games: "game",
        music: "music",
      }[showcaseType] as "movie" | "tv" | "game" | "music";

      for (const mediaId of mediaIds) {
        const media = await ctx.db.get(mediaId);
        if (!media) {
          throw new Error(`Media ${mediaId} not found`);
        }
        if (media.type !== expectedMediaType) {
          throw new Error(`Media ${media.title} is not a ${expectedMediaType}`);
        }
      }

      // Set the update field
      const fieldName = `top${showcaseType.charAt(0).toUpperCase() + showcaseType.slice(1)}`;
      updateData[fieldName] = mediaIds;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error("No valid updates provided");
    }

    // Apply updates
    await ctx.db.patch(user._id, updateData);

    console.log(`🔄 Batch updated showcases for user ${user.username}:`, Object.keys(updateData));
    
    return {
      updatedShowcases: Object.keys(updateData),
      user: user._id,
    };
  },
});

/**
 * Get showcase edit interface data
 * Returns current showcases + search suggestions
 */
export const getShowcaseEditData = query({
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

    // Get current showcase
    const showcaseField = `top${args.showcaseType.charAt(0).toUpperCase() + args.showcaseType.slice(1)}` as keyof typeof user;
    const currentShowcaseIds = (user[showcaseField] as string[]) || [];

    // Get media details for current showcase
    const currentShowcaseMedia = await Promise.all(
      currentShowcaseIds.map(async (id) => {
        const media = await ctx.db.get(id as any);
        return media;
      })
    );

    const validCurrentMedia = currentShowcaseMedia.filter(item => item !== null);

    // Get user's highly rated items in this category for suggestions
    const userLogs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("rating"), 8)) // 4+ star ratings
      .order("desc")
      .take(50);

    const mediaType = {
      movies: "movie",
      tvShows: "tv", 
      games: "game",
      music: "music",
    }[args.showcaseType] as "movie" | "tv" | "game" | "music";

    // Get media details for suggestions
    const suggestionMedia = await Promise.all(
      userLogs.map(async (log) => {
        const media = await ctx.db.get(log.mediaId);
        if (!media || media.type !== mediaType || currentShowcaseIds.includes(media._id)) {
          return null;
        }
        return {
          ...media,
          userRating: log.rating,
          loggedAt: log.loggedAt,
        };
      })
    );

    const validSuggestions = suggestionMedia
      .filter(item => item !== null)
      .sort((a, b) => b!.userRating! - a!.userRating!)
      .slice(0, 12);

    return {
      showcaseType: args.showcaseType,
      currentShowcase: validCurrentMedia,
      availableSlots: 4 - validCurrentMedia.length,
      suggestions: validSuggestions,
      showcaseIsFull: validCurrentMedia.length >= 4,
    };
  },
});

/**
 * Export helper functions (no conflicts with other files)
 */