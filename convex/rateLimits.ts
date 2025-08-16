// convex/rateLimits.ts
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Check rate limit with database persistence
export const checkRateLimit = internalMutation({
  args: { 
    key: v.string(), 
    limit: v.number(), 
    windowMs: v.number() 
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - args.windowMs;
    
    // Clean old entries first
    const oldEntries = await ctx.db
      .query("rateLimits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", windowStart))
      .take(100); // Clean in batches to avoid timeouts
    
    // Delete old entries
    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
    }
    
    // PERFORMANCE FIX: Use compound index for better query performance
    const currentRequests = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_timestamp", (q) => 
        q.eq("key", args.key).gte("timestamp", windowStart)
      )
      .collect();
    
    if (currentRequests.length >= args.limit) {
      return false; // Rate limited
    }
    
    // Record this request
    await ctx.db.insert("rateLimits", {
      key: args.key,
      timestamp: now,
    });
    
    return true;
  },
});

// Get rate limit status for a key (for debugging)
export const getRateLimitStatus = query({
  args: { 
    key: v.string(),
    windowMs: v.number() 
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - args.windowMs;
    
    const requests = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_timestamp", (q) => 
        q.eq("key", args.key).gte("timestamp", windowStart)
      )
      .collect();
    
    return {
      requestCount: requests.length,
      windowStart,
      windowEnd: now,
      requests: requests.map(r => ({ timestamp: r.timestamp, age: now - r.timestamp }))
    };
  },
});

// Cleanup old rate limit entries (run periodically via cron)
export const cleanupOldRateLimits = internalMutation({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanMs || 24 * 60 * 60 * 1000); // Default 24 hours
    
    const oldEntries = await ctx.db
      .query("rateLimits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .take(1000); // Process in large batches
    
    let deleted = 0;
    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
      deleted++;
    }
    
    return { deleted, cutoff };
  },
});