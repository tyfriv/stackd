// convex/forum/search.ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Comprehensive forum search (threads + replies)
export const searchForum = query({
  args: {
    searchTerm: v.string(),
    categoryId: v.optional(v.id("forumCategories")),
    searchType: v.optional(v.union(
      v.literal("all"),
      v.literal("threads"),
      v.literal("replies")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.searchTerm.trim().length === 0) {
      return {
        threads: [],
        replies: [],
        total: 0,
      };
    }

    const searchType = args.searchType || "all";
    let limit = args.limit || 20;
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    const halfLimit = Math.ceil(limit / 2);

    let threadResults: any[] = [];
    let replyResults: any[] = [];

    // Search threads
    if (searchType === "all" || searchType === "threads") {
      // Search by title
      const titleResults = await ctx.db
        .query("forumThreads")
        .withSearchIndex("search_title", (q) => q.search("title", args.searchTerm.trim()))
        .take(halfLimit);

      // Search by content
      const contentResults = await ctx.db
        .query("forumThreads")
        .withSearchIndex("search_content", (q) => q.search("content", args.searchTerm.trim()))
        .take(halfLimit);

      // Combine and deduplicate thread results
      const allThreadResults = [...titleResults, ...contentResults];
      const uniqueThreadResults = allThreadResults.filter((thread, index, array) => 
        array.findIndex(t => t._id === thread._id) === index
      );

      // Filter by category if specified
      let filteredThreadResults = uniqueThreadResults;
      if (args.categoryId) {
        filteredThreadResults = uniqueThreadResults.filter(
          thread => thread.categoryId === args.categoryId
        );
      }

      // Sort by relevance (title matches first, then by last activity)
      filteredThreadResults.sort((a, b) => {
        const aInTitle = a.title.toLowerCase().includes(args.searchTerm.toLowerCase());
        const bInTitle = b.title.toLowerCase().includes(args.searchTerm.toLowerCase());
        
        if (aInTitle && !bInTitle) return -1;
        if (!aInTitle && bInTitle) return 1;
        
        return b.lastActivityAt - a.lastActivityAt;
      });

      // Limit and enrich thread results
      const limitedThreadResults = filteredThreadResults.slice(0, searchType === "threads" ? limit : halfLimit);
      
      threadResults = await Promise.all(
        limitedThreadResults.map(async (thread) => {
          const author = await ctx.db.get(thread.userId);
          const category = await ctx.db.get(thread.categoryId);
          
          return {
            ...thread,
            author,
            category,
            type: "thread" as const,
          };
        })
      );
    }

    // Search replies
    if (searchType === "all" || searchType === "replies") {
      let replySearchResults = await ctx.db
        .query("forumReplies")
        .withSearchIndex("search_content", (q) => q.search("content", args.searchTerm.trim()))
        .take(searchType === "replies" ? limit : halfLimit);

      // Filter by category if specified (check thread's category)
      if (args.categoryId) {
        const filteredReplies: typeof replySearchResults = [];
        
        for (const reply of replySearchResults) {
          const thread = await ctx.db.get(reply.threadId);
          if (thread && thread.categoryId === args.categoryId) {
            filteredReplies.push(reply);
          }
        }
        
        replySearchResults = filteredReplies;
      }

      // Sort by creation date (most recent first)
      replySearchResults.sort((a, b) => b.createdAt - a.createdAt);

      // Enrich reply results
      replyResults = await Promise.all(
        replySearchResults.map(async (reply) => {
          const author = await ctx.db.get(reply.userId);
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
            category,
            quotedReply: quotedReplyDetails,
            type: "reply" as const,
          };
        })
      );

      // Filter out replies where thread/category couldn't be loaded
      replyResults = replyResults.filter(reply => reply.thread && reply.category);
    }

    return {
      threads: threadResults,
      replies: replyResults,
      total: threadResults.length + replyResults.length,
    };
  },
});

