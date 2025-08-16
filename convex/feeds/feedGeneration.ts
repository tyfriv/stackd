// convex/feeds/feedGeneration.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";

// Helper function for time filtering
function getTimeFilter(timeRange: string): number {
  const now = Date.now();
  switch (timeRange) {
    case "day": return now - (24 * 60 * 60 * 1000);
    case "week": return now - (7 * 24 * 60 * 60 * 1000);
    case "month": return now - (30 * 24 * 60 * 60 * 1000);
    default: return 0;
  }
}

// Get personalized feed for following users - OPTIMIZED
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

    // Get following users efficiently using existing index
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect();

    const followingIds = new Set(following.map(f => f.followingId));
    if (followingIds.size === 0) {
      return { page: [], isDone: true, continueCursor: null };
    }

    const timeFilter = getTimeFilter(args.timeRange || "all");
    const paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };

    // OPTIMIZATION: Get logs efficiently using existing indexes with reasonable limits
    const [publicLogs, followersLogs] = await Promise.all([
      timeFilter === 0 
        ? ctx.db.query("logs").withIndex("by_visibility", (q) => q.eq("visibility", "public")).order("desc").take(300)
        : ctx.db.query("logs").withIndex("by_visibility_logged_at", (q) => q.eq("visibility", "public"))
            .filter((q) => q.gte(q.field("loggedAt"), timeFilter)).order("desc").take(300),
      
      ctx.db.query("logs").withIndex("by_visibility", (q) => q.eq("visibility", "followers")).collect()
    ]);

    // Filter for following users only (in memory - this is the tradeoff)
    const allLogs = [...publicLogs, ...followersLogs].filter(log => followingIds.has(log.userId));
    
    // OPTIMIZATION: Batch media filtering
    let filteredLogs = allLogs;
    if (args.mediaTypes?.length) {
      const mediaIds = [...new Set(allLogs.map(log => log.mediaId))];
      const medias = await Promise.all(mediaIds.map(id => ctx.db.get(id)));
      const mediaMap = new Map<Id<"media">, Doc<"media">>();
      medias.forEach((media, i) => {
        if (media) mediaMap.set(mediaIds[i], media);
      });

      filteredLogs = allLogs.filter(log => {
        const media = mediaMap.get(log.mediaId);
        return media && args.mediaTypes!.includes(media.type);
      });
    }

    // Apply review filter
    if (!args.includeReviews) {
      filteredLogs = filteredLogs.filter(log => !log.review?.trim().length);
    }

    // Sort and paginate
    filteredLogs.sort((a, b) => b.loggedAt - a.loggedAt);
    
    const startIndex = paginationOpts.cursor ? parseInt(paginationOpts.cursor) : 0;
    const endIndex = startIndex + paginationOpts.numItems;
    const pageItems = filteredLogs.slice(startIndex, endIndex);

    // OPTIMIZATION: Batch ALL enrichment data efficiently
    const userIds = [...new Set(pageItems.map(log => log.userId))];
    const mediaIds = [...new Set(pageItems.map(log => log.mediaId))];
    const logIds = pageItems.map(log => log._id);

    const [users, medias, reactions, comments] = await Promise.all([
      Promise.all(userIds.map(id => ctx.db.get(id))),
      Promise.all(mediaIds.map(id => ctx.db.get(id))),
      Promise.all(logIds.map(logId => 
        ctx.db.query("reactions")
          .withIndex("by_target", (q) => q.eq("targetType", "log").eq("targetId", logId))
          .collect()
      )),
      Promise.all(logIds.map(logId => 
        ctx.db.query("reviewComments")
          .withIndex("by_log", (q) => q.eq("logId", logId))
          .collect()
          .then(c => c.length)
      )),
    ]);

    // Build lookup maps
    const userMap = new Map<Id<"users">, Doc<"users">>();
    const mediaMap = new Map<Id<"media">, Doc<"media">>();
    users.forEach((user, i) => user && userMap.set(userIds[i], user));
    medias.forEach((media, i) => media && mediaMap.set(mediaIds[i], media));

    // Build enriched results
    const enrichedFeed = pageItems.map((log, i) => {
      const user = userMap.get(log.userId);
      const media = mediaMap.get(log.mediaId);
      const logReactions = reactions[i];

      if (!user || !media) return null;

      const reactionCounts = logReactions.reduce((acc: Record<string, number>, reaction) => {
        acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
        return acc;
      }, {});

      const userReaction = logReactions.find(r => r.userId === currentUser._id);

      return {
        type: "log" as const,
        log,
        user,
        media,
        reactions: reactionCounts,
        userReaction: userReaction?.reactionType || null,
        commentCount: comments[i],
        timestamp: log.loggedAt,
      };
    }).filter(Boolean);

    return {
      page: enrichedFeed,
      isDone: endIndex >= filteredLogs.length,
      continueCursor: endIndex < filteredLogs.length ? endIndex.toString() : null,
    };
  },
});

