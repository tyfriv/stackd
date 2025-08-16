// convex/lib/notificationHelpers.ts
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

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

    // Check if target user has blocked the sender
    const isBlocked = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", params.userId))
      .filter((q) => q.eq(q.field("blockedId"), params.fromUserId))
      .unique();

    if (isBlocked) {
      return null;
    }

    // Check for duplicate notifications (prevent spam)
    if (params.type === "reaction" && params.targetId) {
      const existingReaction = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", params.userId))
        .filter((q) => 
          q.and(
            q.eq(q.field("type"), "reaction"),
            q.eq(q.field("fromUserId"), params.fromUserId),
            q.eq(q.field("targetId"), params.targetId),
            q.gt(q.field("createdAt"), Date.now() - 60000) // Within last minute
          )
        )
        .first();

      if (existingReaction) {
        return null; // Don't spam reaction notifications
      }
    }

    const notificationId = await ctx.db.insert("notifications", {
      userId: params.userId,
      type: params.type,
      fromUserId: params.fromUserId,
      targetType: params.targetType,
      targetId: params.targetId,
      content: params.content,
      metadata: params.metadata,
      isRead: false,
      createdAt: Date.now(),
    });

    return notificationId;
  } catch (error) {
    console.warn("Failed to create notification:", error);
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
    metadata: { reactionType },
  });
}

// Create comment notification
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

// Create forum reply notification
export async function notifyForumReply(
  ctx: MutationCtx,
  threadOwnerId: Id<"users">,
  replierUserId: Id<"users">,
  threadId: Id<"forumThreads">,
  replyContent: string
) {
  const preview = replyContent.length > 50 
    ? replyContent.substring(0, 50) + "..." 
    : replyContent;

  return createNotificationSafely(ctx, {
    userId: threadOwnerId,
    type: "reply",
    fromUserId: replierUserId,
    targetType: "thread",
    targetId: threadId,
    content: preview,
  });
}

// Create quote notification
export async function notifyQuote(
  ctx: MutationCtx,
  quotedUserId: Id<"users">,
  quoterUserId: Id<"users">,
  quotedReplyId: Id<"forumReplies">,
  newReplyContent: string
) {
  const preview = newReplyContent.length > 50 
    ? newReplyContent.substring(0, 50) + "..." 
    : newReplyContent;

  return createNotificationSafely(ctx, {
    userId: quotedUserId,
    type: "quote",
    fromUserId: quoterUserId,
    targetType: "reply",
    targetId: quotedReplyId,
    content: preview,
  });
}