// Search for threads and replies by specific user
export const searchUserContent = query({
  args: {
    userId: v.id("users"),
    searchTerm: v.string(),
    contentType: v.optional(v.union(
      v.literal("all"),
      v.literal("threads"),
      v.literal("replies")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.searchTerm.trim().length === 0) {
      return {
        threads: [],
        replies: [],
        total: 0,
      };
    }

    const contentType = args.contentType || "all";
    let limit = args.limit || 20;
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    const halfLimit = Math.ceil(limit / 2);

    let threadResults: any[] = [];
    let replyResults: any[] = [];

    // Search user's threads
    if (contentType === "all" || contentType === "threads") {
      // Get user's threads first
      const userThreads = await ctx.db
        .query("forumThreads")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      // Filter threads by search term
      const filteredThreads = userThreads.filter(thread => 
        thread.title.toLowerCase().includes(args.searchTerm.toLowerCase()) ||
        thread.content.toLowerCase().includes(args.searchTerm.toLowerCase())
      );

      // Sort by last activity
      filteredThreads.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

      // Limit results
      const limitedThreads = filteredThreads.slice(0, contentType === "threads" ? limit : halfLimit);

      // Enrich thread results
      threadResults = await Promise.all(
        limitedThreads.map(async (thread) => {
          const author = await ctx.db.get(thread.userId);
          const category = await ctx.db.get(thread.categoryId);
          
          return {
            ...thread,
            author,
            category,
            type: "thread" as const,
          };
        })
      );
    }

    // Search user's replies
    if (contentType === "all" || contentType === "replies") {
      // Get user's replies first
      const userReplies = await ctx.db
        .query("forumReplies")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      // Filter replies by search term
      const filteredReplies = userReplies.filter(reply =>
        reply.content.toLowerCase().includes(args.searchTerm.toLowerCase())
      );

      // Sort by creation date
      filteredReplies.sort((a, b) => b.createdAt - a.createdAt);

      // Limit results
      const limitedReplies = filteredReplies.slice(0, contentType === "replies" ? limit : halfLimit);

      // Enrich reply results
      replyResults = await Promise.all(
        limitedReplies.map(async (reply) => {
          const author = await ctx.db.get(reply.userId);
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
            category,
            quotedReply: quotedReplyDetails,
            type: "reply" as const,
          };
        })
      );

      // Filter out replies where thread/category couldn't be loaded
      replyResults = replyResults.filter(reply => reply.thread && reply.category);
    }

    return {
      threads: threadResults,
      replies: replyResults,
      total: threadResults.length + replyResults.length,
    };
  },
});

