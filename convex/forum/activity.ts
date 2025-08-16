// convex/forum/activity.ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Get recent forum activity (threads + replies) for sidebar
export const getRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
    excludeCategoryIds: v.optional(v.array(v.id("forumCategories"))),
  },
  handler: async (ctx, args) => {
    let limit = args.limit || 15;
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 15;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    // Get recent threads and replies separately
    const [recentThreads, recentReplies] = await Promise.all([
      // Get recent threads
      ctx.db
        .query("forumThreads")
        .withIndex("by_last_activity", (q) => q.gte("lastActivityAt", 0))
        .order("desc")
        .take(Math.ceil(limit / 2)),
      
      // Get recent replies
      ctx.db
        .query("forumReplies")
        .order("desc")
        .take(Math.ceil(limit / 2))
    ]);

    // Create activity items array
    const activityItems: Array<{
      id: string;
      type: "thread" | "reply";
      timestamp: number;
      data: any;
    }> = [];

    // Add threads to activity
    for (const thread of recentThreads) {
      const category = await ctx.db.get(thread.categoryId);
      
      // Skip if category is excluded
      if (args.excludeCategoryIds && args.excludeCategoryIds.includes(thread.categoryId)) {
        continue;
      }

      activityItems.push({
        id: thread._id,
        type: "thread",
        timestamp: thread.lastActivityAt,
        data: {
          ...thread,
          category,
        },
      });
    }

    // Add replies to activity
    for (const reply of recentReplies) {
      const thread = await ctx.db.get(reply.threadId);
      if (!thread) continue;
      
      const category = await ctx.db.get(thread.categoryId);
      if (!category) continue;

      // Skip if category is excluded
      if (args.excludeCategoryIds && args.excludeCategoryIds.includes(thread.categoryId)) {
        continue;
      }

      activityItems.push({
        id: reply._id,
        type: "reply",
        timestamp: reply.createdAt,
        data: {
          ...reply,
          thread,
          category,
        },
      });
    }

    // Sort by timestamp (most recent first)
    activityItems.sort((a, b) => b.timestamp - a.timestamp);

    // Limit to requested number
    const limitedItems = activityItems.slice(0, limit);

    // Enrich with user details
    const enrichedActivity = await Promise.all(
      limitedItems.map(async (item) => {
        const userId = item.type === "thread" ? item.data.userId : item.data.userId;
        const author = await ctx.db.get(userId);

        return {
          ...item,
          data: {
            ...item.data,
            author,
          },
        };
      })
    );

    return enrichedActivity.filter(item => item.data.author !== null);
  },
});

