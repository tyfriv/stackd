import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get current authenticated user (read only)
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null; // Not authenticated
    }

    // Only find existing user, don't create
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return user;
  },
});

// Create user if doesn't exist (mutation)
export const createUserIfNotExists = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existingUser) {
      return existingUser._id;
    }

    // Safe username generation
    const generateUsername = (): string => {
      if (identity.username && typeof identity.username === 'string') {
        return identity.username.trim();
      }
      if (identity.email && typeof identity.email === 'string') {
        const emailPrefix = identity.email.split('@')[0];
        return emailPrefix.replace(/[^a-zA-Z0-9_]/g, ''); // Clean special chars
      }
      return `user_${Date.now()}`;
    };

    // Create new user with validated data
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      username: generateUsername(),
      email: (identity.email && typeof identity.email === 'string') ? identity.email : '',
      profileImage: (identity.pictureUrl && typeof identity.pictureUrl === 'string') ? identity.pictureUrl : undefined,
      bio: undefined,
      createdAt: Date.now(),
      topMovies: [],
      topTvShows: [],
      topGames: [],
      topMusic: [],
    });

    return userId;
  },
});

// Get user by ID
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Get user by username
export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

// Update user profile (bio and profile image only - showcases handled separately)
export const updateProfile = mutation({
  args: {
    bio: v.optional(v.string()),
    profileImage: v.optional(v.string()),
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

    await ctx.db.patch(user._id, {
      bio: args.bio,
      profileImage: args.profileImage,
    });

    return user._id;
  },
});

// Check if username is available
export const checkUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();

    return existingUser === null;
  },
});

// Note: updateTopShowcases has been removed - use the dedicated showcase operations instead:
// - addToShowcase
// - removeFromShowcase 
// - reorderShowcase
// - replaceShowcase
// - batchUpdateShowcases
// Import these from convex/showcases/index.ts