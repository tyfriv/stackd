// convex/lib/notificationHelpers.ts
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { createError, logError } from "./errors";

// Helper function to create notifications with proper error handling
export async function createNotificationSafely(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    type: "follow" | "reaction" | "comment" | "reply" | "quote";
    fromUserId: Id<"users">;
    targetType?: "log" | "thread" | "reply";
    targetId?: string;
    content?: string;
    metadata?: any;
  }
) {
  try {
    // Don't create notification for self
    if (params.userId === params.fromUserId) {
      return null;
    }

    // Verify both users exist
    const [targetUser, fromUser] = await Promise.all([
      ctx.db.get(params.userId),
      ctx.db.get(params.fromUserId)
    ]);

    if (!targetUser || !fromUser) {
      console.warn("Cannot create notification: user not found");
      return null;
    }

    // Check if target user has blocked the sender
    const isBlocked = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", params.userId))
      .filter((q) => q.eq(q.field("blockedId"), params.fromUserId))
      .unique();

    if (isBlocked) {
      return null;
    }

    // Check for recent duplicate notifications to prevent spam
    const recentTimeThreshold = Date.now() - (5 * 60 * 1000); // 5 minutes ago

    if (params.targetId) {
      const existingNotification = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", params.userId))
        .filter((q) => 
          q.and(
            q.eq(q.field("type"), params.type),
            q.eq(q.field("fromUserId"), params.fromUserId),
            q.eq(q.field("targetId"), params.targetId),
            q.gt(q.field("createdAt"), recentTimeThreshold)
          )
        )
        .first();

      if (existingNotification) {
        return null; // Don't spam notifications
      }
    }

    // Sanitize content if provided
    let sanitizedContent = params.content;
    if (sanitizedContent && sanitizedContent.length > 200) {
      sanitizedContent = sanitizedContent.substring(0, 197) + "...";
    }

    const notificationId = await ctx.db.insert("notifications", {
      userId: params.userId,
      type: params.type,
      fromUserId: params.fromUserId,
      targetType: params.targetType || undefined,
      targetId: params.targetId || undefined,
      content: sanitizedContent || undefined,
      metadata: params.metadata || undefined,
      isRead: false,
      createdAt: Date.now(),
    });

    return notificationId;
  } catch (error) {
    logError(error as Error, {
      context: "createNotificationSafely",
      params
    });
    return null;
  }
}

// Create follow notification
export async function notifyFollow(
  ctx: MutationCtx,
  followedUserId: Id<"users">,
  followerUserId: Id<"users">
) {
  return createNotificationSafely(ctx, {
    userId: followedUserId,
    type: "follow",
    fromUserId: followerUserId,
    targetType: undefined,
    targetId: followerUserId,
  });
}

// Create reaction notification
export async function notifyReaction(
  ctx: MutationCtx,
  targetUserId: Id<"users">,
  reactorUserId: Id<"users">,
  targetType: "log" | "thread" | "reply",
  targetId: string,
  reactionType: string
) {
  return createNotificationSafely(ctx, {
    userId: targetUserId,
    type: "reaction",
    fromUserId: reactorUserId,
    targetType,
    targetId,
    metadata: { 
      reactionType,
      targetType // Store for easy access
    },
  });
}

// Create comment notification (for logs)
export async function notifyComment(
  ctx: MutationCtx,
  logOwnerId: Id<"users">,
  commenterUserId: Id<"users">,
  logId: Id<"logs">,
  commentContent: string
) {
  const preview = commentContent.length > 50 
    ? commentContent.substring(0, 50) + "..." 
    : commentContent;

  return createNotificationSafely(ctx, {
    userId: logOwnerId,
    type: "comment",
    fromUserId: commenterUserId,
    targetType: "log",
    targetId: logId,
    content: preview,
  });
}

// Create forum reply notification - CORRECTED FUNCTION NAME
export async function notifyReply(
  ctx: MutationCtx,
  threadOwnerId: Id<"users">,
  replierUserId: Id<"users">,
  threadId: Id<"forumThreads">
) {
  return createNotificationSafely(ctx, {
    userId: threadOwnerId,
    type: "reply",
    fromUserId: replierUserId,
    targetType: "thread",
    targetId: threadId,
  });
}

// Create quote notification - CORRECTED PARAMETERS
export async function notifyQuote(
  ctx: MutationCtx,
  quotedUserId: Id<"users">,
  quoterUserId: Id<"users">,
  replyId: Id<"forumReplies">
) {
  return createNotificationSafely(ctx, {
    userId: quotedUserId,
    type: "quote",
    fromUserId: quoterUserId,
    targetType: "reply",
    targetId: replyId,
  });
}