// Get activity for specific categories
export const getCategoryActivity = query({
  args: {
    categoryIds: v.array(v.id("forumCategories")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let limit = args.limit || 20;
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    const categorySet = new Set(args.categoryIds);
    const activityItems: Array<{
      id: string;
      type: "thread" | "reply";
      timestamp: number;
      data: any;
    }> = [];

    // Get threads from specified categories
    const threads = await ctx.db
      .query("forumThreads")
      .withIndex("by_last_activity", (q) => q.gte("lastActivityAt", 0))
      .order("desc")
      .take(limit * 2); // Get more to filter

    for (const thread of threads) {
      if (categorySet.has(thread.categoryId)) {
        const category = await ctx.db.get(thread.categoryId);
        activityItems.push({
          id: thread._id,
          type: "thread",
          timestamp: thread.lastActivityAt,
          data: {
            ...thread,
            category,
          },
        });
      }
    }

    // Get replies from threads in specified categories
    const replies = await ctx.db
      .query("forumReplies")
      .order("desc")
      .take(limit * 2); // Get more to filter

    for (const reply of replies) {
      const thread = await ctx.db.get(reply.threadId);
      if (thread && categorySet.has(thread.categoryId)) {
        const category = await ctx.db.get(thread.categoryId);
        activityItems.push({
          id: reply._id,
          type: "reply",
          timestamp: reply.createdAt,
          data: {
            ...reply,
            thread,
            category,
          },
        });
      }
    }

    // Sort by timestamp and limit
    activityItems.sort((a, b) => b.timestamp - a.timestamp);
    const limitedItems = activityItems.slice(0, limit);

    // Enrich with author details
    const enrichedActivity = await Promise.all(
      limitedItems.map(async (item) => {
        const userId = item.type === "thread" ? item.data.userId : item.data.userId;
        const author = await ctx.db.get(userId);

        return {
          ...item,
          data: {
            ...item.data,
            author,
          },
        };
      })
    );

    return enrichedActivity.filter(item => item.data.author !== null);
  },
});

// Get user's forum activity
export const getUserActivity = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    activityType: v.optional(v.union(
      v.literal("all"),
      v.literal("threads"),
      v.literal("replies")
    )),
  },
  handler: async (ctx, args) => {
    let limit = args.limit || 20;
    const activityType = args.activityType || "all";
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    const activityItems: Array<{
      id: string;
      type: "thread" | "reply";
      timestamp: number;
      data: any;
    }> = [];

    // Get user's threads
    if (activityType === "all" || activityType === "threads") {
      const threads = await ctx.db
        .query("forumThreads")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(activityType === "threads" ? limit : Math.ceil(limit / 2));

      for (const thread of threads) {
        const category = await ctx.db.get(thread.categoryId);
        activityItems.push({
          id: thread._id,
          type: "thread",
          timestamp: thread.createdAt,
          data: {
            ...thread,
            category,
          },
        });
      }
    }

    // Get user's replies
    if (activityType === "all" || activityType === "replies") {
      const replies = await ctx.db
        .query("forumReplies")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(activityType === "replies" ? limit : Math.ceil(limit / 2));

      for (const reply of replies) {
        const thread = await ctx.db.get(reply.threadId);
        if (thread) {
          const category = await ctx.db.get(thread.categoryId);
          activityItems.push({
            id: reply._id,
            type: "reply",
            timestamp: reply.createdAt,
            data: {
              ...reply,
              thread,
              category,
            },
          });
        }
      }
    }

    // Sort by timestamp and limit
    activityItems.sort((a, b) => b.timestamp - a.timestamp);
    const limitedItems = activityItems.slice(0, limit);

    // Get user details
    const user = await ctx.db.get(args.userId);

    // Add user to each item
    const enrichedActivity = limitedItems.map(item => ({
      ...item,
      data: {
        ...item.data,
        author: user,
      },
    }));

    return enrichedActivity;
  },
});

