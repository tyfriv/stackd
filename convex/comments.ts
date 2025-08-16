// convex/comments.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { notifyComment } from "./lib/notificationHelpers";

// Create a comment on a review/log
export const createComment = mutation({
  args: {
    logId: v.id("logs"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get current user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate log exists and check visibility
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    // Check if user can interact with the log owner (not blocked)
    if (log.userId !== user._id) {
      const [isBlocked, isBlockedBy] = await Promise.all([
        ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", user._id))
          .filter((q) => q.eq(q.field("blockedId"), log.userId))
          .unique(),
        ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", log.userId))
          .filter((q) => q.eq(q.field("blockedId"), user._id))
          .unique(),
      ]);

      if (isBlocked || isBlockedBy) {
        throw new Error("Cannot comment on this review");
      }

      // Check visibility permissions
      if (log.visibility === "private") {
        throw new Error("Cannot comment on private review");
      }

      if (log.visibility === "followers") {
        const followRelationship = await ctx.db
          .query("follows")
          .withIndex("by_relationship", (q) =>
            q.eq("followerId", user._id).eq("followingId", log.userId)
          )
          .unique();

        if (!followRelationship) {
          throw new Error("Cannot comment on this review");
        }
      }
    }

    // Validate content length
    if (args.content.trim().length === 0) {
      throw new Error("Comment cannot be empty");
    }

    if (args.content.length > 1000) {
      throw new Error("Comment too long (max 1000 characters)");
    }

    // Create the comment
    const commentId = await ctx.db.insert("reviewComments", {
      logId: args.logId,
      userId: user._id,
      content: args.content.trim(),
      createdAt: Date.now(),
    });

    // Create notification for log owner (if not commenting on own log)
    if (log.userId !== user._id) {
      await notifyComment(ctx, log.userId, user._id, args.logId, args.content.trim());
    }

    return commentId;
  },
});

// Get comments for a review/log
export const getLogComments = query({
  args: {
    logId: v.id("logs"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // Get the log to check visibility
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    // Check if current user can see this log
    let canSee = false;

    if (log.visibility === "public") {
      canSee = true;
    } else if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (user) {
        // Owner can always see their own content
        if (user._id === log.userId) {
          canSee = true;
        } else if (log.visibility === "followers") {
          // Check if user follows the log owner
          const followRelationship = await ctx.db
            .query("follows")
            .withIndex("by_relationship", (q) =>
              q.eq("followerId", user._id).eq("followingId", log.userId)
            )
            .unique();

          if (followRelationship) {
            // Also check no blocking relationship exists
            const [isBlocked, isBlockedBy] = await Promise.all([
              ctx.db
                .query("blocks")
                .withIndex("by_blocker", (q) => q.eq("blockerId", user._id))
                .filter((q) => q.eq(q.field("blockedId"), log.userId))
                .unique(),
              ctx.db
                .query("blocks")
                .withIndex("by_blocker", (q) => q.eq("blockerId", log.userId))
                .filter((q) => q.eq(q.field("blockedId"), user._id))
                .unique(),
            ]);

            canSee = !isBlocked && !isBlockedBy;
          }
        }
      }
    }

    if (!canSee) {
      throw new Error("Cannot view comments on this review");
    }

    // Get comments
    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .order("asc") // Show oldest first
      .take(args.limit || 50);

    // Get user details for each comment
    const commentsWithUsers = await Promise.all(
      comments.map(async (comment) => {
        const user = await ctx.db.get(comment.userId);
        return {
          ...comment,
          user: user ? {
            _id: user._id,
            username: user.username,
            profileImage: user.profileImage,
          } : null,
        };
      })
    );

    return commentsWithUsers;
  },
});

// Update a comment
export const updateComment = mutation({
  args: {
    commentId: v.id("reviewComments"),
    content: v.string(),
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

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    // Only comment owner can update
    if (comment.userId !== user._id) {
      throw new Error("Not authorized to update this comment");
    }

    // Validate content
    if (args.content.trim().length === 0) {
      throw new Error("Comment cannot be empty");
    }

    if (args.content.length > 1000) {
      throw new Error("Comment too long (max 1000 characters)");
    }

    await ctx.db.patch(args.commentId, {
      content: args.content.trim(),
    });

    return { success: true };
  },
});

// Delete a comment
export const deleteComment = mutation({
  args: {
    commentId: v.id("reviewComments"),
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

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    // Check if user can delete (comment owner or log owner)
    const log = await ctx.db.get(comment.logId);
    const canDelete = comment.userId === user._id || (log && log.userId === user._id);

    if (!canDelete) {
      throw new Error("Not authorized to delete this comment");
    }

    await ctx.db.delete(args.commentId);
    return { success: true };
  },
});

// Get comments count for a log
export const getLogCommentsCount = query({
  args: {
    logId: v.id("logs"),
  },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .collect();

    return comments.length;
  },
});

// Get user's recent comments
export const getUserRecentComments = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    let targetUserId = args.userId;
    
    if (!targetUserId) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
      
      if (!currentUser) {
        throw new Error("User not found");
      }
      targetUserId = currentUser._id;
    }

    const comments = await ctx.db
      .query("reviewComments")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(args.limit || 20);

    // Get log details for each comment
    const commentsWithDetails = await Promise.all(
      comments.map(async (comment) => {
        const log = await ctx.db.get(comment.logId);
        let logDetails = null;

        if (log) {
          const media = await ctx.db.get(log.mediaId);
          const logOwner = await ctx.db.get(log.userId);
          
          logDetails = {
            title: media?.title,
            rating: log.rating,
            logOwner: logOwner?.username,
            visibility: log.visibility,
          };
        }

        return {
          ...comment,
          logDetails,
        };
      })
    );

    return commentsWithDetails.filter(c => c.logDetails !== null);
  },
});