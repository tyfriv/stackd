// convex/feeds/feedHelpers.ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";

// Get activity feed for a specific user (public profile view)
export const getUserActivityFeed = query({
  args: {
    userId: v.id("users"),
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
    includePrivate: v.optional(v.boolean()), // Only true if viewing own profile
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    
    let currentUser: Doc<"users"> | null = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    const isOwnProfile = currentUser && currentUser._id === args.userId;
    const includePrivate = args.includePrivate && isOwnProfile;

    // Check if current user can see this user's content
    if (!isOwnProfile) {
      // Check if users are blocked
      if (currentUser) {
        const [isBlocked, isBlockedBy] = await Promise.all([
          ctx.db
            .query("blocks")
            .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
            .filter((q) => q.eq(q.field("blockedId"), args.userId))
            .unique(),
          ctx.db
            .query("blocks")
            .withIndex("by_blocker", (q) => q.eq("blockerId", args.userId))
            .filter((q) => q.eq(q.field("blockedId"), currentUser._id))
            .unique(),
        ]);

        if (isBlocked || isBlockedBy) {
          return { page: [], isDone: true, continueCursor: null };
        }
      }
    }

    // Build visibility filter
    const visibilityOptions: ("public" | "followers" | "private")[] = ["public"];
    
    if (currentUser && !isOwnProfile) {
      // Check if current user follows target user
      const isFollowing = await ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", currentUser._id).eq("followingId", args.userId)
        )
        .unique();

      if (isFollowing) {
        visibilityOptions.push("followers");
      }
    }

    if (includePrivate) {
      visibilityOptions.push("private");
    }

    // Get logs for this user
    const userLogs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(200); // Reasonable limit for filtering

    // Filter by visibility
    const visibleLogs = userLogs.filter(log => 
      visibilityOptions.includes(log.visibility)
    );

    // Apply pagination
    const startIndex = args.paginationOpts?.cursor ? 
      parseInt(args.paginationOpts.cursor) : 0;
    const endIndex = startIndex + paginationOpts.numItems;
    const pageItems = visibleLogs.slice(startIndex, endIndex);
    const hasMore = endIndex < visibleLogs.length;

    // Enrich with media details
    const enrichedFeed = await Promise.all(
      pageItems.map(async (log) => {
        const media = await ctx.db.get(log.mediaId);

        // Get reaction counts and user's reaction
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_target", (q) => 
            q.eq("targetType", "log").eq("targetId", log._id)
          )
          .collect();

        const reactionCounts = reactions.reduce((acc, reaction) => {
          acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const userReaction = currentUser 
          ? reactions.find(r => r.userId === currentUser._id)
          : null;

        // Get comment count
        const commentCount = await ctx.db
          .query("reviewComments")
          .withIndex("by_log", (q) => q.eq("logId", log._id))
          .collect()
          .then(comments => comments.length);

        return {
          type: "log" as const,
          log,
          media,
          reactions: reactionCounts,
          userReaction: userReaction?.reactionType || null,
          commentCount,
          timestamp: log.loggedAt,
        };
      })
    );

    // Filter out any items where media couldn't be found
    const validFeedItems = enrichedFeed.filter(item => item.media);

    return {
      page: validFeedItems,
      isDone: !hasMore,
      continueCursor: hasMore ? endIndex.toString() : null,
    };
  },
});

