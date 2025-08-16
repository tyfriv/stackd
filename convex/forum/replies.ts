// convex/forum/replies.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createError } from "../lib/errors";
import { notifyReply, notifyQuote } from "../lib/notificationHelpers";

// Create a reply
export const createReply = mutation({
  args: {
    threadId: v.id("forumThreads"),
    content: v.string(),
    quotedReplyId: v.optional(v.id("forumReplies")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // Rate limiting for replies
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: `create_reply_${identity.subject}`,
      limit: 30, // 30 replies per hour
      windowMs: 60 * 60 * 1000
    });

    if (!rateLimitAllowed) {
      throw createError("RATE_LIMITED", "Rate limit exceeded for reply creation");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw createError("NOT_FOUND", "User not found");
    }

    // Validate thread exists and is not locked
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    if (thread.isLocked) {
      throw createError("UNAUTHORIZED", "Cannot reply to locked thread");
    }

    // Validate quoted reply if provided
    let quotedReply = null;
    if (args.quotedReplyId) {
      quotedReply = await ctx.db.get(args.quotedReplyId);
      if (!quotedReply || quotedReply.threadId !== args.threadId) {
        throw createError("NOT_FOUND", "Quoted reply not found or not in this thread");
      }
    }

    // Validate content
    if (args.content.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Reply content cannot be empty");
    }

    if (args.content.trim().length > 10000) {
      throw createError("VALIDATION_ERROR", "Reply content too long (max 10,000 characters)");
    }

    const now = Date.now();
    
    // Create the reply
    const replyId = await ctx.db.insert("forumReplies", {
      threadId: args.threadId,
      userId: currentUser._id,
      content: args.content.trim(),
      quotedReplyId: args.quotedReplyId,
      createdAt: now,
    });

    // **CRITICAL: Update reply count and last activity atomically**
    await ctx.db.patch(args.threadId, {
      replyCount: thread.replyCount + 1,
      lastActivityAt: now,
    });

    // Send notifications
    // 1. Notify thread author if this isn't their own reply
    if (thread.userId !== currentUser._id) {
      await notifyReply(ctx, thread.userId, currentUser._id, args.threadId);
    }

    // 2. Notify quoted reply author if this is a quote and not self-quote
    if (quotedReply && quotedReply.userId !== currentUser._id) {
      await notifyQuote(ctx, quotedReply.userId, currentUser._id, replyId);
    }

    return replyId;
  },
});

// Get replies for a thread with pagination
export const getRepliesByThread = query({
  args: {
    threadId: v.id("forumThreads"),
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let currentUser: any = null;
    let blockedUserIds = new Set<Id<"users">>();
    let blockedByUserIds = new Set<Id<"users">>();

    // Get current user and blocking relationships upfront
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (currentUser) {
        // Get all users blocked by current user
        const blockedByMe = await ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
          .collect();
        
        // Get all users who blocked current user  
        const blockedMe = await ctx.db
          .query("blocks")
          .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
          .collect();

        blockedUserIds = new Set(blockedByMe.map(block => block.blockedId));
        blockedByUserIds = new Set(blockedMe.map(block => block.blockerId));
      }
    }

    // Validate pagination options
    let paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    
    if (paginationOpts.numItems) {
      if (typeof paginationOpts.numItems !== 'number' || isNaN(paginationOpts.numItems) || !isFinite(paginationOpts.numItems)) {
        paginationOpts.numItems = 20;
      }
      paginationOpts.numItems = Math.min(Math.max(Math.floor(paginationOpts.numItems), 1), 50);
    }

    const replies = await ctx.db
      .query("forumReplies")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .order("asc") // Chronological order for replies
      .paginate(paginationOpts);

    // Filter out replies from blocked users and enrich with user details
    const filteredAndEnrichedReplies = await Promise.all(
      replies.page.map(async (reply) => {
        const author = await ctx.db.get(reply.userId);
        if (!author) return null;

        // Check if this user should be filtered out
        if (currentUser && (blockedUserIds.has(author._id) || blockedByUserIds.has(author._id))) {
          return null;
        }
        
        // Get quoted reply details if this reply quotes another
        let quotedReplyDetails = null;
        if (reply.quotedReplyId) {
          const quotedReply = await ctx.db.get(reply.quotedReplyId);
          if (quotedReply) {
            const quotedAuthor = await ctx.db.get(quotedReply.userId);
            // Only include quoted reply if the quoted author isn't blocked
            if (quotedAuthor && (!currentUser || (!blockedUserIds.has(quotedAuthor._id) && !blockedByUserIds.has(quotedAuthor._id)))) {
              quotedReplyDetails = {
                ...quotedReply,
                author: quotedAuthor,
              };
            }
          }
        }

        return {
          ...reply,
          author,
          quotedReply: quotedReplyDetails,
        };
      })
    );

    // Filter out null entries and update pagination
    const validReplies = filteredAndEnrichedReplies.filter(reply => reply !== null);
    
    return {
      ...replies,
      page: validReplies,
    };
  },
});

