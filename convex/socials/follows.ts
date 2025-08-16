// convex/socials/follows.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { notifyFollow } from "../lib/notificationHelpers";
import { createError } from "../lib/errors";

// Follow a user
export const follow = mutation({
  args: {
    followingId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw createError("AUTH_ERROR", "Not authenticated");
    }

    // SECURITY FIX: Add rate limiting for follows
    const rateLimitAllowed = await ctx.runMutation(internal.rateLimits.checkRateLimit, {
      key: `follow_${identity.subject}`,
      limit: 50, // 50 follows per hour
      windowMs: 60 * 60 * 1000
    });

    if (!rateLimitAllowed) {
      throw createError("RATE_LIMITED", "Rate limit exceeded for follow actions");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw createError("NOT_FOUND", "User not found");
    }

    // Validate target user exists
    const targetUser = await ctx.db.get(args.followingId);
    if (!targetUser) {
      throw createError("NOT_FOUND", "Target user not found");
    }

    // Can't follow yourself
    if (currentUser._id === args.followingId) {
      throw createError("VALIDATION_ERROR", "Cannot follow yourself");
    }

    // Check if already following
    const existingFollow = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) => 
        q.eq("followerId", currentUser._id).eq("followingId", args.followingId)
      )
      .unique();

    if (existingFollow) {
      throw createError("DUPLICATE_RESOURCE", "Already following this user");
    }

    // Check if target user has blocked current user
    const isBlockedBy = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", args.followingId))
      .filter((q) => q.eq(q.field("blockedId"), currentUser._id))
      .unique();

    if (isBlockedBy) {
      throw createError("UNAUTHORIZED", "Cannot follow this user");
    }

    // Create follow relationship
    const followId = await ctx.db.insert("follows", {
      followerId: currentUser._id,
      followingId: args.followingId,
      createdAt: Date.now(),
    });

    // Create notification using helper
    await notifyFollow(ctx, args.followingId, currentUser._id);

    return followId;
  },
});

// Unfollow a user
export const unfollow = mutation({
  args: {
    followingId: v.id("users"),
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

    // Find follow relationship
    const followRelationship = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) => 
        q.eq("followerId", currentUser._id).eq("followingId", args.followingId)
      )
      .unique();

    if (!followRelationship) {
      throw createError("NOT_FOUND", "Not following this user");
    }

    // Delete follow relationship
    await ctx.db.delete(followRelationship._id);

    return { success: true };
  },
});

// Check if current user follows target user
export const isFollowing = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return false;
    }

    const followRelationship = await ctx.db
      .query("follows")
      .withIndex("by_relationship", (q) => 
        q.eq("followerId", currentUser._id).eq("followingId", args.userId)
      )
      .unique();

    return !!followRelationship;
  },
});

// Get followers for a user
export const getFollowers = query({
  args: {
    userId: v.id("users"),
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    // SECURITY FIX: Validate pagination options
    let paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    
    if (paginationOpts.numItems) {
      if (typeof paginationOpts.numItems !== 'number' || isNaN(paginationOpts.numItems) || !isFinite(paginationOpts.numItems)) {
        paginationOpts.numItems = 20;
      }
      paginationOpts.numItems = Math.min(Math.max(Math.floor(paginationOpts.numItems), 1), 100);
    }

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", args.userId))
      .order("desc")
      .paginate(paginationOpts);

    // Get user details for each follower
    const followersWithDetails = await Promise.all(
      follows.page.map(async (follow) => {
        const follower = await ctx.db.get(follow.followerId);
        if (!follower) return null;

        return {
          user: follower,
          followedAt: follow.createdAt,
        };
      })
    );

    return {
      ...follows,
      page: followersWithDetails.filter((f) => f !== null),
    };
  },
});

// Get users that a user is following
export const getFollowing = query({
  args: {
    userId: v.id("users"),
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    // SECURITY FIX: Validate pagination options
    let paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };
    
    if (paginationOpts.numItems) {
      if (typeof paginationOpts.numItems !== 'number' || isNaN(paginationOpts.numItems) || !isFinite(paginationOpts.numItems)) {
        paginationOpts.numItems = 20;
      }
      paginationOpts.numItems = Math.min(Math.max(Math.floor(paginationOpts.numItems), 1), 100);
    }

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_created", (q) => q.eq("followerId", args.userId))
      .order("desc")
      .paginate(paginationOpts);

    // Get user details for each following
    const followingWithDetails = await Promise.all(
      follows.page.map(async (follow) => {
        const followingUser = await ctx.db.get(follow.followingId);
        if (!followingUser) return null;

        return {
          user: followingUser,
          followedAt: follow.createdAt,
        };
      })
    );

    return {
      ...follows,
      page: followingWithDetails.filter((f) => f !== null),
    };
  },
});

// Get follow counts for a user
export const getFollowCounts = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [followersCount, followingCount] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_following", (q) => q.eq("followingId", args.userId))
        .collect()
        .then((follows) => follows.length),
      ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
        .collect()
        .then((follows) => follows.length),
    ]);

    return {
      followers: followersCount,
      following: followingCount,
    };
  },
});

// Get mutual followers between current user and target user
export const getMutualFollows = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser._id === args.userId) {
      return [];
    }

    // SECURITY FIX: Validate limit parameter
    let limit = args.limit || 5;
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 5;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 20);

    // Get users that current user follows
    const currentUserFollowing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect();

    const currentUserFollowingIds = new Set(
      currentUserFollowing.map((f) => f.followingId)
    );

    // Get users that target user follows
    const targetUserFollowing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .take(100); // Reasonable limit for comparison

    // Find mutual follows
    const mutualUserIds: Id<"users">[] = [];
    for (const follow of targetUserFollowing) {
      if (currentUserFollowingIds.has(follow.followingId)) {
        mutualUserIds.push(follow.followingId);
        if (mutualUserIds.length >= limit) break;
      }
    }

    // Get user details
    const mutualUsers = await Promise.all(
      mutualUserIds.map((id) => ctx.db.get(id))
    );

    return mutualUsers.filter((user) => user !== null);
  },
});

// Get follow suggestions (users not followed by current user)
export const getFollowSuggestions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return [];
    }

    // SECURITY FIX: Validate limit parameter
    let limit = args.limit || 10;
    if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
      limit = 10;
    }
    limit = Math.min(Math.max(Math.floor(limit), 1), 50);

    // Get users current user is following
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
      .collect();

    const followingIds = new Set(following.map((f) => f.followingId));

    // Get users who have blocked current user
    const blockedMe = await ctx.db
      .query("blocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
      .collect();

    const blockedMeIds = new Set(blockedMe.map((b) => b.blockerId));

    // Get users current user has blocked
    const blockedByMe = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
      .collect();

    const blockedByMeIds = new Set(blockedByMe.map((b) => b.blockedId));

    // Get recent users (simple suggestion algorithm)
    const allUsers = await ctx.db
      .query("users")
      .order("desc")
      .take(limit * 3); // Get more to filter

    const suggestions = allUsers
      .filter((user) => 
        user._id !== currentUser._id && // Not self
        !followingIds.has(user._id) && // Not already following
        !blockedMeIds.has(user._id) && // Not blocked by them
        !blockedByMeIds.has(user._id) // Haven't blocked them
      )
      .slice(0, limit);

    return suggestions;
  },
});