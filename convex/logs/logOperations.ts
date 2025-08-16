// convex/logs/logOperations.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

// Input validation helpers
function validateRating(rating: number | undefined): boolean {
  if (rating === undefined) return true;
  return rating >= 0 && rating <= 10 && (rating * 2) % 1 === 0; // Allows half stars (0, 0.5, 1, 1.5, etc.)
}

function validateVisibility(visibility: string): boolean {
  return ["public", "followers", "private"].includes(visibility);
}

/**
 * Create a new media log entry
 */
export const createLog = mutation({
  args: {
    mediaId: v.id("media"),
    loggedAt: v.optional(v.number()), // Defaults to now if not provided
    rating: v.optional(v.number()), // 0-10 with 0.5 increments
    review: v.optional(v.string()),
    hasSpoilers: v.optional(v.boolean()),
    visibility: v.string(), // "public" | "followers" | "private"
  },
  handler: async (ctx, args) => {
    // Get current user
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

    // Validate inputs
    if (!validateRating(args.rating)) {
      throw new Error("Rating must be between 0-10 in 0.5 increments");
    }

    if (!validateVisibility(args.visibility)) {
      throw new Error("Visibility must be 'public', 'followers', or 'private'");
    }

    // Verify media exists
    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("Media not found");
    }

    // Check if user already has a log for this media
    const existingLog = await ctx.db
      .query("logs")
      .withIndex("by_user_media", (q) => 
        q.eq("userId", user._id).eq("mediaId", args.mediaId)
      )
      .unique();

    if (existingLog) {
      throw new Error("You already have a log for this media. Use updateLog to modify it.");
    }

    const now = Date.now();
    const loggedAt = args.loggedAt || now;

    // Create the log
    const logId = await ctx.db.insert("logs", {
      userId: user._id,
      mediaId: args.mediaId,
      loggedAt,
      rating: args.rating,
      review: args.review?.trim() || undefined,
      hasSpoilers: args.hasSpoilers || false,
      visibility: args.visibility as "public" | "followers" | "private",
      createdAt: now,
    });

    // If there's a review, create notifications for followers (if public/followers visibility)
    if (args.review && (args.visibility === "public" || args.visibility === "followers")) {
      // We'll handle notifications in a separate function later
      console.log(`📝 Log created with review for ${media.title}`);
    }

    return logId;
  },
});

/**
 * Update an existing media log
 */
export const updateLog = mutation({
  args: {
    logId: v.id("logs"),
    loggedAt: v.optional(v.number()),
    rating: v.optional(v.number()),
    review: v.optional(v.string()),
    hasSpoilers: v.optional(v.boolean()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get current user
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

    // Get the log
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    // Check ownership
    if (log.userId !== user._id) {
      throw new Error("You can only update your own logs");
    }

    // Validate inputs
    if (args.rating !== undefined && !validateRating(args.rating)) {
      throw new Error("Rating must be between 0-10 in 0.5 increments");
    }

    if (args.visibility && !validateVisibility(args.visibility)) {
      throw new Error("Visibility must be 'public', 'followers', or 'private'");
    }

    // Prepare update object
    const updates: any = {};
    
    if (args.loggedAt !== undefined) updates.loggedAt = args.loggedAt;
    if (args.rating !== undefined) updates.rating = args.rating;
    if (args.review !== undefined) updates.review = args.review.trim() || undefined;
    if (args.hasSpoilers !== undefined) updates.hasSpoilers = args.hasSpoilers;
    if (args.visibility !== undefined) updates.visibility = args.visibility;

    // Update the log
    await ctx.db.patch(args.logId, updates);

    console.log(`📝 Log updated for user ${user.username}`);
    return args.logId;
  },
});

/**
 * Delete a media log
 */
export const deleteLog = mutation({
  args: {
    logId: v.id("logs"),
  },
  handler: async (ctx, args) => {
    // Get current user
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

    // Get the log
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    // Check ownership
    if (log.userId !== user._id) {
      throw new Error("You can only delete your own logs");
    }

    // Delete associated comments
    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete associated reactions
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => 
        q.eq("targetType", "log").eq("targetId", args.logId)
      )
      .collect();

    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id);
    }

    // Delete the log
    await ctx.db.delete(args.logId);

    console.log(`🗑️ Log deleted for user ${user.username}`);
    return true;
  },
});

/**
 * Get user's logs with pagination and filtering
 */
export const getUserLogs = query({
  args: {
    userId: v.optional(v.id("users")), // If not provided, gets current user's logs
    mediaType: v.optional(v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()), // For pagination
  },
  handler: async (ctx, args) => {
    const { mediaType, limit = 20 } = args;
    
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

    // Get the target user info
    const targetUser = await ctx.db.get(targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Check if current user can see these logs
    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    const isOwnLogs = currentUser && currentUser._id === targetUserId;
    const isFollowing = currentUser ? await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) => 
        q.eq("followerId", currentUser._id).eq("followingId", targetUserId)
      )
      .unique() : null;

    // Build query
    let query = ctx.db.query("logs").withIndex("by_user", (q) => q.eq("userId", targetUserId));
    
    const logs = await query.order("desc").take(limit + 1); // +1 to check if there are more

    // Filter logs based on visibility
    const filteredLogs = logs.filter(log => {
      if (isOwnLogs) return true; // User can see their own logs
      if (log.visibility === "public") return true;
      if (log.visibility === "followers" && isFollowing) return true;
      return false;
    });

    // Get media info for each log
    const logsWithMedia = await Promise.all(
      filteredLogs.slice(0, limit).map(async (log) => {
        const media = await ctx.db.get(log.mediaId);
        
        // Apply media type filter
        if (mediaType && media?.type !== mediaType) {
          return null;
        }
        
        return {
          ...log,
          media,
        };
      })
    );

    const validLogs = logsWithMedia.filter(log => log !== null);

    return {
      logs: validLogs,
      hasMore: filteredLogs.length > limit,
      nextCursor: validLogs.length > 0 ? validLogs[validLogs.length - 1]._id : null,
    };
  },
});

