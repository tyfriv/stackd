// convex/feeds/feedGeneration.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";

// Get personalized feed for following users
export const getFollowingFeed = query({
  args: {
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
    includeReviews: v.optional(v.boolean()),
    mediaTypes: v.optional(v.array(v.union(
      v.literal("movie"), 
      v.literal("tv"), 
      v.literal("game"), 
      v.literal("music")
    ))),
    timeRange: v.optional(v.union(
      v.literal("day"), 
      v.literal("week"), 
      v.literal("month"), 
      v.literal("all")
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { page: [], isDone: true, continueCursor: null };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return { page: [], isDone: true, continueCursor: null };
    }

    const paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    const includeReviews = args.includeReviews ?? true;
    const timeRange = args.timeRange || "all";

    // Get users that current user is following
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect();

    const followingIds = following.map(f => f.followingId);
    
    // If not following anyone, return empty feed
    if (followingIds.length === 0) {
      return { page: [], isDone: true, continueCursor: null };
    }

    // Calculate time filter
    let timeFilter = 0;
    const now = Date.now();
    switch (timeRange) {
      case "day":
        timeFilter = now - (24 * 60 * 60 * 1000);
        break;
      case "week":
        timeFilter = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        timeFilter = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeFilter = 0;
    }

    // Get public logs from followed users - we need to filter after querying
    // since Convex doesn't support complex WHERE clauses with multiple conditions
    let allPublicLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility_logged_at", (q) => 
        q.eq("visibility", "public")
      )
      .order("desc")
      .collect();

    // Also get followers-only logs that current user can see
    const followersLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility", (q) => 
        q.eq("visibility", "followers")
      )
      .collect();

    // Combine and filter
    const allLogs = [...allPublicLogs, ...followersLogs];
    const followingSet = new Set(followingIds);
    
    let filteredLogs = allLogs.filter(log => {
      // Must be from a followed user
      if (!followingSet.has(log.userId)) return false;
      
      // Apply time filter
      if (timeRange !== "all" && log.loggedAt < timeFilter) return false;
      
      // Filter reviews if specified
      if (!includeReviews && log.review && log.review.trim().length > 0) return false;
      
      return true;
    });

    // Filter by media type if specified
    if (args.mediaTypes && args.mediaTypes.length > 0) {
      const mediaTypeSet = new Set(args.mediaTypes);
      const filteredByMedia = [];
      
      for (const log of filteredLogs) {
        const media = await ctx.db.get(log.mediaId);
        if (media && mediaTypeSet.has(media.type)) {
          filteredByMedia.push(log);
        }
      }
      filteredLogs = filteredByMedia;
    }

    // Sort by loggedAt desc
    filteredLogs.sort((a, b) => b.loggedAt - a.loggedAt);

    // Apply pagination manually
    const startIndex = args.paginationOpts?.cursor ? 
      parseInt(args.paginationOpts.cursor) : 0;
    const endIndex = startIndex + paginationOpts.numItems;
    const pageItems = filteredLogs.slice(startIndex, endIndex);
    const hasMore = endIndex < filteredLogs.length;

    // Enrich with user and media details
    const enrichedFeed = await Promise.all(
      pageItems.map(async (log) => {
        const [user, media] = await Promise.all([
          ctx.db.get(log.userId),
          ctx.db.get(log.mediaId),
        ]);

        // Get reaction counts for this log
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

        // Check if current user has reacted
        const userReaction = reactions.find(r => r.userId === currentUser._id);

        // Get comment count
        const commentCount = await ctx.db
          .query("reviewComments")
          .withIndex("by_log", (q) => q.eq("logId", log._id))
          .collect()
          .then(comments => comments.length);

        return {
          type: "log" as const,
          log,
          user,
          media,
          reactions: reactionCounts,
          userReaction: userReaction?.reactionType || null,
          commentCount,
          timestamp: log.loggedAt,
        };
      })
    );

    // Filter out any items where user or media couldn't be found
    const validFeedItems = enrichedFeed.filter(item => item.user && item.media);

    return {
      page: validFeedItems,
      isDone: !hasMore,
      continueCursor: hasMore ? endIndex.toString() : null,
    };
  },
});