// Get global/discover feed for all users - OPTIMIZED
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
    const paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    const timeRange = args.timeRange || "week";
    const sortBy = args.sortBy || "recent";

    // Get current user and blocked relationships
    let currentUser: Doc<"users"> | null = null;
    let blockedUserIds = new Set<Id<"users">>();
    let blockerIds = new Set<Id<"users">>();

    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (currentUser) {
        // Batch blocked user queries - currentUser is guaranteed non-null here
        const userId = currentUser._id;
        const [blockedByMe, blockedMe] = await Promise.all([
          ctx.db.query("blocks").withIndex("by_blocker", (q) => q.eq("blockerId", userId)).collect(),
          ctx.db.query("blocks").withIndex("by_blocked", (q) => q.eq("blockedId", userId)).collect(),
        ]);
        blockedUserIds = new Set(blockedByMe.map(b => b.blockedId));
        blockerIds = new Set(blockedMe.map(b => b.blockerId));
      }
    }

    // Calculate time filter
    const timeFilter = getTimeFilter(timeRange);

    // OPTIMIZATION: Use existing indexes with reasonable limits
    let logs: Doc<"logs">[];
    
    if (timeRange === "all") {
      logs = await ctx.db
        .query("logs")
        .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
        .order("desc")
        .take(400); // Reasonable limit for processing
    } else {
      logs = await ctx.db
        .query("logs")
        .withIndex("by_visibility_logged_at", (q) => q.eq("visibility", "public"))
        .filter((q) => q.gte(q.field("loggedAt"), timeFilter))
        .order("desc")
        .take(400);
    }

    // OPTIMIZATION: Batch media lookups and create lookup map
    const uniqueMediaIds = [...new Set(logs.map(log => log.mediaId))];
    const mediaLookups = await Promise.all(
      uniqueMediaIds.map(id => ctx.db.get(id))
    );
    const mediaMap = new Map<Id<"media">, Doc<"media">>();
    mediaLookups.forEach((media, i) => {
      if (media) mediaMap.set(uniqueMediaIds[i], media);
    });

    // Apply filters efficiently
    let filteredLogs = logs.filter(log => {
      // Block filter
      if (blockedUserIds.has(log.userId) || blockerIds.has(log.userId)) return false;
      
      // Review filter
      if (!args.includeReviews && log.review?.trim().length) return false;
      
      // Media type filter using pre-loaded media map
      if (args.mediaTypes?.length) {
        const media = mediaMap.get(log.mediaId);
        if (!media || !args.mediaTypes.includes(media.type)) return false;
      }
      
      return true;
    });

    // OPTIMIZATION: Batch engagement data for sorting (if not "recent")
    if (sortBy !== "recent") {
      const logEngagementPromises = filteredLogs.map(async (log) => {
        const [reactions, commentCount] = await Promise.all([
          ctx.db
            .query("reactions")
            .withIndex("by_target", (q) => q.eq("targetType", "log").eq("targetId", log._id))
            .collect(),
          ctx.db
            .query("reviewComments")
            .withIndex("by_log", (q) => q.eq("logId", log._id))
            .collect()
            .then(comments => comments.length),
        ]);

        // Calculate engagement score with freshness decay
        const ageInHours = (Date.now() - log.loggedAt) / (1000 * 60 * 60);
        const freshnessMultiplier = Math.max(0.1, 1 / (1 + ageInHours / 24));
        
        const engagementScore = sortBy === "popular" 
          ? (reactions.length * 2 + commentCount * 3) * freshnessMultiplier
          : (commentCount * 5 + reactions.length) * freshnessMultiplier;

        return { log, engagementScore };
      });

      const logsWithEngagement = await Promise.all(logEngagementPromises);
      
      filteredLogs = logsWithEngagement
        .sort((a, b) => {
          if (a.engagementScore === b.engagementScore) {
            return b.log.loggedAt - a.log.loggedAt; // Fallback to recency
          }
          return b.engagementScore - a.engagementScore;
        })
        .map(item => item.log);
    } else {
      // For "recent", just sort by loggedAt (already sorted from query)
    }

    // Apply pagination
    const startIndex = paginationOpts.cursor ? parseInt(paginationOpts.cursor) : 0;
    const endIndex = startIndex + paginationOpts.numItems;
    const pageItems = filteredLogs.slice(startIndex, endIndex);

    // OPTIMIZATION: Batch ALL enrichment data
    const uniqueUserIds = [...new Set(pageItems.map(log => log.userId))];
    const pageLogIds = pageItems.map(log => log._id);
    
    const [users, reactions, comments] = await Promise.all([
      // Batch user lookups
      Promise.all(uniqueUserIds.map(id => ctx.db.get(id))),
      
      // Batch reaction lookups for displayed logs only
      Promise.all(pageLogIds.map(logId => 
        ctx.db
          .query("reactions")
          .withIndex("by_target", (q) => q.eq("targetType", "log").eq("targetId", logId))
          .collect()
      )),
      
      // Batch comment counts for displayed logs only  
      Promise.all(pageLogIds.map(logId => 
        ctx.db
          .query("reviewComments")
          .withIndex("by_log", (q) => q.eq("logId", logId))
          .collect()
          .then(comments => comments.length)
      )),
    ]);

    // Create user lookup map
    const userMap = new Map<Id<"users">, Doc<"users">>();
    users.forEach((user, i) => {
      if (user) userMap.set(uniqueUserIds[i], user);
    });

    // Build enriched feed items
    const enrichedFeed = pageItems.map((log, i) => {
      const user = userMap.get(log.userId);
      const media = mediaMap.get(log.mediaId);
      const logReactions = reactions[i];
      const commentCount = comments[i];

      if (!user || !media) return null;

      const reactionCounts = logReactions.reduce((acc, reaction) => {
        acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const userReaction = currentUser 
        ? logReactions.find(r => r.userId === currentUser._id)
        : null;

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
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      page: enrichedFeed,
      isDone: endIndex >= filteredLogs.length,
      continueCursor: endIndex < filteredLogs.length ? endIndex.toString() : null,
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
    const timeFilter = getTimeFilter(timeRange);

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