// Create mention notification (for @username mentions in content)
export async function notifyMention(
  ctx: MutationCtx,
  mentionedUserId: Id<"users">,
  mentionerUserId: Id<"users">,
  targetType: "thread" | "reply" | "log",
  targetId: string,
  content?: string
) {
  const preview = content && content.length > 50 
    ? content.substring(0, 50) + "..." 
    : content;

  return createNotificationSafely(ctx, {
    userId: mentionedUserId,
    type: "comment",
    fromUserId: mentionerUserId,
    targetType,
    targetId,
    content: preview,
  });
}

// Bulk notification helper for multiple users
export async function notifyMultipleUsers(
  ctx: MutationCtx,
  userIds: Id<"users">[],
  params: Omit<Parameters<typeof createNotificationSafely>[1], "userId">
) {
  const results = await Promise.allSettled(
    userIds.map(userId => 
      createNotificationSafely(ctx, { ...params, userId })
    )
  );

  return results.map((result, index) => ({
    userId: userIds[index],
    success: result.status === 'fulfilled',
    notificationId: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  }));
}

// Mark notification as read
export async function markNotificationRead(
  ctx: MutationCtx,
  notificationId: Id<"notifications">,
  userId: Id<"users">
) {
  try {
    const notification = await ctx.db.get(notificationId);
    
    if (!notification) {
      throw createError("NOT_FOUND", "Notification not found");
    }

    if (notification.userId !== userId) {
      throw createError("UNAUTHORIZED", "Cannot mark another user's notification as read");
    }

    if (!notification.isRead) {
      await ctx.db.patch(notificationId, {
        isRead: true,
      });
    }

    return true;
  } catch (error) {
    logError(error as Error, {
      context: "markNotificationRead",
      notificationId,
      userId
    });
    return false;
  }
}

// Mark all notifications as read for a user
export async function markAllNotificationsRead(
  ctx: MutationCtx,
  userId: Id<"users">
) {
  try {
    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isRead"), false))
      .collect();

    const now = Date.now();
    await Promise.all(
      unreadNotifications.map(notification =>
        ctx.db.patch(notification._id, {
          isRead: true,
        })
      )
    );

    return unreadNotifications.length;
  } catch (error) {
    logError(error as Error, {
      context: "markAllNotificationsRead",
      userId
    });
    return 0;
  }
}

// Delete notification
export async function deleteNotification(
  ctx: MutationCtx,
  notificationId: Id<"notifications">,
  userId: Id<"users">
) {
  try {
    const notification = await ctx.db.get(notificationId);
    
    if (!notification) {
      throw createError("NOT_FOUND", "Notification not found");
    }

    if (notification.userId !== userId) {
      throw createError("UNAUTHORIZED", "Cannot delete another user's notification");
    }

    await ctx.db.delete(notificationId);
    return true;
  } catch (error) {
    logError(error as Error, {
      context: "deleteNotification",
      notificationId,
      userId
    });
    return false;
  }
}

// Clean up old notifications (should be called periodically)
export async function cleanupOldNotifications(
  ctx: MutationCtx,
  olderThanDays: number = 30
) {
  try {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldNotifications = await ctx.db
      .query("notifications")
      .filter((q) => q.lt(q.field("createdAt"), cutoffTime))
      .collect();

    await Promise.all(
      oldNotifications.map(notification => ctx.db.delete(notification._id))
    );

    return oldNotifications.length;
  } catch (error) {
    logError(error as Error, {
      context: "cleanupOldNotifications",
      olderThanDays
    });
    return 0;
  }
}

// Helper to get notification preview text based on type
export function getNotificationPreview(
  type: string,
  fromUserName: string,
  content?: string,
  metadata?: any
): string {
  switch (type) {
    case "follow":
      return `${fromUserName} started following you`;
    case "reaction":
      const reactionType = metadata?.reactionType || "reacted";
      return `${fromUserName} ${reactionType} to your post`;
    case "comment":
      return `${fromUserName} commented: ${content || "..."}`;
    case "reply":
      return `${fromUserName} replied to your thread`;
    case "quote":
      return `${fromUserName} quoted your reply`;
    case "mention":
      return `${fromUserName} mentioned you: ${content || "..."}`;
    default:
      return `${fromUserName} interacted with your content`;
  }
}