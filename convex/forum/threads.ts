// convex/forum/threads.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createError } from "../lib/errors";

// Create a new thread
export const createThread = mutation({
  args: {
    categoryId: v.id("forumCategories"),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // Rate limiting for thread creation
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: `create_thread_${identity.subject}`,
      limit: 10, // 10 threads per hour
      windowMs: 60 * 60 * 1000
    });

    if (!rateLimitAllowed) {
      throw createError("RATE_LIMITED", "Rate limit exceeded for thread creation");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw createError("NOT_FOUND", "User not found");
    }

    // Validate category exists
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw createError("NOT_FOUND", "Category not found");
    }

    // Validate input
    if (args.title.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Thread title cannot be empty");
    }

    if (args.title.trim().length > 200) {
      throw createError("VALIDATION_ERROR", "Thread title too long (max 200 characters)");
    }

    if (args.content.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Thread content cannot be empty");
    }

    if (args.content.trim().length > 10000) {
      throw createError("VALIDATION_ERROR", "Thread content too long (max 10,000 characters)");
    }

    const now = Date.now();
    const threadId = await ctx.db.insert("forumThreads", {
      categoryId: args.categoryId,
      userId: currentUser._id,
      title: args.title.trim(),
      content: args.content.trim(),
      isPinned: false,
      isLocked: false,
      createdAt: now,
      lastActivityAt: now,
      replyCount: 0,
    });

    return threadId;
  },
});

// Get threads for a category with pagination
export const getThreadsByCategory = query({
  args: {
    categoryId: v.id("forumCategories"),
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    // Validate pagination options
    let paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    
    if (paginationOpts.numItems) {
      if (typeof paginationOpts.numItems !== 'number' || isNaN(paginationOpts.numItems) || !isFinite(paginationOpts.numItems)) {
        paginationOpts.numItems = 20;
      }
      paginationOpts.numItems = Math.min(Math.max(Math.floor(paginationOpts.numItems), 1), 50);
    }

    // Get threads (pinned first, then by last activity)
    const threads = await ctx.db
      .query("forumThreads")
      .withIndex("by_category_pinned_activity", (q) => 
        q.eq("categoryId", args.categoryId)
      )
      .order("desc")
      .paginate(paginationOpts);

    // Enrich with user details and latest reply info
    const enrichedThreads = await Promise.all(
      threads.page.map(async (thread) => {
        const author = await ctx.db.get(thread.userId);
        
        // Get latest reply for preview
        let latestReply = null;
        let latestReplyAuthor = null;
        
        if (thread.replyCount > 0) {
          const replies = await ctx.db
            .query("forumReplies")
            .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
            .order("desc")
            .take(1);
          
          if (replies.length > 0) {
            latestReply = replies[0];
            latestReplyAuthor = await ctx.db.get(latestReply.userId);
          }
        }

        return {
          ...thread,
          author,
          latestReply: latestReply ? {
            ...latestReply,
            author: latestReplyAuthor,
          } : null,
        };
      })
    );

    return {
      ...threads,
      page: enrichedThreads,
    };
  },
});

// Get single thread with details
export const getThread = query({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    // Get author details
    const author = await ctx.db.get(thread.userId);
    const category = await ctx.db.get(thread.categoryId);

    return {
      ...thread,
      author,
      category,
    };
  },
});

// Update thread (edit title/content - author only)
export const updateThread = mutation({
  args: {
    threadId: v.id("forumThreads"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw createError("NOT_FOUND", "User not found");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    // Only author can edit (you might want to add moderator permissions)
    if (thread.userId !== currentUser._id) {
      throw createError("UNAUTHORIZED", "Only the thread author can edit this thread");
    }

    // Check if thread is locked
    if (thread.isLocked) {
      throw createError("UNAUTHORIZED", "Cannot edit locked thread");
    }

    // Prepare update object
    const updateObj: Partial<{
      title: string;
      content: string;
    }> = {};

    if (args.title !== undefined) {
      if (args.title.trim().length === 0) {
        throw createError("VALIDATION_ERROR", "Thread title cannot be empty");
      }
      if (args.title.trim().length > 200) {
        throw createError("VALIDATION_ERROR", "Thread title too long (max 200 characters)");
      }
      updateObj.title = args.title.trim();
    }

    if (args.content !== undefined) {
      if (args.content.trim().length === 0) {
        throw createError("VALIDATION_ERROR", "Thread content cannot be empty");
      }
      if (args.content.trim().length > 10000) {
        throw createError("VALIDATION_ERROR", "Thread content too long (max 10,000 characters)");
      }
      updateObj.content = args.content.trim();
    }

    await ctx.db.patch(args.threadId, updateObj);
    return { success: true };
  },
});

// Delete thread (author only)
export const deleteThread = mutation({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw createError("NOT_FOUND", "User not found");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    // Only author can delete (you might want to add moderator permissions)
    if (thread.userId !== currentUser._id) {
      throw createError("UNAUTHORIZED", "Only the thread author can delete this thread");
    }

    // Delete all replies first
    const replies = await ctx.db
      .query("forumReplies")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    await Promise.all(replies.map((reply) => ctx.db.delete(reply._id)));

    // Delete all reactions for this thread
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => 
        q.eq("targetType", "thread").eq("targetId", args.threadId)
      )
      .collect();

    await Promise.all(reactions.map((reaction) => ctx.db.delete(reaction._id)));

    // Delete the thread
    await ctx.db.delete(args.threadId);

    return { success: true };
  },
});

