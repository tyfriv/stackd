// convex/reactions.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Toggle a reaction (add if not exists, remove if exists, or change type)
export const toggleReaction = mutation({
  args: {
    targetType: v.union(v.literal("log"), v.literal("thread"), v.literal("reply")),
    targetId: v.string(),
    reactionType: v.union(v.literal("like"), v.literal("laugh"), v.literal("angry")),
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

    // Validate target exists
    let targetExists = false;
    if (args.targetType === "log") {
      const log = await ctx.db.get(args.targetId as Id<"logs">);
      targetExists = !!log;
    } else if (args.targetType === "thread") {
      const thread = await ctx.db.get(args.targetId as Id<"forumThreads">);
      targetExists = !!thread;
    } else if (args.targetType === "reply") {
      const reply = await ctx.db.get(args.targetId as Id<"forumReplies">);
      targetExists = !!reply;
    }

    if (!targetExists) {
      throw new Error("Target not found");
    }

    // Check if user already has a reaction on this target
    const existingReaction = await ctx.db
      .query("reactions")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", user._id).eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .unique();

    if (existingReaction) {
      if (existingReaction.reactionType === args.reactionType) {
        // Remove reaction if it's the same type
        await ctx.db.delete(existingReaction._id);
        return { action: "removed", reactionType: args.reactionType };
      } else {
        // Update reaction type
        await ctx.db.patch(existingReaction._id, {
          reactionType: args.reactionType,
          createdAt: Date.now(),
        });
        return { action: "updated", reactionType: args.reactionType };
      }
    } else {
      // Create new reaction
      await ctx.db.insert("reactions", {
        userId: user._id,
        targetType: args.targetType,
        targetId: args.targetId,
        reactionType: args.reactionType,
        createdAt: Date.now(),
      });
      return { action: "added", reactionType: args.reactionType };
    }
  },
});

// Get reaction counts for a target
export const getReactionCounts = query({
  args: {
    targetType: v.union(v.literal("log"), v.literal("thread"), v.literal("reply")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .collect();

    const counts = {
      like: 0,
      laugh: 0,
      angry: 0,
      total: reactions.length,
    };

    reactions.forEach((reaction) => {
      counts[reaction.reactionType]++;
    });

    return counts;
  },
});

// Get user's reaction on a specific target
export const getUserReaction = query({
  args: {
    targetType: v.union(v.literal("log"), v.literal("thread"), v.literal("reply")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    const reaction = await ctx.db
      .query("reactions")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", user._id).eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .unique();

    return reaction ? reaction.reactionType : null;
  },
});

// Get all reactions for a target with user details
export const getTargetReactions = query({
  args: {
    targetType: v.union(v.literal("log"), v.literal("thread"), v.literal("reply")),
    targetId: v.string(),
    reactionType: v.optional(v.union(v.literal("like"), v.literal("laugh"), v.literal("angry"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let reactions;

    if (args.reactionType) {
      // Filter by specific reaction type
      reactions = await ctx.db
        .query("reactions")
        .withIndex("by_target_type", (q) =>
          q.eq("targetType", args.targetType)
           .eq("targetId", args.targetId)
           .eq("reactionType", args.reactionType!)
        )
        .order("desc")
        .take(args.limit || 50);
    } else {
      // Get all reactions for the target
      reactions = await ctx.db
        .query("reactions")
        .withIndex("by_target", (q) =>
          q.eq("targetType", args.targetType).eq("targetId", args.targetId)
        )
        .order("desc")
        .take(args.limit || 50);
    }

    // Get user details for each reaction
    const reactionsWithUsers = await Promise.all(
      reactions.map(async (reaction) => {
        const user = await ctx.db.get(reaction.userId);
        return {
          ...reaction,
          user: user ? {
            _id: user._id,
            username: user.username,
            profileImage: user.profileImage,
          } : null,
        };
      })
    );

    return reactionsWithUsers;
  },
});

// Get user's recent reactions (for activity feed)
export const getUserRecentReactions = query({
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

    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(args.limit || 20);

    // Get target details for each reaction
    const reactionsWithTargets = await Promise.all(
      reactions.map(async (reaction) => {
        let targetDetails = null;

        if (reaction.targetType === "log") {
          const log = await ctx.db.get(reaction.targetId as Id<"logs">);
          if (log) {
            const media = await ctx.db.get(log.mediaId);
            const user = await ctx.db.get(log.userId);
            targetDetails = {
              type: "log",
              title: media?.title,
              user: user?.username,
              rating: log.rating,
              review: log.review?.substring(0, 100) + (log.review && log.review.length > 100 ? "..." : ""),
            };
          }
        } else if (reaction.targetType === "thread") {
          const thread = await ctx.db.get(reaction.targetId as Id<"forumThreads">);
          if (thread) {
            const user = await ctx.db.get(thread.userId);
            targetDetails = {
              type: "thread",
              title: thread.title,
              user: user?.username,
              content: thread.content.substring(0, 100) + (thread.content.length > 100 ? "..." : ""),
            };
          }
        } else if (reaction.targetType === "reply") {
          const reply = await ctx.db.get(reaction.targetId as Id<"forumReplies">);
          if (reply) {
            const user = await ctx.db.get(reply.userId);
            const thread = await ctx.db.get(reply.threadId);
            targetDetails = {
              type: "reply",
              title: `Reply in: ${thread?.title}`,
              user: user?.username,
              content: reply.content.substring(0, 100) + (reply.content.length > 100 ? "..." : ""),
            };
          }
        }

        return {
          ...reaction,
          targetDetails,
        };
      })
    );

    return reactionsWithTargets.filter(r => r.targetDetails !== null);
  },
});

// Remove a specific reaction
export const removeReaction = mutation({
  args: {
    reactionId: v.id("reactions"),
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

    const reaction = await ctx.db.get(args.reactionId);
    if (!reaction) {
      throw new Error("Reaction not found");
    }

    // Only allow users to remove their own reactions
    if (reaction.userId !== user._id) {
      throw new Error("Not authorized to remove this reaction");
    }

    await ctx.db.delete(args.reactionId);
    return { success: true };
  },
});

// Get reaction statistics for a user
export const getUserReactionStats = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Reactions given by this user
    const reactionsGiven = await ctx.db
      .query("reactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const givenStats = {
      like: 0,
      laugh: 0,
      angry: 0,
      total: reactionsGiven.length,
    };

    reactionsGiven.forEach((reaction) => {
      givenStats[reaction.reactionType]++;
    });

    // Get reactions received by this user (on their content)
    const userLogs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const userThreads = await ctx.db
      .query("forumThreads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const userReplies = await ctx.db
      .query("forumReplies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get all reactions on user's content
    const contentIds = [
      ...userLogs.map(l => ({ type: "log" as const, id: l._id })),
      ...userThreads.map(t => ({ type: "thread" as const, id: t._id })),
      ...userReplies.map(r => ({ type: "reply" as const, id: r._id })),
    ];

    const receivedStats = {
      like: 0,
      laugh: 0,
      angry: 0,
      total: 0,
    };

    for (const content of contentIds) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_target", (q) =>
          q.eq("targetType", content.type).eq("targetId", content.id)
        )
        .collect();

      reactions.forEach((reaction) => {
        receivedStats[reaction.reactionType]++;
        receivedStats.total++;
      });
    }

    return {
      given: givenStats,
      received: receivedStats,
    };
  },
});