// Get forum statistics
export const getForumStats = query({
  args: {
    categoryId: v.optional(v.id("forumCategories")),
    timeRange: v.optional(v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("year"),
      v.literal("all")
    )),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || "all";
    const now = Date.now();
    
    // Calculate time range
    let startTime = 0;
    if (timeRange === "day") {
      startTime = now - (24 * 60 * 60 * 1000);
    } else if (timeRange === "week") {
      startTime = now - (7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "month") {
      startTime = now - (30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "year") {
      startTime = now - (365 * 24 * 60 * 60 * 1000);
    }

    // Get threads
    const allThreads = args.categoryId
      ? await ctx.db
          .query("forumThreads")
          .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
          .collect()
      : await ctx.db.query("forumThreads").collect();
    const filteredThreads = startTime > 0 
      ? allThreads.filter(thread => thread.createdAt >= startTime)
      : allThreads;

    // Get replies
    const allReplies = await ctx.db.query("forumReplies").collect();
    let filteredReplies = allReplies;
    
    // Filter replies by time range
    if (startTime > 0) {
      filteredReplies = allReplies.filter(reply => reply.createdAt >= startTime);
    }

    // Filter replies by category if specified
    if (args.categoryId) {
      const categoryReplies: typeof filteredReplies = [];
      for (const reply of filteredReplies) {
        const thread = await ctx.db.get(reply.threadId);
        if (thread && thread.categoryId === args.categoryId) {
          categoryReplies.push(reply);
        }
      }
      filteredReplies = categoryReplies;
    }

    // Calculate statistics
    const totalThreads = filteredThreads.length;
    const totalReplies = filteredReplies.length;
    const totalPosts = totalThreads + totalReplies;

    // Get unique users
    const threadUserIds = new Set(filteredThreads.map(thread => thread.userId));
    const replyUserIds = new Set(filteredReplies.map(reply => reply.userId));
    const allUserIds = new Set([...threadUserIds, ...replyUserIds]);
    const activeUsers = allUserIds.size;

    // Get most active users
    const userPostCounts = new Map<Id<"users">, number>();
    
    for (const thread of filteredThreads) {
      userPostCounts.set(thread.userId, (userPostCounts.get(thread.userId) || 0) + 1);
    }
    
    for (const reply of filteredReplies) {
      userPostCounts.set(reply.userId, (userPostCounts.get(reply.userId) || 0) + 1);
    }

    // Get top 5 most active users
    const topUsers = Array.from(userPostCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topUsersWithDetails = await Promise.all(
      topUsers.map(async ([userId, postCount]) => {
        const user = await ctx.db.get(userId);
        return {
          user,
          postCount,
        };
      })
    );

    // Get most active threads (by reply count)
    const threadReplyCounts = new Map<Id<"forumThreads">, number>();
    
    for (const reply of filteredReplies) {
      threadReplyCounts.set(reply.threadId, (threadReplyCounts.get(reply.threadId) || 0) + 1);
    }

    const topThreads = Array.from(threadReplyCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topThreadsWithDetails = await Promise.all(
      topThreads.map(async ([threadId, replyCount]) => {
        const thread = await ctx.db.get(threadId);
        if (!thread) return null;
        
        const author = await ctx.db.get(thread.userId);
        const category = await ctx.db.get(thread.categoryId);
        
        return {
          thread: {
            ...thread,
            author,
            category,
          },
          replyCount,
        };
      })
    );

    return {
      timeRange,
      categoryId: args.categoryId,
      totals: {
        threads: totalThreads,
        replies: totalReplies,
        posts: totalPosts,
        activeUsers,
      },
      topUsers: topUsersWithDetails.filter(item => item.user !== null),
      topThreads: topThreadsWithDetails.filter(item => item !== null),
      period: {
        startTime: startTime || null,
        endTime: now,
      },
    };
  },
});

// Get trending threads (high activity in recent time)
export const getTrendingThreads = query({
  args: {
    limit: v.optional(v.number()),
    timeWindow: v.optional(v.union(
      v.literal("hour"),
      v.literal("day"),
      v.literal("week")
    )),
    categoryId: v.optional(v.id("forumCategories")),
  },
  handler: async (ctx, args) => {
    let limit = args.limit || 10;
    const timeWindow = args.timeWindow || "day";
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 10;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    const now = Date.now();
    let windowStart = 0;
    
    if (timeWindow === "hour") {
      windowStart = now - (60 * 60 * 1000);
    } else if (timeWindow === "day") {
      windowStart = now - (24 * 60 * 60 * 1000);
    } else if (timeWindow === "week") {
      windowStart = now - (7 * 24 * 60 * 60 * 1000);
    }

    // Get all threads
    let threads = await ctx.db
      .query("forumThreads")
      .collect();

    // Filter by category if specified
    if (args.categoryId) {
      threads = threads.filter(thread => thread.categoryId === args.categoryId);
    }

    // Calculate activity score for each thread
    const threadScores: Array<{
      thread: any;
      score: number;
      recentReplies: number;
    }> = [];

    for (const thread of threads) {
      // Get recent replies for this thread
      const recentReplies = await ctx.db
        .query("forumReplies")
        .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
        .filter((q) => q.gte(q.field("createdAt"), windowStart))
        .collect();

      const recentReplyCount = recentReplies.length;

      // Calculate activity score
      // Base score from recent replies, bonus for thread activity
      let score = recentReplyCount * 10;
      
      // Bonus for thread creation within window
      if (thread.createdAt >= windowStart) {
        score += 20;
      }

      // Bonus for recent activity
      if (thread.lastActivityAt >= windowStart) {
        score += 5;
      }

      // Only include threads with some activity
      if (score > 0) {
        threadScores.push({
          thread,
          score,
          recentReplies: recentReplyCount,
        });
      }
    }

    // Sort by score and limit
    threadScores.sort((a, b) => b.score - a.score);
    const topThreads = threadScores.slice(0, limit);

    // Enrich with details
    const enrichedThreads = await Promise.all(
      topThreads.map(async (item) => {
        const author = await ctx.db.get(item.thread.userId);
        const category = await ctx.db.get(item.thread.categoryId);
        
        return {
          ...item.thread,
          author,
          category,
          trendingScore: item.score,
          recentActivity: item.recentReplies,
        };
      })
    );

    return enrichedThreads.filter(thread => thread.author !== null && thread.category !== null);
  },
});