// Pin/unpin thread (moderator function)
export const togglePin = mutation({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // TODO: Add moderator role check here
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    await ctx.db.patch(args.threadId, {
      isPinned: !thread.isPinned,
    });

    return { success: true, isPinned: !thread.isPinned };
  },
});

// Lock/unlock thread (moderator function)
export const toggleLock = mutation({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // TODO: Add moderator role check here
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    await ctx.db.patch(args.threadId, {
      isLocked: !thread.isLocked,
    });

    return { success: true, isLocked: !thread.isLocked };
  },
});

// Search threads
export const searchThreads = query({
  args: {
    searchTerm: v.string(),
    categoryId: v.optional(v.id("forumCategories")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.searchTerm.trim().length === 0) {
      return [];
    }

    let limit = args.limit || 20;
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    // Search by title
    let titleResults = await ctx.db
      .query("forumThreads")
      .withSearchIndex("search_title", (q) => q.search("title", args.searchTerm.trim()))
      .take(limit);

    // Search by content
    let contentResults = await ctx.db
      .query("forumThreads")
      .withSearchIndex("search_content", (q) => q.search("content", args.searchTerm.trim()))
      .take(limit);

    // Combine and deduplicate
    const allResults = [...titleResults, ...contentResults];
    const uniqueResults = allResults.filter((thread, index, array) => 
      array.findIndex(t => t._id === thread._id) === index
    );

    // Filter by category if specified
    let filteredResults = uniqueResults;
    if (args.categoryId) {
      filteredResults = uniqueResults.filter(thread => thread.categoryId === args.categoryId);
    }

    // Sort by relevance (title matches first, then by last activity)
    filteredResults.sort((a, b) => {
      const aInTitle = a.title.toLowerCase().includes(args.searchTerm.toLowerCase());
      const bInTitle = b.title.toLowerCase().includes(args.searchTerm.toLowerCase());
      
      if (aInTitle && !bInTitle) return -1;
      if (!aInTitle && bInTitle) return 1;
      
      return b.lastActivityAt - a.lastActivityAt;
    });

    // Limit results
    const finalResults = filteredResults.slice(0, limit);

    // Enrich with author and category details
    const enrichedResults = await Promise.all(
      finalResults.map(async (thread) => {
        const author = await ctx.db.get(thread.userId);
        const category = await ctx.db.get(thread.categoryId);
        
        return {
          ...thread,
          author,
          category,
        };
      })
    );

    return enrichedResults;
  },
});

// Get recent threads across all categories
export const getRecentThreads = query({
  args: {
    limit: v.optional(v.number()),
    excludeCategoryIds: v.optional(v.array(v.id("forumCategories"))),
  },
  handler: async (ctx, args) => {
    let limit = args.limit || 15;
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 15;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    let threads = await ctx.db
      .query("forumThreads")
      .withIndex("by_last_activity", (q) => q.gte("lastActivityAt", 0))
      .order("desc")
      .take(limit * 2); // Get more to filter if needed

    // Filter out excluded categories
    if (args.excludeCategoryIds && args.excludeCategoryIds.length > 0) {
      const excludeSet = new Set(args.excludeCategoryIds);
      threads = threads.filter(thread => !excludeSet.has(thread.categoryId));
    }

    threads = threads.slice(0, limit);

    // Enrich with details
    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const author = await ctx.db.get(thread.userId);
        const category = await ctx.db.get(thread.categoryId);
        
        return {
          ...thread,
          author,
          category,
        };
      })
    );

    return enrichedThreads;
  },
});

// Update last activity timestamp (internal helper)
export const updateLastActivity = mutation({
  args: {
    threadId: v.id("forumThreads"),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    await ctx.db.patch(args.threadId, {
      lastActivityAt: args.timestamp || Date.now(),
    });

    return { success: true };
  },
});