// Advanced forum search with filters
export const advancedForumSearch = query({
  args: {
    searchTerm: v.string(),
    categoryId: v.optional(v.id("forumCategories")),
    authorId: v.optional(v.id("users")),
    dateRange: v.optional(v.object({
      startDate: v.number(), // UTC timestamp
      endDate: v.number(),   // UTC timestamp
    })),
    searchType: v.optional(v.union(
      v.literal("all"),
      v.literal("threads"),
      v.literal("replies")
    )),
    sortBy: v.optional(v.union(
      v.literal("relevance"),
      v.literal("date"),
      v.literal("activity")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.searchTerm.trim().length === 0) {
      return {
        threads: [],
        replies: [],
        total: 0,
      };
    }

    const searchType = args.searchType || "all";
    const sortBy = args.sortBy || "relevance";
    let limit = args.limit || 20;
    
    // Validate limit
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 20;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    const halfLimit = Math.ceil(limit / 2);

    let threadResults: any[] = [];
    let replyResults: any[] = [];

    // Search threads with filters
    if (searchType === "all" || searchType === "threads") {
      // Get initial search results
      const titleResults = await ctx.db
        .query("forumThreads")
        .withSearchIndex("search_title", (q) => q.search("title", args.searchTerm.trim()))
        .take(100); // Get more for filtering

      const contentResults = await ctx.db
        .query("forumThreads")
        .withSearchIndex("search_content", (q) => q.search("content", args.searchTerm.trim()))
        .take(100);

      // Combine and deduplicate
      const allThreadResults = [...titleResults, ...contentResults];
      const uniqueThreadResults = allThreadResults.filter((thread, index, array) => 
        array.findIndex(t => t._id === thread._id) === index
      );

      // Apply filters
      let filteredResults = uniqueThreadResults;

      // Category filter
      if (args.categoryId) {
        filteredResults = filteredResults.filter(
          thread => thread.categoryId === args.categoryId
        );
      }

      // Author filter
      if (args.authorId) {
        filteredResults = filteredResults.filter(
          thread => thread.userId === args.authorId
        );
      }

      // Date range filter
      if (args.dateRange) {
        filteredResults = filteredResults.filter(
          thread => thread.createdAt >= args.dateRange!.startDate && 
                    thread.createdAt <= args.dateRange!.endDate
        );
      }

      // Apply sorting
      if (sortBy === "relevance") {
        filteredResults.sort((a, b) => {
          const aInTitle = a.title.toLowerCase().includes(args.searchTerm.toLowerCase());
          const bInTitle = b.title.toLowerCase().includes(args.searchTerm.toLowerCase());
          
          if (aInTitle && !bInTitle) return -1;
          if (!aInTitle && bInTitle) return 1;
          
          return b.lastActivityAt - a.lastActivityAt;
        });
      } else if (sortBy === "date") {
        filteredResults.sort((a, b) => b.createdAt - a.createdAt);
      } else if (sortBy === "activity") {
        filteredResults.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
      }

      // Limit and enrich results
      const limitedResults = filteredResults.slice(0, searchType === "threads" ? limit : halfLimit);
      
      threadResults = await Promise.all(
        limitedResults.map(async (thread) => {
          const author = await ctx.db.get(thread.userId);
          const category = await ctx.db.get(thread.categoryId);
          
          return {
            ...thread,
            author,
            category,
            type: "thread" as const,
          };
        })
      );
    }

    // Search replies with filters
    if (searchType === "all" || searchType === "replies") {
      // Get initial search results
      let replySearchResults = await ctx.db
        .query("forumReplies")
        .withSearchIndex("search_content", (q) => q.search("content", args.searchTerm.trim()))
        .take(100); // Get more for filtering

      // Apply filters
      let filteredResults = replySearchResults;

      // Author filter
      if (args.authorId) {
        filteredResults = filteredResults.filter(
          reply => reply.userId === args.authorId
        );
      }

      // Date range filter
      if (args.dateRange) {
        filteredResults = filteredResults.filter(
          reply => reply.createdAt >= args.dateRange!.startDate && 
                   reply.createdAt <= args.dateRange!.endDate
        );
      }

      // Category filter (need to check thread's category)
      if (args.categoryId) {
        const categoryFilteredReplies: typeof filteredResults = [];
        
        for (const reply of filteredResults) {
          const thread = await ctx.db.get(reply.threadId);
          if (thread && thread.categoryId === args.categoryId) {
            categoryFilteredReplies.push(reply);
          }
        }
        
        filteredResults = categoryFilteredReplies;
      }

      // Apply sorting
      if (sortBy === "date" || sortBy === "relevance") {
        filteredResults.sort((a, b) => b.createdAt - a.createdAt);
      } else if (sortBy === "activity") {
        // For replies, sort by thread's last activity
        const repliesWithActivity = await Promise.all(
          filteredResults.map(async (reply) => {
            const thread = await ctx.db.get(reply.threadId);
            return {
              ...reply,
              threadActivity: thread?.lastActivityAt || reply.createdAt,
            };
          })
        );
        
        repliesWithActivity.sort((a, b) => b.threadActivity - a.threadActivity);
        filteredResults = repliesWithActivity;
      }

      // Limit results
      const limitedResults = filteredResults.slice(0, searchType === "replies" ? limit : halfLimit);

      // Enrich reply results
      replyResults = await Promise.all(
        limitedResults.map(async (reply) => {
          const author = await ctx.db.get(reply.userId);
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
            category,
            quotedReply: quotedReplyDetails,
            type: "reply" as const,
          };
        })
      );

      // Filter out replies where thread/category couldn't be loaded
      replyResults = replyResults.filter(reply => reply.thread && reply.category);
    }

    return {
      threads: threadResults,
      replies: replyResults,
      total: threadResults.length + replyResults.length,
    };
  },
});