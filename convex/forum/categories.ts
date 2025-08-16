// convex/forum/categories.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { createError } from "../lib/errors";

// Get all forum categories (ordered by order field)
export const getCategories = query({
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("forumCategories")
      .withIndex("by_order", (q) => q.gte("order", 0))
      .order("asc")
      .collect();

    return categories;
  },
});

// Get category by ID
export const getCategory = query({
  args: { categoryId: v.id("forumCategories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw createError("NOT_FOUND", "Category not found");
    }
    return category;
  },
});

// Create forum category (admin only - you might want to add role checking)
export const createCategory = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // Validate input
    if (args.name.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Category name cannot be empty");
    }

    if (args.description.trim().length === 0) {
      throw createError("VALIDATION_ERROR", "Category description cannot be empty");
    }

    // Check if category with same name exists
    const existingCategory = await ctx.db
      .query("forumCategories")
      .filter((q) => q.eq(q.field("name"), args.name.trim()))
      .unique();

    if (existingCategory) {
      throw createError("DUPLICATE_RESOURCE", "Category with this name already exists");
    }

    const categoryId = await ctx.db.insert("forumCategories", {
      name: args.name.trim(),
      description: args.description.trim(),
      order: args.order,
    });

    return categoryId;
  },
});

// Initialize default categories
export const initializeDefaultCategories = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // Check if categories already exist
    const existingCategories = await ctx.db.query("forumCategories").collect();
    if (existingCategories.length > 0) {
      return { message: "Categories already exist", count: existingCategories.length };
    }

    const defaultCategories = [
      { name: "Film & TV", description: "Discuss movies, television shows, and streaming content", order: 1 },
      { name: "Music", description: "Talk about albums, artists, concerts, and all things music", order: 2 },
      { name: "Gaming", description: "Video games, board games, and gaming culture", order: 3 },
      { name: "Sports", description: "Sports discussions, teams, and events", order: 4 },
      { name: "General", description: "General discussions and announcements", order: 5 },
      { name: "Off Topic", description: "Everything else that doesn't fit in other categories", order: 6 },
    ];

    const categoryIds = await Promise.all(
      defaultCategories.map((category) =>
        ctx.db.insert("forumCategories", category)
      )
    );

    return { 
      message: "Default categories created successfully", 
      count: categoryIds.length,
      categoryIds 
    };
  },
});

// Update category order (admin only)
export const updateCategoryOrder = mutation({
  args: {
    categoryId: v.id("forumCategories"),
    newOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw createError("NOT_FOUND", "Category not found");
    }

    await ctx.db.patch(args.categoryId, {
      order: args.newOrder,
    });

    return { success: true };
  },
});

// Get category with thread count
export const getCategoryWithStats = query({
  args: { categoryId: v.id("forumCategories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw createError("NOT_FOUND", "Category not found");
    }

    // Get thread count for this category
    const threads = await ctx.db
      .query("forumThreads")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();

    // Get total reply count across all threads
    const totalReplies = threads.reduce((sum, thread) => sum + thread.replyCount, 0);

    // Get latest thread
    const latestThread = threads.length > 0 
      ? threads.reduce((latest, current) => 
          current.lastActivityAt > latest.lastActivityAt ? current : latest
        )
      : null;

    return {
      ...category,
      stats: {
        threadCount: threads.length,
        totalReplies,
        latestThread,
      },
    };
  },
});

// Get all categories with stats
export const getCategoriesWithStats = query({
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("forumCategories")
      .withIndex("by_order", (q) => q.gte("order", 0))
      .order("asc")
      .collect();

    const categoriesWithStats = await Promise.all(
      categories.map(async (category) => {
        // Get threads for this category
        const threads = await ctx.db
          .query("forumThreads")
          .withIndex("by_category", (q) => q.eq("categoryId", category._id))
          .collect();

        // Calculate stats
        const threadCount = threads.length;
        const totalReplies = threads.reduce((sum, thread) => sum + thread.replyCount, 0);
        
        // Get latest activity
        const latestThread = threads.length > 0 
          ? threads.reduce((latest, current) => 
              current.lastActivityAt > latest.lastActivityAt ? current : latest
            )
          : null;

        let latestActivity = null;
        if (latestThread) {
          const author = await ctx.db.get(latestThread.userId);
          latestActivity = {
            thread: latestThread,
            author,
            timestamp: latestThread.lastActivityAt,
          };
        }

        return {
          ...category,
          stats: {
            threadCount,
            totalReplies,
            latestActivity,
          },
        };
      })
    );

    return categoriesWithStats;
  },
});