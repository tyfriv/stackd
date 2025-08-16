import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - extends Clerk auth
  users: defineTable({
    clerkId: v.string(),
    username: v.string(),
    email: v.string(),
    profileImage: v.optional(v.string()),
    bio: v.optional(v.string()),
    createdAt: v.number(),
    // Top 4 showcases
    topMovies: v.array(v.string()), // media IDs
    topTvShows: v.array(v.string()),
    topGames: v.array(v.string()),
    topMusic: v.array(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_username", ["username"])
    .searchIndex("search_username", { searchField: "username" }),

  // Media items - cached from APIs
  media: defineTable({
    externalId: v.string(), // TMDB/RAWG/Spotify ID
    type: v.union(v.literal("movie"), v.literal("tv"), v.literal("game"), v.literal("music")),
    title: v.string(),
    releaseYear: v.number(),
    posterUrl: v.string(),
    description: v.optional(v.string()),
    // Type-specific fields
    artist: v.optional(v.string()), // for music
    season: v.optional(v.number()), // for TV shows
    // Full API response cache for heavy data
    rawData: v.optional(v.any()), // Store complete API response
    // Cache timestamp (UTC milliseconds)
    lastUpdated: v.number(),
  })
    .index("by_external_id_type", ["externalId", "type"])
    .index("by_type", ["type"])
    .searchIndex("search_title", { searchField: "title" }),

  // User follows
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId"])
    .index("by_following", ["followingId"])
    .index("by_relationship", ["followerId", "followingId"])
    .index("by_follower_created", ["followerId", "createdAt"]), // For chronological follow lists

  // Blocked users
  blocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blocker", ["blockerId"])
    .index("by_blocked", ["blockedId"]),

  // Media logs (diary entries)
  logs: defineTable({
    userId: v.id("users"),
    mediaId: v.id("media"),
    loggedAt: v.number(), // UTC milliseconds
    rating: v.optional(v.number()), // 0-10 (half stars = 0.5 increments)
    review: v.optional(v.string()),
    hasSpoilers: v.optional(v.boolean()),
    visibility: v.union(v.literal("public"), v.literal("followers"), v.literal("private")),
    createdAt: v.number(), // UTC milliseconds
  })
    .index("by_user", ["userId"])
    .index("by_media", ["mediaId"])
    .index("by_user_media", ["userId", "mediaId"])
    .index("by_visibility", ["visibility"])
    .index("by_logged_at", ["loggedAt"])
    .index("by_visibility_logged_at", ["visibility", "loggedAt"]) // For feed queries
    .searchIndex("search_review", { searchField: "review" }), // Search review content

  // Review comments
  reviewComments: defineTable({
    logId: v.id("logs"),
    userId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_log", ["logId"])
    .index("by_user", ["userId"]),

  // Forum categories
  forumCategories: defineTable({
    name: v.string(),
    description: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  // Forum threads
  forumThreads: defineTable({
    categoryId: v.id("forumCategories"),
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    isPinned: v.boolean(),
    isLocked: v.boolean(),
    createdAt: v.number(), // UTC milliseconds
    lastActivityAt: v.number(), // UTC milliseconds - update on replies
    replyCount: v.number(), // Maintain via mutations
  })
    .index("by_category", ["categoryId"])
    .index("by_user", ["userId"])
    .index("by_last_activity", ["lastActivityAt"])
    .index("by_category_pinned_activity", ["categoryId", "isPinned", "lastActivityAt"]) // For forum listing
    .searchIndex("search_title", { searchField: "title" })
    .searchIndex("search_content", { searchField: "content" }),

  // Forum replies
  forumReplies: defineTable({
    threadId: v.id("forumThreads"),
    userId: v.id("users"),
    content: v.string(),
    quotedReplyId: v.optional(v.id("forumReplies")),
    createdAt: v.number(), // UTC milliseconds
  })
    .index("by_thread", ["threadId"])
    .index("by_user", ["userId"])
    .index("by_thread_created", ["threadId", "createdAt"]) // For pagination
    .searchIndex("search_content", { searchField: "content" }),

  // Reactions (for reviews, forum threads, and replies)
  reactions: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("log"), v.literal("thread"), v.literal("reply")),
    targetId: v.string(), // Standardized Convex ID as string
    reactionType: v.union(v.literal("like"), v.literal("laugh"), v.literal("angry")),
    createdAt: v.number(), // UTC milliseconds
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_user", ["userId"])
    .index("by_user_target", ["userId", "targetType", "targetId"])
    .index("by_target_type", ["targetType", "targetId", "reactionType"]), // Count by reaction type

  // Notifications
  notifications: defineTable({
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
    targetId: v.optional(v.string()), // Standardized Convex ID as string
    content: v.optional(v.string()), // Preview text for notifications
    metadata: v.optional(v.any()), // Additional data (reaction type, quoted text, etc.)
    isRead: v.boolean(),
    createdAt: v.number(), // UTC milliseconds
  })
    .index("by_user", ["userId"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_user_created", ["userId", "createdAt"]), // For chronological ordering

  // Rate limiting tracking
  rateLimits: defineTable({
    key: v.string(),
    timestamp: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_timestamp", ["timestamp"])
    .index("by_key_timestamp", ["key", "timestamp"]), // PERFORMANCE FIX: Compound index for rate limiting
});