// Get feed item details (for expanded view)
export const getFeedItemDetails = query({
  args: {
    logId: v.id("logs"),
    includeComments: v.optional(v.boolean()),
    commentsPagination: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    let currentUser: Doc<"users"> | null = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    // Check visibility inline instead of using external query
    // We'll implement the visibility check here
    let canSeeLog = false;

    if (log.visibility === "public") {
      canSeeLog = true;
    } else if (log.visibility === "followers" && currentUser) {
      // Check if current user follows the log owner
      if (currentUser._id === log.userId) {
        canSeeLog = true; // Own log
      } else {
        const isFollowing = await ctx.db
          .query("follows")
          .withIndex("by_relationship", (q) => 
            q.eq("followerId", currentUser._id).eq("followingId", log.userId)
          )
          .unique();
        canSeeLog = !!isFollowing;
      }
    } else if (log.visibility === "private" && currentUser && currentUser._id === log.userId) {
      canSeeLog = true; // Own private log
    }

    if (!canSeeLog) {
      throw new Error("Not authorized to view this log");
    }

    // Get user and media details
    const [user, media] = await Promise.all([
      ctx.db.get(log.userId),
      ctx.db.get(log.mediaId),
    ]);

    if (!user || !media) {
      throw new Error("Associated data not found");
    }

    // Get reaction counts and user's reaction
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => 
        q.eq("targetType", "log").eq("targetId", log._id)
      )
      .collect();

    const reactionCounts = reactions.reduce((acc, reaction) => {
      acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const userReaction = currentUser 
      ? reactions.find(r => r.userId === currentUser._id)
      : null;

    let comments: Array<Doc<"reviewComments"> & { user: Doc<"users"> | null }> = [];
    if (args.includeComments) {
      const commentsPagination = args.commentsPagination || { numItems: 10, cursor: null };
      
      const allComments = await ctx.db
        .query("reviewComments")
        .withIndex("by_log", (q) => q.eq("logId", log._id))
        .order("asc") // Comments in chronological order
        .collect();

      const startIndex = commentsPagination.cursor ? 
        parseInt(commentsPagination.cursor) : 0;
      const endIndex = startIndex + commentsPagination.numItems;
      const pageComments = allComments.slice(startIndex, endIndex);

      // Enrich comments with user details
      comments = await Promise.all(
        pageComments.map(async (comment) => {
          const commentUser = await ctx.db.get(comment.userId);
          return {
            ...comment,
            user: commentUser,
          };
        })
      );
    }

    return {
      type: "log" as const,
      log,
      user,
      media,
      reactions: reactionCounts,
      userReaction: userReaction?.reactionType || null,
      comments: comments.filter(c => c.user !== null),
      commentCount: await ctx.db
        .query("reviewComments")
        .withIndex("by_log", (q) => q.eq("logId", log._id))
        .collect()
        .then(comments => comments.length),
      timestamp: log.loggedAt,
    };
  },
});

// Get recent activity summary for dashboard
export const getRecentActivity = query({
  args: {
    timeRange: v.optional(v.union(
      v.literal("day"), 
      v.literal("week"), 
      v.literal("month")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        totalLogs: 0,
        totalReactions: 0,
        totalComments: 0,
        popularMedia: [],
      };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return {
        totalLogs: 0,
        totalReactions: 0,
        totalComments: 0,
        popularMedia: [],
      };
    }

    const timeRange = args.timeRange || "week";
    const limit = args.limit || 5;

    // Calculate time filter
    const now = Date.now();
    const timeFilter = timeRange === "day" 
      ? now - (24 * 60 * 60 * 1000)
      : timeRange === "week"
      ? now - (7 * 24 * 60 * 60 * 1000)
      : now - (30 * 24 * 60 * 60 * 1000);

    // Get following users
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect();

    const followingIds = new Set(following.map(f => f.followingId));

    // Get recent activity from followed users
    const recentLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility_logged_at", (q) => 
        q.eq("visibility", "public")
      )
      .filter((q) => q.gte(q.field("loggedAt"), timeFilter))
      .collect();

    const followingLogs = recentLogs.filter(log => 
      followingIds.has(log.userId)
    );

    // Count activities
    const totalLogs = followingLogs.length;
    
    // Get reaction and comment counts for these logs
    let totalReactions = 0;
    let totalComments = 0;
    const mediaActivity = new Map<Id<"media">, number>();

    for (const log of followingLogs) {
      const [reactions, comments] = await Promise.all([
        ctx.db
          .query("reactions")
          .withIndex("by_target", (q) => 
            q.eq("targetType", "log").eq("targetId", log._id)
          )
          .collect(),
        ctx.db
          .query("reviewComments")
          .withIndex("by_log", (q) => q.eq("logId", log._id))
          .collect(),
      ]);

      totalReactions += reactions.length;
      totalComments += comments.length;

      // Track media activity
      const currentActivity = mediaActivity.get(log.mediaId) || 0;
      mediaActivity.set(log.mediaId, currentActivity + 1);
    }

    // Get top media
    const topMediaIds = Array.from(mediaActivity.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([mediaId]) => mediaId);

    const popularMedia = await Promise.all(
      topMediaIds.map(async (mediaId) => {
        const media = await ctx.db.get(mediaId);
        return media;
      })
    );

    return {
      totalLogs,
      totalReactions,
      totalComments,
      popularMedia: popularMedia.filter(m => m !== null),
    };
  },
});