// Get single reply with details
export const getReply = query({
  args: { replyId: v.id("forumReplies") },
  handler: async (ctx, args) => {
    const reply = await ctx.db.get(args.replyId);
    if (!reply) {
      throw createError("NOT_FOUND", "Reply not found");
    }

    // Get author details
    const author = await ctx.db.get(reply.userId);
    const thread = await ctx.db.get(reply.threadId);

    // Get quoted reply if exists
    let quotedReplyDetails = null;
    if (reply.quotedReplyId) {
      const quotedReply = await ctx.db.get(reply.quotedReplyId);
      if (quotedReply) {
        const quotedAuthor = await ctx.db.get(quotedReply.userId);
        quotedReplyDetails = {
          ...quotedReply,
          author: quotedAuthor,
        };
      }
    }

    return {
      ...reply,
      author,
      thread,
      quotedReply: quotedReplyDetails,
    };
  },
});

// Update reply (edit content - author only)
export const updateReply = mutation({
  args: {
    replyId: v.id("forumReplies"),
    content: v.string(),
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

    const reply = await ctx.db.get(args.replyId);
    if (!reply) {
      throw createError("NOT_FOUND", "Reply not found");
    }

    // Only author can edit
    if (reply.userId !== currentUser._id) {
      throw createError("UNAUTHORIZED", "Only the reply author can edit this reply");
    }

    // Check if thread is locked
    const thread = await ctx.db.get(reply.threadId);
    if (thread?.isLocked) {
      throw createError("UNAUTHORIZED", "Cannot edit replies in locked thread");
    }

    // Validate content
    if (args.content.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Reply content cannot be empty");
    }

    if (args.content.trim().length > 10000) {
      throw createError("VALIDATION_ERROR", "Reply content too long (max 10,000 characters)");
    }

    await ctx.db.patch(args.replyId, {
      content: args.content.trim(),
    });

    return { success: true };
  },
});

// Delete reply (author only)
export const deleteReply = mutation({
  args: { replyId: v.id("forumReplies") },
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

    const reply = await ctx.db.get(args.replyId);
    if (!reply) {
      throw createError("NOT_FOUND", "Reply not found");
    }

    // Only author can delete (you might want to add moderator permissions)
    if (reply.userId !== currentUser._id) {
      throw createError("UNAUTHORIZED", "Only the reply author can delete this reply");
    }

    const thread = await ctx.db.get(reply.threadId);
    if (!thread) {
      throw createError("NOT_FOUND", "Thread not found");
    }

    // Delete all reactions for this reply
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => 
        q.eq("targetType", "reply").eq("targetId", args.replyId)
      )
      .collect();

    await Promise.all(reactions.map((reaction) => ctx.db.delete(reaction._id)));

    // Delete the reply
    await ctx.db.delete(args.replyId);

    // **CRITICAL: Update reply count**
    await ctx.db.patch(reply.threadId, {
      replyCount: Math.max(0, thread.replyCount - 1),
    });

    return { success: true };
  },
});

