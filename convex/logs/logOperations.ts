// convex/logs/logOperations.ts
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { StackdError } from "../lib/errors";
import { 
  sanitizeReview, 
  validateRating, 
  validateVisibility,
  containsBlockedContent 
} from "../lib/validation";

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
      throw new StackdError("Not authenticated", "AUTH_ERROR", 401);
    }

    // SECURITY FIX: Add rate limiting for log creation
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: `create_log_${identity.subject}`,
      limit: 20, // 20 logs per hour
      windowMs: 60 * 60 * 1000
    });

    if (!rateLimitAllowed) {
      throw new StackdError("Rate limit exceeded for log creation", "RATE_LIMITED", 429);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new StackdError("User not found", "USER_NOT_FOUND", 404);
    }

    // Validate and sanitize inputs
    if (!validateRating(args.rating)) {
      throw new StackdError("Rating must be between 0-10 in 0.5 increments", "VALIDATION_ERROR");
    }

    if (!validateVisibility(args.visibility)) {
      throw new StackdError("Visibility must be 'public', 'followers', or 'private'", "VALIDATION_ERROR");
    }

    // Sanitize review content
    let sanitizedReview: string | undefined;
    if (args.review) {
      try {
        sanitizedReview = sanitizeReview(args.review);
        
        // Check for blocked content
        if (containsBlockedContent(sanitizedReview)) {
          throw new StackdError("Review contains inappropriate content", "CONTENT_BLOCKED");
        }
        
        // Don't store empty reviews
        if (sanitizedReview.trim().length === 0) {
          sanitizedReview = undefined;
        }
      } catch (error) {
        if (error instanceof StackdError) {
          throw error;
        }
        throw new StackdError("Invalid review content", "VALIDATION_ERROR");
      }
    }

    // Verify media exists
    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new StackdError("Media not found", "MEDIA_NOT_FOUND", 404);
    }

    // Check if user already has a log for this media
    const existingLog = await ctx.db
      .query("logs")
      .withIndex("by_user_media", (q) => 
        q.eq("userId", user._id).eq("mediaId", args.mediaId)
      )
      .unique();

    if (existingLog) {
      throw new StackdError("You already have a log for this media. Use updateLog to modify it.", "DUPLICATE_LOG");
    }

    const now = Date.now();
    const loggedAt = args.loggedAt || now;

    // Validate loggedAt is not in the future
    if (loggedAt > now + (24 * 60 * 60 * 1000)) { // Allow up to 24 hours in future for timezone differences
      throw new StackdError("Log date cannot be more than 24 hours in the future", "VALIDATION_ERROR");
    }

    // Create the log
    const logId = await ctx.db.insert("logs", {
      userId: user._id,
      mediaId: args.mediaId,
      loggedAt,
      rating: args.rating,
      review: sanitizedReview,
      hasSpoilers: args.hasSpoilers || false,
      visibility: args.visibility as "public" | "followers" | "private",
      createdAt: now,
    });

    // If there's a review, create notifications for followers (if public/followers visibility)
    if (sanitizedReview && (args.visibility === "public" || args.visibility === "followers")) {
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
      throw new StackdError("Not authenticated", "AUTH_ERROR", 401);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new StackdError("User not found", "USER_NOT_FOUND", 404);
    }

    // Get the log
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new StackdError("Log not found", "LOG_NOT_FOUND", 404);
    }

    // Check ownership
    if (log.userId !== user._id) {
      throw new StackdError("You can only update your own logs", "UNAUTHORIZED", 403);
    }

    // Validate inputs
    if (args.rating !== undefined && !validateRating(args.rating)) {
      throw new StackdError("Rating must be between 0-10 in 0.5 increments", "VALIDATION_ERROR");
    }

    if (args.visibility && !validateVisibility(args.visibility)) {
      throw new StackdError("Visibility must be 'public', 'followers', or 'private'", "VALIDATION_ERROR");
    }

    // Validate loggedAt if provided
    if (args.loggedAt !== undefined) {
      const now = Date.now();
      if (args.loggedAt > now + (24 * 60 * 60 * 1000)) {
        throw new StackdError("Log date cannot be more than 24 hours in the future", "VALIDATION_ERROR");
      }
    }

    // Prepare update object
    const updates: any = {};
    
    if (args.loggedAt !== undefined) updates.loggedAt = args.loggedAt;
    if (args.rating !== undefined) updates.rating = args.rating;
    if (args.hasSpoilers !== undefined) updates.hasSpoilers = args.hasSpoilers;
    if (args.visibility !== undefined) updates.visibility = args.visibility;

    // Handle review update with sanitization
    if (args.review !== undefined) {
      if (args.review.length === 0) {
        updates.review = undefined;
      } else {
        try {
          const sanitizedReview = sanitizeReview(args.review);
          
          // Check for blocked content
          if (containsBlockedContent(sanitizedReview)) {
            throw new StackdError("Review contains inappropriate content", "CONTENT_BLOCKED");
          }
          
          updates.review = sanitizedReview.trim() || undefined;
        } catch (error) {
          if (error instanceof StackdError) {
            throw error;
          }
          throw new StackdError("Invalid review content", "VALIDATION_ERROR");
        }
      }
    }

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
      throw new StackdError("Not authenticated", "AUTH_ERROR", 401);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new StackdError("User not found", "USER_NOT_FOUND", 404);
    }

    // Get the log
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new StackdError("Log not found", "LOG_NOT_FOUND", 404);
    }

    // Check ownership
    if (log.userId !== user._id) {
      throw new StackdError("You can only delete your own logs", "UNAUTHORIZED", 403);
    }

    // Delete associated comments (with proper cleanup)
    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .collect();

    // Use transaction-like approach for cleanup
    const deletePromises = [];

    for (const comment of comments) {
      deletePromises.push(ctx.db.delete(comment._id));
    }

    // Delete associated reactions
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => 
        q.eq("targetType", "log").eq("targetId", args.logId)
      )
      .collect();

    for (const reaction of reactions) {
      deletePromises.push(ctx.db.delete(reaction._id));
    }

    // Delete associated notifications
    const notifications = await ctx.db
      .query("notifications")
      .filter((q) => 
        q.and(
          q.eq(q.field("targetType"), "log"),
          q.eq(q.field("targetId"), args.logId)
        )
      )
      .collect();

    for (const notification of notifications) {
      deletePromises.push(ctx.db.delete(notification._id));
    }

    // Execute all deletions
    await Promise.all(deletePromises);

    // Delete the log last
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
    let { mediaType, limit = 20 } = args;
    
    // SECURITY FIX: Validate and sanitize limit with additional checks
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20; // Default fallback
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50); // Between 1 and 50, integers only
    
    // Get target user (or current user if not specified)
    let targetUserId = args.userId;
    
    if (!targetUserId) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new StackdError("Not authenticated", "AUTH_ERROR", 401);
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (!user) {
        throw new StackdError("User not found", "USER_NOT_FOUND", 404);
      }
      
      targetUserId = user._id;
    }

    // Get the target user info
    const targetUser = await ctx.db.get(targetUserId);
    if (!targetUser) {
      throw new StackdError("Target user not found", "USER_NOT_FOUND", 404);
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

    // Build query with improved pagination
    let query = ctx.db.query("logs").withIndex("by_user", (q) => q.eq("userId", targetUserId));
    
    const logs = await query.order("desc").take(limit + 1); // +1 to check if there are more

    // Filter logs based on visibility with improved performance
    const visibleLogs = [];
    for (const log of logs) {
      if (isOwnLogs || log.visibility === "public" || (log.visibility === "followers" && isFollowing)) {
        visibleLogs.push(log);
        if (visibleLogs.length >= limit) break; // Early termination
      }
    }

    // PERFORMANCE FIX: Batch media loading with optimized queries
    const mediaIds = [...new Set(visibleLogs.map(log => log.mediaId))];
    const mediaLookups = await Promise.all(mediaIds.map(id => ctx.db.get(id)));
    const mediaMap = new Map();
    mediaLookups.forEach((media, i) => {
      if (media) mediaMap.set(mediaIds[i], media);
    });

    const logsWithMedia = visibleLogs.map((log) => {
      const media = mediaMap.get(log.mediaId);
      
      // Apply media type filter
      if (mediaType && media?.type !== mediaType) {
        return null;
      }
      
      return {
        ...log,
        media,
      };
    }).filter(log => log !== null);

    return {
      logs: logsWithMedia,
      hasMore: logs.length > limit,
      nextCursor: logsWithMedia.length > 0 ? logsWithMedia[logsWithMedia.length - 1]._id : null,
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
      throw new StackdError("Log not found", "LOG_NOT_FOUND", 404);
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

    // Check if user can see this log
    if (!isOwnLog && log.visibility === "private") {
      throw new StackdError("Log not found", "LOG_NOT_FOUND", 404); // Don't reveal it exists
    }
    
    if (!isOwnLog && log.visibility === "followers") {
      const isFollowing = currentUser ? await ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", currentUser._id).eq("followingId", log.userId)
        )
        .unique() : null;
        
      if (!isFollowing) {
        throw new StackdError("Log not found", "LOG_NOT_FOUND", 404);
      }
    }

    // Get media info
    const media = await ctx.db.get(log.mediaId);

    // Get comments with batch loading
    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .order("asc")
      .collect();

    // Get comment authors in batch
    const commentUserIds = [...new Set(comments.map(c => c.userId))];
    const commentUsers = await Promise.all(commentUserIds.map(id => ctx.db.get(id)));
    const userMap = new Map();
    commentUsers.forEach((user, i) => {
      if (user) userMap.set(commentUserIds[i], user);
    });

    const commentsWithAuthors = comments.map((comment) => ({
      ...comment,
      author: userMap.get(comment.userId),
    }));

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
    let { limit = 20 } = args;
    
    // SECURITY FIX: Validate and sanitize limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50); // Between 1 and 50, integers only

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

    // Get all user IDs for batch loading
    const userIds = [...new Set(logs.slice(0, limit).map(log => log.userId))];
    const users = await Promise.all(userIds.map(id => ctx.db.get(id)));
    const userMap = new Map();
    users.forEach((user, i) => {
      if (user) userMap.set(userIds[i], user);
    });

    // PERFORMANCE FIX: Batch follow relationship checks
    const followingRelations = currentUser ? await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect() : [];
    
    const followingIds = new Set(followingRelations.map(f => f.followingId));

    // Filter by visibility and add user info
    const visibleLogs = logs.slice(0, limit).map((log) => {
      const logOwner = userMap.get(log.userId);
      
      // Check visibility
      const isOwnLog = currentUser && currentUser._id === log.userId;
      if (isOwnLog || log.visibility === "public") {
        return { ...log, author: logOwner };
      }
      
      if (log.visibility === "followers" && followingIds.has(log.userId)) {
        return { ...log, author: logOwner };
      }
      
      return null;
    }).filter(log => log !== null);

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

    // Filter by visibility with batch user loading for followers check
    const logUserIds = [...new Set(allLogs.map(log => log.userId))];
    const followingRelations = currentUser ? await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect() : [];
    
    const followingIds = new Set(followingRelations.map(f => f.followingId));

    const visibleLogs = allLogs.filter(log => {
      const isOwnLog = currentUser && currentUser._id === log.userId;
      if (isOwnLog || log.visibility === "public") {
        return true;
      }
      if (log.visibility === "followers" && followingIds.has(log.userId)) {
        return true;
      }
      return false;
    });
    
    const ratingsOnly = visibleLogs.filter(log => log.rating !== undefined && log.rating > 0);
    const reviewsOnly = visibleLogs.filter(log => log.review !== undefined && log.review.trim() !== '');
    
    const averageRating = ratingsOnly.length > 0 
      ? ratingsOnly.reduce((sum, log) => sum + (log.rating || 0), 0) / ratingsOnly.length
      : 0;

    return {
      totalLogs: visibleLogs.length,
      totalReviews: reviewsOnly.length,
      averageRating: Math.round(averageRating * 10) / 10,
    };
  },
});