/**
 * Get a single log with full details
 */
export const getLogDetails = query({
  args: {
    logId: v.id("logs"),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    // Check visibility permissions
    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    const logOwner = await ctx.db.get(log.userId);
    const isOwnLog = currentUser && currentUser._id === log.userId;
    const isFollowing = currentUser ? await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) => 
        q.eq("followerId", currentUser._id).eq("followingId", log.userId)
      )
      .unique() : null;

    // Check if user can see this log
    if (!isOwnLog && log.visibility === "private") {
      throw new Error("Log not found"); // Don't reveal it exists
    }
    
    if (!isOwnLog && log.visibility === "followers" && !isFollowing) {
      throw new Error("Log not found");
    }

    // Get media info
    const media = await ctx.db.get(log.mediaId);

    // Get comments
    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .order("asc")
      .collect();

    // Get comment authors
    const commentsWithAuthors = await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.userId);
        return {
          ...comment,
          author,
        };
      })
    );

    // Get reactions
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => 
        q.eq("targetType", "log").eq("targetId", args.logId)
      )
      .collect();

    // Group reactions by type
    const reactionCounts = reactions.reduce((acc, reaction) => {
      acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Check if current user has reacted
    const userReaction = currentUser ? reactions.find(r => r.userId === currentUser._id) : null;

    return {
      ...log,
      media,
      author: logOwner,
      comments: commentsWithAuthors,
      reactionCounts,
      userReaction: userReaction?.reactionType,
    };
  },
});

/**
 * Get logs for a specific media item
 */
export const getMediaLogs = query({
  args: {
    mediaId: v.id("media"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 20 } = args;

    // Get current user for visibility filtering
    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    // Get all logs for this media
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .order("desc")
      .take(limit + 1);

    // Filter by visibility and add user info
    const visibleLogs = await Promise.all(
      logs.slice(0, limit).map(async (log) => {
        const logOwner = await ctx.db.get(log.userId);
        
        // Check visibility
        const isOwnLog = currentUser && currentUser._id === log.userId;
        if (isOwnLog || log.visibility === "public") {
          return { ...log, author: logOwner };
        }
        
        if (log.visibility === "followers" && currentUser) {
          const isFollowing = await ctx.db
            .query("follows")
            .withIndex("by_relationship", (q) => 
              q.eq("followerId", currentUser._id).eq("followingId", log.userId)
            )
            .unique();
            
          if (isFollowing) {
            return { ...log, author: logOwner };
          }
        }
        
        return null;
      })
    );

    const validLogs = visibleLogs.filter(log => log !== null);

    return {
      logs: validLogs,
      hasMore: logs.length > limit,
    };
  },
});

/**
 * Get user's rating for a specific media (utility function)
 */
export const getUserMediaRating = query({
  args: {
    mediaId: v.id("media"),
    userId: v.optional(v.id("users")), // If not provided, gets current user's rating
  },
  handler: async (ctx, args) => {
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

    const log = await ctx.db
      .query("logs")
      .withIndex("by_user_media", (q) => 
        q.eq("userId", targetUserId).eq("mediaId", args.mediaId)
      )
      .unique();

    return log ? { rating: log.rating, hasReview: !!log.review } : null;
  },
});

// Add this function to the END of your existing convex/logs/logOperations.ts file

/**
 * Get media statistics (for MediaStats component)
 */
export const getMediaStats = query({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    // Get current user for visibility filtering
    const identity = await ctx.auth.getUserIdentity();
    let currentUser = null;
    
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    // Get all logs for this media
    const allLogs = await ctx.db
      .query("logs")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    // Filter by visibility
    const visibleLogs = await Promise.all(
      allLogs.map(async (log) => {
        // Check visibility
        const isOwnLog = currentUser && currentUser._id === log.userId;
        if (isOwnLog || log.visibility === "public") {
          return log;
        }
        
        if (log.visibility === "followers" && currentUser) {
          const isFollowing = await ctx.db
            .query("follows")
            .withIndex("by_relationship", (q) => 
              q.eq("followerId", currentUser._id).eq("followingId", log.userId)
            )
            .unique();
            
          if (isFollowing) {
            return log;
          }
        }
        
        return null;
      })
    );

    const validLogs = visibleLogs.filter(log => log !== null);
    
    const ratingsOnly = validLogs.filter(log => log.rating !== undefined && log.rating > 0);
    const reviewsOnly = validLogs.filter(log => log.review !== undefined && log.review.trim() !== '');
    
    const averageRating = ratingsOnly.length > 0 
      ? ratingsOnly.reduce((sum, log) => sum + (log.rating || 0), 0) / ratingsOnly.length
      : 0;

    return {
      totalLogs: validLogs.length,
      totalReviews: reviewsOnly.length,
      averageRating: Math.round(averageRating * 10) / 10,
    };
  },
});