// Get global/discover feed for all users
export const getGlobalFeed = query({
  args: {
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
    includeReviews: v.optional(v.boolean()),
    mediaTypes: v.optional(v.array(v.union(
      v.literal("movie"), 
      v.literal("tv"), 
      v.literal("game"), 
      v.literal("music")
    ))),
    timeRange: v.optional(v.union(
      v.literal("day"), 
      v.literal("week"), 
      v.literal("month"), 
      v.literal("all")
    )),
    sortBy: v.optional(v.union(
      v.literal("recent"), 
      v.literal("popular"), 
      v.literal("discussed")
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    let currentUser: Doc<"users"> | null = null;
    let blockedUserIds = new Set<Id<"users">>();
    let blockerIds = new Set<Id<"users">>();

    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (currentUser) {
        // Get blocked relationships to filter out - currentUser is guaranteed non-null here
        const userId = currentUser._id;
        const [blockedByMe, blockedMe] = await Promise.all([
          ctx.db
            .query("blocks")
            .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
            .collect(),
          ctx.db
            .query("blocks")
            .withIndex("by_blocked", (q) => q.eq("blockedId", userId))
            .collect(),
        ]);

        blockedUserIds = new Set(blockedByMe.map(b => b.blockedId));
        blockerIds = new Set(blockedMe.map(b => b.blockerId));
      }
    }

    const paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    const includeReviews = args.includeReviews ?? true;
    const timeRange = args.timeRange || "week"; // Default to week for global feed
    const sortBy = args.sortBy || "recent";

    // Calculate time filter
    let timeFilter = 0;
    const now = Date.now();
    switch (timeRange) {
      case "day":
        timeFilter = now - (24 * 60 * 60 * 1000);
        break;
      case "week":
        timeFilter = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        timeFilter = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeFilter = 0;
    }

    // Get public logs
    const allPublicLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility_logged_at", (q) => 
        q.eq("visibility", "public")
      )
      .order("desc")
      .collect();

    // Filter logs based on criteria
    let filteredLogs = allPublicLogs.filter(log => {
      // Skip blocked users
      if (blockedUserIds.has(log.userId) || blockerIds.has(log.userId)) {
        return false;
      }

      // Apply time filter
      if (timeRange !== "all" && log.loggedAt < timeFilter) {
        return false;
      }

      // Filter reviews if specified
      if (!includeReviews && log.review && log.review.trim().length > 0) {
        return false;
      }

      return true;
    });

    // Filter by media type if specified
    if (args.mediaTypes && args.mediaTypes.length > 0) {
      const mediaTypeSet = new Set(args.mediaTypes);
      const filteredByMedia = [];
      
      for (const log of filteredLogs) {
        const media = await ctx.db.get(log.mediaId);
        if (media && mediaTypeSet.has(media.type)) {
          filteredByMedia.push(log);
        }
      }
      filteredLogs = filteredByMedia;
    }

    // Sort based on sortBy parameter
    if (sortBy === "recent") {
      filteredLogs.sort((a, b) => b.loggedAt - a.loggedAt);
    } else if (sortBy === "popular" || sortBy === "discussed") {
      // For popular/discussed, we need to get engagement metrics
      const logsWithEngagement = await Promise.all(
        filteredLogs.map(async (log) => {
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

          const engagementScore = sortBy === "popular" 
            ? reactions.length * 2 + comments.length * 3 // Weight comments higher for popularity
            : comments.length * 5 + reactions.length; // Weight comments much higher for discussion

          return {
            log,
            engagementScore,
          };
        })
      );

      filteredLogs = logsWithEngagement
        .sort((a, b) => {
          // Primary sort by engagement, secondary by recency
          if (a.engagementScore === b.engagementScore) {
            return b.log.loggedAt - a.log.loggedAt;
          }
          return b.engagementScore - a.engagementScore;
        })
        .map(item => item.log);
    }

    // Apply pagination
    const startIndex = args.paginationOpts?.cursor ? 
      parseInt(args.paginationOpts.cursor) : 0;
    const endIndex = startIndex + paginationOpts.numItems;
    const pageItems = filteredLogs.slice(startIndex, endIndex);
    const hasMore = endIndex < filteredLogs.length;

    // Enrich with user and media details
    const enrichedFeed = await Promise.all(
      pageItems.map(async (log) => {
        const [user, media] = await Promise.all([
          ctx.db.get(log.userId),
          ctx.db.get(log.mediaId),
        ]);

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
          user,
          media,
          reactions: reactionCounts,
          userReaction: userReaction?.reactionType || null,
          commentCount,
          timestamp: log.loggedAt,
        };
      })
    );

    // Filter out any items where user or media couldn't be found
    const validFeedItems = enrichedFeed.filter(item => item.user && item.media);

    return {
      page: validFeedItems,
      isDone: !hasMore,
      continueCursor: hasMore ? endIndex.toString() : null,
    };
  },
});

