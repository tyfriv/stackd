import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { sanitizeUsername, validateUsername, sanitizeBio } from "./lib/validation";

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

    // Safe username generation with proper validation
    const generateUsername = (): string => {
      let proposedUsername = '';
      
      if (identity.username && typeof identity.username === 'string') {
        proposedUsername = sanitizeUsername(identity.username);
      } else if (identity.email && typeof identity.email === 'string') {
        const emailPrefix = identity.email.split('@')[0];
        proposedUsername = sanitizeUsername(emailPrefix);
      }
      
      // Ensure username meets validation requirements
      if (!validateUsername(proposedUsername)) {
        proposedUsername = `user_${Date.now()}`;
      }
      
      return proposedUsername;
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

    // SECURITY FIX: Add rate limiting for profile updates
    const { internal } = await import("./_generated/api");
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: `update_profile_${identity.subject}`,
      limit: 10, // 10 profile updates per hour
      windowMs: 60 * 60 * 1000
    });

    if (!rateLimitAllowed) {
      throw new Error("Rate limit exceeded for profile updates");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // SECURITY FIX: Sanitize bio content
    let sanitizedBio = undefined;
    if (args.bio !== undefined) {
      sanitizedBio = args.bio.length > 0 ? sanitizeBio(args.bio) : undefined;
    }

    await ctx.db.patch(user._id, {
      bio: sanitizedBio,
      profileImage: args.profileImage,
    });

    return user._id;
  },
});

// Check if username is available
export const checkUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // SECURITY FIX: Validate username before checking availability
    if (!validateUsername(args.username)) {
      return false; // Invalid usernames are not available
    }

    const sanitizedUsername = sanitizeUsername(args.username);
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", sanitizedUsername))
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