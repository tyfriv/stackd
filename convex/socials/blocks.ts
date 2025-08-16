// convex/socials/blocks.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// Block a user
export const blockUser = mutation({
  args: {
    blockedId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Validate target user exists
    const targetUser = await ctx.db.get(args.blockedId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Can't block yourself
    if (currentUser._id === args.blockedId) {
      throw new Error("Cannot block yourself");
    }

    // Check if already blocked
    const existingBlock = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
      .filter((q) => q.eq(q.field("blockedId"), args.blockedId))
      .unique();

    if (existingBlock) {
      throw new Error("User is already blocked");
    }

    // Remove any existing follow relationships in both directions
    const [followingRelation, followerRelation] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", currentUser._id).eq("followingId", args.blockedId)
        )
        .unique(),
      ctx.db
        .query("follows")
        .withIndex("by_relationship", (q) => 
          q.eq("followerId", args.blockedId).eq("followingId", currentUser._id)
        )
        .unique(),
    ]);

    // Delete follow relationships if they exist
    const deletePromises = [];
    if (followingRelation) {
      deletePromises.push(ctx.db.delete(followingRelation._id));
    }
    if (followerRelation) {
      deletePromises.push(ctx.db.delete(followerRelation._id));
    }

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // Create block relationship
    const blockId = await ctx.db.insert("blocks", {
      blockerId: currentUser._id,
      blockedId: args.blockedId,
      createdAt: Date.now(),
    });

    return blockId;
  },
});

// Unblock a user
export const unblockUser = mutation({
  args: {
    blockedId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Find block relationship
    const blockRelationship = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
      .filter((q) => q.eq(q.field("blockedId"), args.blockedId))
      .unique();

    if (!blockRelationship) {
      throw new Error("User is not blocked");
    }

    // Delete block relationship
    await ctx.db.delete(blockRelationship._id);

    return { success: true };
  },
});

// Check if current user has blocked target user
export const isBlocked = query({
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

    const blockRelationship = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
      .filter((q) => q.eq(q.field("blockedId"), args.userId))
      .unique();

    return !!blockRelationship;
  },
});

// Check if current user is blocked by target user
export const isBlockedBy = query({
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

    const blockRelationship = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", args.userId))
      .filter((q) => q.eq(q.field("blockedId"), currentUser._id))
      .unique();

    return !!blockRelationship;
  },
});

// Get comprehensive blocking status between current user and target user
export const getBlockingStatus = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        isBlocked: false,
        isBlockedBy: false,
        canInteract: true,
      };
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return {
        isBlocked: false,
        isBlockedBy: false,
        canInteract: true,
      };
    }

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

    return {
      isBlocked,
      isBlockedBy,
      canInteract: !isBlocked && !isBlockedBy,
    };
  },
});

// Get list of blocked users for current user
export const getBlockedUsers = query({
  args: {
    paginationOpts: v.optional(v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const paginationOpts = args.paginationOpts || { numItems: 20, cursor: null };

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
      .order("desc")
      .paginate(paginationOpts);

    // Get blocked user details
    const blockedUsersWithDetails = await Promise.all(
      blocks.page.map(async (block) => {
        const blockedUser = await ctx.db.get(block.blockedId);
        if (!blockedUser) return null;

        return {
          user: blockedUser,
          blockedAt: block.createdAt,
        };
      })
    );

    return {
      ...blocks,
      page: blockedUsersWithDetails.filter((u) => u !== null),
    };
  },
});

// Utility function to filter out blocked users from user ID arrays
export const filterBlockedUsers = query({
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

    // Get users blocked by current user
    const blockedByMe = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", currentUser._id))
      .collect();

    const blockedByMeIds = new Set(blockedByMe.map((b) => b.blockedId));

    // Get users who blocked current user
    const blockedMe = await ctx.db
      .query("blocks")
      .withIndex("by_blocked", (q) => q.eq("blockedId", currentUser._id))
      .collect();

    const blockerIds = new Set(blockedMe.map((b) => b.blockerId));

    // Filter out blocked users in both directions
    return args.userIds.filter(
      (userId) => !blockedByMeIds.has(userId) && !blockerIds.has(userId)
    );
  },
});

// Check if any users in a list are blocked (useful for content visibility)
export const checkUsersBlocked = query({
  args: {
    userIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {}; // Return empty object if not authenticated
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return {};
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

    const blockedByMeIds = new Set(blockedByMe.map((b) => b.blockedId));
    const blockerIds = new Set(blockedMe.map((b) => b.blockerId));

    // Return blocking status for each user
    const result: Record<string, { isBlocked: boolean; isBlockedBy: boolean; canInteract: boolean }> = {};

    for (const userId of args.userIds) {
      const isBlocked = blockedByMeIds.has(userId);
      const isBlockedBy = blockerIds.has(userId);
      
      result[userId] = {
        isBlocked,
        isBlockedBy,
        canInteract: !isBlocked && !isBlockedBy,
      };
    }

    return result;
  },
});