// Get trending/popular media based on recent activity
export const getTrendingMedia = query({
  args: {
    mediaType: v.optional(v.union(
      v.literal("movie"), 
      v.literal("tv"), 
      v.literal("game"), 
      v.literal("music")
    )),
    timeRange: v.optional(v.union(
      v.literal("day"), 
      v.literal("week"), 
      v.literal("month")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || "week";
    const limit = args.limit || 10;

    // Calculate time filter
    const now = Date.now();
    const timeFilter = timeRange === "day" 
      ? now - (24 * 60 * 60 * 1000)
      : timeRange === "week"
      ? now - (7 * 24 * 60 * 60 * 1000)
      : now - (30 * 24 * 60 * 60 * 1000);

    // Get recent public logs
    const recentLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility_logged_at", (q) => 
        q.eq("visibility", "public")
      )
      .filter((q) => q.gte(q.field("loggedAt"), timeFilter))
      .collect();

    // Group by media and calculate trending score
    const mediaEngagement = new Map<Id<"media">, {
      mediaId: Id<"media">;
      logCount: number;
      totalRating: number;
      ratingCount: number;
      reviewCount: number;
      reactionCount: number;
    }>();

    for (const log of recentLogs) {
      const mediaId = log.mediaId;
      
      if (!mediaEngagement.has(mediaId)) {
        mediaEngagement.set(mediaId, {
          mediaId,
          logCount: 0,
          totalRating: 0,
          ratingCount: 0,
          reviewCount: 0,
          reactionCount: 0,
        });
      }

      const engagement = mediaEngagement.get(mediaId)!;
      engagement.logCount++;

      if (log.rating) {
        engagement.totalRating += log.rating;
        engagement.ratingCount++;
      }

      if (log.review && log.review.trim().length > 0) {
        engagement.reviewCount++;
      }

      // Get reactions for this log
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_target", (q) => 
          q.eq("targetType", "log").eq("targetId", log._id)
        )
        .collect();

      engagement.reactionCount += reactions.length;
    }

    // Calculate trending scores and get media details
    const trendingMedia = await Promise.all(
      Array.from(mediaEngagement.values()).map(async (engagement) => {
        const media = await ctx.db.get(engagement.mediaId);
        if (!media) return null;

        // Filter by media type if specified
        if (args.mediaType && media.type !== args.mediaType) {
          return null;
        }

        // Calculate trending score (weighted by activity type)
        const trendingScore = 
          engagement.logCount * 1 +
          engagement.reviewCount * 3 +
          engagement.reactionCount * 2;

        const averageRating = engagement.ratingCount > 0 
          ? engagement.totalRating / engagement.ratingCount 
          : null;

        return {
          media,
          trendingScore,
          logCount: engagement.logCount,
          reviewCount: engagement.reviewCount,
          reactionCount: engagement.reactionCount,
          averageRating,
        };
      })
    );

    // Filter out nulls and sort by trending score
    const validTrending = trendingMedia
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, limit);

    return validTrending;
  },
});

// Get feed statistics for current user
export const getFeedStats = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        followingFeedCount: 0,
        totalPublicLogs: 0,
        weeklyActivity: 0,
      };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return {
        followingFeedCount: 0,
        totalPublicLogs: 0,
        weeklyActivity: 0,
      };
    }

    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // Get following count
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect();

    // Get total public logs count
    const totalPublicLogs = await ctx.db
      .query("logs")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .collect()
      .then(logs => logs.length);

    // Get weekly activity count
    const weeklyActivity = await ctx.db
      .query("logs")
      .withIndex("by_visibility_logged_at", (q) => 
        q.eq("visibility", "public")
      )
      .filter((q) => q.gte(q.field("loggedAt"), weekAgo))
      .collect()
      .then(logs => logs.length);

    return {
      followingFeedCount: following.length,
      totalPublicLogs,
      weeklyActivity,
    };
  },
});