// Search replies within a thread
export const searchRepliesInThread = query({
  args: {
    threadId: v.id("forumThreads"),
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.searchTerm.trim().length === 0) {
      return [];
    }

    const identity = await ctx.auth.getUserIdentity();
    let currentUser: any = null;
    let blockedUserIds = new Set<Id<"users">>();
    let blockedByUserIds = new Set<Id<"users">>();

    // Get blocking relationships if user is authenticated
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (currentUser) {
        const [blockedByMe, blockedMe] = await Promise.all([
          ctx.db
            .query("blocks")
            .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
            .collect(),
          ctx.db
            .query("blocks")
            .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
            .collect()
        ]);

        blockedUserIds = new Set(blockedByMe.map(block => block.blockedId));
        blockedByUserIds = new Set(blockedMe.map(block => block.blockerId));
      }
    }

    let limit = args.limit || 20;
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    // Search replies by content
    const searchResults = await ctx.db
      .query("forumReplies")
      .withSearchIndex("search_content", (q) => q.search("content", args.searchTerm.trim()))
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .take(limit * 2); // Get more to account for filtering

    // Filter and enrich with author details
    const enrichedResults = await Promise.all(
      searchResults.map(async (reply) => {
        const author = await ctx.db.get(reply.userId);
        if (!author) return null;

        // Filter blocked users
        if (currentUser && (blockedUserIds.has(author._id) || blockedByUserIds.has(author._id))) {
          return null;
        }
        
        // Get quoted reply if exists
        let quotedReplyDetails = null;
        if (reply.quotedReplyId) {
          const quotedReply = await ctx.db.get(reply.quotedReplyId);
          if (quotedReply) {
            const quotedAuthor = await ctx.db.get(quotedReply.userId);
            if (quotedAuthor && (!currentUser || (!blockedUserIds.has(quotedAuthor._id) && !blockedByUserIds.has(quotedAuthor._id)))) {
              quotedReplyDetails = {
                ...quotedReply,
                author: quotedAuthor,
              };
            }
          }
        }

        return {
          ...reply,
          author,
          quotedReply: quotedReplyDetails,
        };
      })
    );

    return enrichedResults.filter(result => result !== null).slice(0, limit);
  },
});

