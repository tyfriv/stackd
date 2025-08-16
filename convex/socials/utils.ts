// convex/socials/utils.ts
import { v } from "convex/values";
import { query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Helper function to get social context between current user and target user
export const getSocialContext = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isFollowing: false,
        isFollowedBy: false,
        isBlocked: false,
        isBlockedBy: false,
        canInteract: true,
        canFollow: false,
      };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser._id === args.userId) {
      return {
        isFollowing: false,
        isFollowedBy: false,
        isBlocked: false,
        isBlockedBy: false,
        canInteract: false,
        canFollow: false,
      };
    }

    // Get all relationships in parallel
    const [
      isFollowing,
      isFollowedBy,
      isBlocked,
      isBlockedBy,
    ] = await Promise.all([
      // Is current user following target user?
      ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", currentUser._id).eq("followingId", args.userId)
        )
        .unique()
        .then((follow) => !!follow),
      
      // Is target user following current user?
      ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", args.userId).eq("followingId", currentUser._id)
        )
        .unique()
        .then((follow) => !!follow),
      
      // Has current user blocked target user?
      ctx.db
        .query("blocks")
        .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
        .filter((q) => q.eq(q.field("blockedId"), args.userId))
        .unique()
        .then((block) => !!block),
      
      // Has target user blocked current user?
      ctx.db
        .query("blocks")
        .withIndex("by_blocker", (q) => q.eq("blockerId", args.userId))
        .filter((q) => q.eq(q.field("blockedId"), currentUser._id))
        .unique()
        .then((block) => !!block),
    ]);

    const canInteract = !isBlocked && !isBlockedBy;
    const canFollow = canInteract && !isFollowing;

    return {
      isFollowing,
      isFollowedBy,
      isBlocked,
      isBlockedBy,
      canInteract,
      canFollow,
    };
  },
});

// Get social stats for a user (followers, following, mutual connections)
export const getSocialStats = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    // Get basic counts
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

    // Get mutual follows if current user exists and is different from target
    let mutualCount = 0;
    if (currentUser && currentUser._id !== args.userId) {
      // Get users that current user follows
      const currentUserFollowing = await ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
        .collect();

      const currentUserFollowingIds = new Set(
        currentUserFollowing.map((f) => f.followingId)
      );

      // Get users that target user follows and count mutual
      const targetUserFollowing = await ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
        .collect();

      mutualCount = targetUserFollowing.filter((follow) =>
        currentUserFollowingIds.has(follow.followingId)
      ).length;
    }

    return {
      followers: followersCount,
      following: followingCount,
      mutualFollows: mutualCount,
    };
  },
});

// Check if a user can see another user's content based on privacy settings
export const canSeeUserContent = query({
  args: {
    userId: v.id("users"),
    visibility: v.union(v.literal("public"), v.literal("followers"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    // Public content is visible to everyone
    if (args.visibility === "public") {
      return true;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false; // Must be logged in to see non-public content
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return false;
    }

    // Users can always see their own content
    if (currentUser._id === args.userId) {
      return true;
    }

    // Private content is only visible to the owner
    if (args.visibility === "private") {
      return false;
    }

    // For followers-only content, check if current user follows the content owner
    if (args.visibility === "followers") {
      // Check if there's a blocking relationship first
      const [isBlocked, isBlockedBy] = await Promise.all([
        ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
          .filter((q) => q.eq(q.field("blockedId"), args.userId))
          .unique()
          .then((block) => !!block),
        ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", args.userId))
          .filter((q) => q.eq(q.field("blockedId"), currentUser._id))
          .unique()
          .then((block) => !!block),
      ]);

      // Can't see content if there's any blocking relationship
      if (isBlocked || isBlockedBy) {
        return false;
      }

      // Check if current user follows the content owner
      const followRelationship = await ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", currentUser._id).eq("followingId", args.userId)
        )
        .unique();

      return !!followRelationship;
    }

    return false;
  },
});

// Batch check if current user can see multiple users' content
export const canSeeUsersContent = query({
  args: {
    userVisibilityPairs: v.array(v.object({
      userId: v.id("users"),
      visibility: v.union(v.literal("public"), v.literal("followers"), v.literal("private")),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    let currentUser = null;
    if (identity) {
      currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
    }

    // If not authenticated, only public content is visible
    if (!currentUser) {
      return args.userVisibilityPairs.reduce((acc, pair) => {
        acc[pair.userId] = pair.visibility === "public";
        return acc;
      }, {} as Record<string, boolean>);
    }

    // Get all unique user IDs
    const userIds = [...new Set(args.userVisibilityPairs.map(pair => pair.userId))];

    // Get blocking relationships for all users
    const [blockedByMe, blockedMe, followedByMe] = await Promise.all([
      ctx.db
        .query("blocks")
        .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
        .collect(),
      ctx.db
        .query("blocks")
        .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
        .collect(),
      ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", currentUser._id))
        .collect(),
    ]);

    const blockedByMeIds = new Set(blockedByMe.map(b => b.blockedId));
    const blockerIds = new Set(blockedMe.map(b => b.blockerId));
    const followedByMeIds = new Set(followedByMe.map(f => f.followingId));

    // Check visibility for each pair
    const result: Record<string, boolean> = {};

    for (const pair of args.userVisibilityPairs) {
      const { userId, visibility } = pair;

      // Users can always see their own content
      if (currentUser._id === userId) {
        result[userId] = true;
        continue;
      }

      // Public content is visible to everyone
      if (visibility === "public") {
        result[userId] = true;
        continue;
      }

      // Private content is only visible to owner
      if (visibility === "private") {
        result[userId] = false;
        continue;
      }

      // For followers-only content
      if (visibility === "followers") {
        // Can't see if there's a blocking relationship
        if (blockedByMeIds.has(userId) || blockerIds.has(userId)) {
          result[userId] = false;
          continue;
        }

        // Can see if following the user
        result[userId] = followedByMeIds.has(userId);
        continue;
      }

      result[userId] = false;
    }

    return result;
  },
});

// Get user IDs that current user can interact with (not blocked in either direction)
export const getInteractableUsers = query({
  args: {
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return args.userIds; // Return all if not authenticated
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return args.userIds;
    }

    // Get blocking relationships
    const [blockedByMe, blockedMe] = await Promise.all([
      ctx.db
        .query("blocks")
        .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
        .collect(),
      ctx.db
        .query("blocks")
        .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
        .collect(),
    ]);

    const blockedByMeIds = new Set(blockedByMe.map(b => b.blockedId));
    const blockerIds = new Set(blockedMe.map(b => b.blockerId));

    // Filter out blocked users and users who blocked current user
    return args.userIds.filter(userId => 
      userId === currentUser._id || // Always include self
      (!blockedByMeIds.has(userId) && !blockerIds.has(userId))
    );
  },
});