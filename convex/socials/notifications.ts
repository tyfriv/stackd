// convex/socials/notifications.ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Get notifications for current user (real-time)
export const getNotifications = query({
  args: {
    limit: v.optional(v.number()),
    onlyUnread: v.optional(v.boolean()),
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

    const limit = args.limit || 20;
    let notificationQuery = ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", currentUser._id))
      .order("desc");

    if (args.onlyUnread) {
      notificationQuery = ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) => 
          q.eq("userId", currentUser._id).eq("isRead", false)
        )
        .order("desc");
    }

    const notifications = await notificationQuery.take(limit);

    // Enrich notifications with user details
    const enrichedNotifications = await Promise.all(
      notifications.map(async (notification) => {
        const fromUser = await ctx.db.get(notification.fromUserId);
        
        // Get target details if applicable
        let targetDetails = null;
        if (notification.targetId && notification.targetType) {
          try {
            if (notification.targetType === "log") {
              const log = await ctx.db.get(notification.targetId as Id<"logs">);
              if (log) {
                const media = await ctx.db.get(log.mediaId);
                targetDetails = { log, media };
              }
            } else if (notification.targetType === "thread") {
              const thread = await ctx.db.get(notification.targetId as Id<"forumThreads">);
              targetDetails = { thread };
            } else if (notification.targetType === "reply") {
              const reply = await ctx.db.get(notification.targetId as Id<"forumReplies">);
              if (reply) {
                const thread = await ctx.db.get(reply.threadId);
                targetDetails = { reply, thread };
              }
            }
          } catch (error) {
            console.warn("Failed to fetch target details:", error);
          }
        }

        return {
          ...notification,
          fromUser,
          targetDetails,
        };
      })
    );

    return enrichedNotifications.filter(n => n.fromUser !== null);
  },
});

// Get unread notification count (real-time)
export const getUnreadCount = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return 0;
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      return 0;
    }

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => 
        q.eq("userId", currentUser._id).eq("isRead", false)
      )
      .collect();

    return unreadNotifications.length;
  },
});

// Mark notification as read
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
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

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== currentUser._id) {
      throw new Error("Notification not found");
    }

    await ctx.db.patch(args.notificationId, {
      isRead: true,
    });

    return { success: true };
  },
});

// Mark all notifications as read
export const markAllAsRead = mutation({
  handler: async (ctx) => {
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

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => 
        q.eq("userId", currentUser._id).eq("isRead", false)
      )
      .collect();

    // Update all unread notifications
    await Promise.all(
      unreadNotifications.map((notification) =>
        ctx.db.patch(notification._id, { isRead: true })
      )
    );

    return { marked: unreadNotifications.length };
  },
});

// Delete notification
export const deleteNotification = mutation({
  args: {
    notificationId: v.id("notifications"),
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

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== currentUser._id) {
      throw new Error("Notification not found");
    }

    await ctx.db.delete(args.notificationId);
    return { success: true };
  },
});

// Helper function to create notifications (used by other mutations)
export const createNotification = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("follow"),
      v.literal("reaction"),
      v.literal("comment"),
      v.literal("reply"),
      v.literal("quote")
    ),
    fromUserId: v.id("users"),
    targetType: v.optional(v.union(v.literal("log"), v.literal("thread"), v.literal("reply"))),
    targetId: v.optional(v.string()),
    content: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Don't create notification for self
    if (args.userId === args.fromUserId) {
      return null;
    }

    // Check if target user has blocked the sender
    const isBlocked = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", args.userId))
      .filter((q) => q.eq(q.field("blockedId"), args.fromUserId))
      .unique();

    if (isBlocked) {
      return null; // Don't create notification for blocked users
    }

    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      fromUserId: args.fromUserId,
      targetType: args.targetType,
      targetId: args.targetId,
      content: args.content,
      metadata: args.metadata,
      isRead: false,
      createdAt: Date.now(),
    });

    return notificationId;
  },
});

// Clean up old notifications (optional maintenance function)
export const cleanupOldNotifications = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysToKeep = args.olderThanDays || 30;
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const oldNotifications = await ctx.db
      .query("notifications")
      .filter((q) => q.lt(q.field("createdAt"), cutoffTime))
      .collect();

    // Delete old notifications in batches
    const batchSize = 100;
    for (let i = 0; i < oldNotifications.length; i += batchSize) {
      const batch = oldNotifications.slice(i, i + batchSize);
      await Promise.all(
        batch.map((notification) => ctx.db.delete(notification._id))
      );
    }

    return { deleted: oldNotifications.length };
  },
});