// Get recent replies across all threads (for activity feed)
export const getRecentReplies = query({
  args: {
    limit: v.optional(v.number()),
    excludeThreadIds: v.optional(v.array(v.id("forumThreads"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let currentUser: any = null;
    let blockedUserIds = new Set<Id<"users">>();
    let blockedByUserIds = new Set<Id<"users">>();

    // Get blocking relationships if user is authenticated
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (currentUser) {
        const [blockedByMe, blockedMe] = await Promise.all([
          ctx.db
            .query("blocks")
            .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
            .collect(),
          ctx.db
            .query("blocks")
            .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
            .collect()
        ]);

        blockedUserIds = new Set(blockedByMe.map(block => block.blockedId));
        blockedByUserIds = new Set(blockedMe.map(block => block.blockerId));
      }
    }

    let limit = args.limit || 15;
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 15;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    // Get recent replies
    let replies = await ctx.db
      .query("forumReplies")
      .order("desc")
      .take(limit * 3); // Get more to account for filtering

    // Filter out excluded threads
    if (args.excludeThreadIds && args.excludeThreadIds.length > 0) {
      const excludeSet = new Set(args.excludeThreadIds);
      replies = replies.filter(reply => !excludeSet.has(reply.threadId));
    }

    // Enrich with details and filter blocked users
    const enrichedReplies = await Promise.all(
      replies.map(async (reply) => {
        const author = await ctx.db.get(reply.userId);
        if (!author) return null;

        // Filter blocked users
        if (currentUser && (blockedUserIds.has(author._id) || blockedByUserIds.has(author._id))) {
          return null;
        }

        const thread = await ctx.db.get(reply.threadId);
        if (!thread) return null;
        
        let category = null;
        if (thread) {
          category = await ctx.db.get(thread.categoryId);
        }

        // Get quoted reply if exists
        let quotedReplyDetails = null;
        if (reply.quotedReplyId) {
          const quotedReply = await ctx.db.get(reply.quotedReplyId);
          if (quotedReply) {
            const quotedAuthor = await ctx.db.get(quotedReply.userId);
            if (quotedAuthor && (!currentUser || (!blockedUserIds.has(quotedAuthor._id) && !blockedByUserIds.has(quotedAuthor._id)))) {
              quotedReplyDetails = {
                ...quotedReply,
                author: quotedAuthor,
              };
            }
          }
        }

        return {
          ...reply,
          author,
          thread,
          category,
          quotedReply: quotedReplyDetails,
        };
      })
    );

    // Filter out replies where thread/category couldn't be loaded or user is blocked
    return enrichedReplies
      .filter(reply => reply !== null && reply.thread && reply.category)
      .slice(0, limit);
  },
});

// Get reply count for a thread (helper function)
export const getReplyCount = query({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    return thread?.replyCount || 0;
  },
});

// Get replies by user (for user profile)
export const getRepliesByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let currentUser: any = null;
    let blockedUserIds = new Set<Id<"users">>();
    let blockedByUserIds = new Set<Id<"users">>();

    // Get blocking relationships if user is authenticated
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (currentUser) {
        const [blockedByMe, blockedMe] = await Promise.all([
          ctx.db
            .query("blocks")
            .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
            .collect(),
          ctx.db
            .query("blocks")
            .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
            .collect()
        ]);

        blockedUserIds = new Set(blockedByMe.map(block => block.blockedId));
        blockedByUserIds = new Set(blockedMe.map(block => block.blockerId));
      }
    }

    // Check if the target user should be filtered
    if (currentUser && (blockedUserIds.has(args.userId) || blockedByUserIds.has(args.userId))) {
      return {
        page: [],
        isDone: true,
        continueCursor: null,
      };
    }

    // Validate pagination options
    let paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    
    if (paginationOpts.numItems) {
      if (typeof paginationOpts.numItems !== 'number' || isNaN(paginationOpts.numItems) || !isFinite(paginationOpts.numItems)) {
        paginationOpts.numItems = 20;
      }
      paginationOpts.numItems = Math.min(Math.max(Math.floor(paginationOpts.numItems), 1), 50);
    }

    const replies = await ctx.db
      .query("forumReplies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(paginationOpts);

    // Enrich with thread and category details
    const enrichedReplies = await Promise.all(
      replies.page.map(async (reply) => {
        const thread = await ctx.db.get(reply.threadId);
        let category = null;
        
        if (thread) {
          category = await ctx.db.get(thread.categoryId);
        }

        // Get quoted reply if exists
        let quotedReplyDetails = null;
        if (reply.quotedReplyId) {
          const quotedReply = await ctx.db.get(reply.quotedReplyId);
          if (quotedReply) {
            const quotedAuthor = await ctx.db.get(quotedReply.userId);
            if (quotedAuthor && (!currentUser || (!blockedUserIds.has(quotedAuthor._id) && !blockedByUserIds.has(quotedAuthor._id)))) {
              quotedReplyDetails = {
                ...quotedReply,
                author: quotedAuthor,
              };
            }
          }
        }

        return {
          ...reply,
          thread,
          category,
          quotedReply: quotedReplyDetails,
        };
      })
    );

    return {
      ...replies,
      page: enrichedReplies.filter(reply => reply.thread && reply.category),
    };
  },
});