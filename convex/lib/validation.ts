// convex/lib/validation.ts
import { StackdError, createError, ForumErrors } from './errors';

// Input sanitization functions
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove basic HTML
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 500); // Limit length
}

export function sanitizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '') // Only allow alphanumeric, underscore, hyphen
    .substring(0, 30); // Username length limit
}

export function sanitizeEmail(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .substring(0, 254); // Email length limit per RFC
}

export function sanitizeBio(bio: string): string {
  return bio
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 500); // Bio length limit
}

// Review content sanitization with enhanced XSS protection
export function sanitizeReview(review: string): string {
  if (!review) return '';
  
  if (review.length > 5000) {
    throw ForumErrors.contentTooLong(5000, review.length);
  }
  
  return review
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframes
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .replace(/data:text\/html/gi, '') // Remove data URLs
    .replace(/vbscript:/gi, '') // Remove vbscript
    .substring(0, 5000);
}

// Forum-specific content sanitization
export function sanitizeForumTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    throw createError('VALIDATION_ERROR', 'Thread title is required');
  }
  
  return title
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 200); // Thread title limit
}

export function sanitizeForumContent(content: string): string {
  if (!content || typeof content !== 'string') {
    throw createError('VALIDATION_ERROR', 'Content is required');
  }
  
  return content
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframes
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/data:text\/html/gi, '') // Remove data URLs
    .replace(/vbscript:/gi, '') // Remove vbscript
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '') // Remove objects
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '') // Remove embeds
    .substring(0, 10000); // Content limit
}

export function sanitizeCategoryName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw createError('VALIDATION_ERROR', 'Category name is required');
  }
  
  return name
    .trim()
    .replace(/[<>]/g, '') // Remove basic HTML
    .substring(0, 50); // Category name limit
}

export function sanitizeCategoryDescription(description: string): string {
  return description
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 500); // Description limit
}

// Validation functions
export function validateRating(rating: number | undefined): boolean {
  if (rating === undefined) return true;
  return rating >= 0 && rating <= 10 && (rating * 2) % 1 === 0; // Allows half stars (0, 0.5, 1, 1.5, etc.)
}

export function validateVisibility(visibility: string): boolean {
  return ["public", "followers", "private"].includes(visibility);
}

export function validateUsername(username: string): boolean {
  const sanitized = sanitizeUsername(username);
  
  // SECURITY FIX: Enhanced username validation
  if (sanitized.length < 3 || sanitized.length > 30) {
    return false;
  }
  
  // Must match pattern and not start/end with special chars
  if (!/^[a-z0-9_-]+$/.test(sanitized)) {
    return false;
  }
  
  if (sanitized.startsWith('-') || sanitized.startsWith('_') || 
      sanitized.endsWith('-') || sanitized.endsWith('_')) {
    return false;
  }
  
  // Prevent consecutive special characters
  if (sanitized.includes('--') || sanitized.includes('__') || sanitized.includes('_-') || sanitized.includes('-_')) {
    return false;
  }
  
  // Reserved usernames
  const reserved = ['admin', 'api', 'www', 'ftp', 'mail', 'support', 'help', 'stackd', 'root', 'user', 'guest'];
  if (reserved.includes(sanitized)) {
    return false;
  }
  
  return true;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Forum-specific validation functions
export function validateThreadTitle(title: string): { isValid: boolean; sanitized: string; error?: string } {
  if (!title || typeof title !== 'string') {
    return { isValid: false, sanitized: '', error: 'Thread title is required' };
  }
  
  const sanitized = sanitizeForumTitle(title);
  
  if (sanitized.length < 3) {
    return { isValid: false, sanitized, error: 'Thread title must be at least 3 characters' };
  }
  
  if (sanitized.length > 200) {
    return { isValid: false, sanitized, error: 'Thread title must be 200 characters or less' };
  }
  
  if (containsBlockedContent(sanitized)) {
    return { isValid: false, sanitized, error: 'Thread title contains inappropriate content' };
  }
  
  return { isValid: true, sanitized };
}

export function validateForumContent(content: string): { isValid: boolean; sanitized: string; error?: string } {
  if (!content || typeof content !== 'string') {
    return { isValid: false, sanitized: '', error: 'Content is required' };
  }
  
  const sanitized = sanitizeForumContent(content);
  
  if (sanitized.length === 0) {
    return { isValid: false, sanitized, error: 'Content cannot be empty' };
  }
  
  if (sanitized.length > 10000) {
    return { isValid: false, sanitized, error: 'Content must be 10,000 characters or less' };
  }
  
  if (containsBlockedContent(sanitized)) {
    return { isValid: false, sanitized, error: 'Content contains inappropriate material' };
  }
  
  return { isValid: true, sanitized };
}

export function validateReplyContent(content: string): { isValid: boolean; sanitized: string; error?: string } {
  return validateForumContent(content); // Same validation as forum content
}

export function validateCategoryName(name: string): { isValid: boolean; sanitized: string; error?: string } {
  if (!name || typeof name !== 'string') {
    return { isValid: false, sanitized: '', error: 'Category name is required' };
  }
  
  const sanitized = sanitizeCategoryName(name);
  
  if (sanitized.length < 2) {
    return { isValid: false, sanitized, error: 'Category name must be at least 2 characters' };
  }
  
  if (sanitized.length > 50) {
    return { isValid: false, sanitized, error: 'Category name must be 50 characters or less' };
  }
  
  if (containsBlockedContent(sanitized)) {
    return { isValid: false, sanitized, error: 'Category name contains inappropriate content' };
  }
  
  return { isValid: true, sanitized };
}

export function validatePaginationOptions(opts: { numItems?: number; cursor?: string | null }): {
  numItems: number;
  cursor: string | null;
} {
  let numItems = opts.numItems || 20;
  
  // Validate and sanitize numItems
  if (typeof numItems !== 'number' || isNaN(numItems) || !isFinite(numItems)) {
    numItems = 20;
  }
  numItems = Math.min(Math.max(Math.floor(numItems), 1), 50);
  
  // Validate cursor
  let cursor = opts.cursor || null;
  if (typeof cursor !== 'string' && cursor !== null) {
    cursor = null;
  }
  
  return { numItems, cursor };
}

export function validateSearchQuery(query: string): { isValid: boolean; sanitized: string; error?: string } {
  if (!query || typeof query !== 'string') {
    return { isValid: false, sanitized: '', error: 'Search query is required' };
  }
  
  const sanitized = query.trim();
  
  if (sanitized.length < 2) {
    return { isValid: false, sanitized, error: 'Search query must be at least 2 characters' };
  }
  
  if (sanitized.length > 100) {
    return { isValid: false, sanitized, error: 'Search query must be 100 characters or less' };
  }
  
  return { isValid: true, sanitized };
}

// Content filtering for profanity/inappropriate content
const BLOCKED_WORDS = [
  // Add your blocked words list here - keeping it minimal for example
  'spam', 'scam', 'viagra', 'casino', 'lottery', 'bitcoin'
];

export function containsBlockedContent(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return BLOCKED_WORDS.some(word => lowerContent.includes(word));
}

// Rate limiting key generation
export function generateRateLimitKey(prefix: string, userId?: string): string {
  return userId ? `${prefix}_${userId}` : `${prefix}_anonymous`;
}

// Safe JSON parsing
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function validateDateRange(timestamp: number): boolean {
  const now = Date.now();
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  const oneDayForward = now + (24 * 60 * 60 * 1000);
  
  // Additional check for valid timestamp format
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    return false;
  }
  
  // SECURITY FIX: Prevent unrealistic dates
  const year1970 = new Date('1970-01-01').getTime();
  const year2050 = new Date('2050-01-01').getTime();
  
  if (timestamp < year1970 || timestamp > year2050) {
    return false;
  }
  
  return timestamp >= oneYearAgo && timestamp <= oneDayForward;
}

export function validateReviewLength(review: string): boolean {
  if (typeof review !== 'string') return false;
  const trimmed = review.trim();
  return trimmed.length >= 3 && trimmed.length <= 5000;
}

// SECURITY FIX: Additional validation helpers
export function validateMediaType(type: string): boolean {
  return ["movie", "tv", "game", "music"].includes(type);
}

export function validateTargetType(type: string): boolean {
  return ["log", "thread", "reply"].includes(type);
}

export function validateReactionType(type: string): boolean {
  return ["like", "laugh", "angry", "heart", "thumbs_up", "thumbs_down"].includes(type);
}

// Forum-specific validation helpers
export function validateThreadStatus(status: string): boolean {
  return ["active", "locked", "archived", "deleted"].includes(status);
}

export function validateUserRole(role: string): boolean {
  return ["user", "moderator", "admin"].includes(role);
}

export function validateSortOrder(order: string): boolean {
  return ["asc", "desc"].includes(order);
}

export function validateSortBy(sortBy: string, validFields: string[]): boolean {
  return validFields.includes(sortBy);
}

export function validateTimeWindow(window: string): boolean {
  return ["hour", "day", "week", "month", "year", "all"].includes(window);
}

export function validateLimit(limit: number | undefined, defaultLimit: number = 20, maxLimit: number = 50): number {
  if (typeof limit !== 'number' || isNaN(limit) || !isFinite(limit)) {
    return defaultLimit;
  }
  return Math.min(Math.max(Math.floor(limit), 1), maxLimit);
}

// Thread/Reply specific validators that throw errors
export function validateAndSanitizeThreadTitle(title: string): string {
  const result = validateThreadTitle(title);
  if (!result.isValid) {
    throw createError('VALIDATION_ERROR', result.error || 'Invalid thread title');
  }
  return result.sanitized;
}

export function validateAndSanitizeForumContent(content: string): string {
  const result = validateForumContent(content);
  if (!result.isValid) {
    throw createError('VALIDATION_ERROR', result.error || 'Invalid content');
  }
  return result.sanitized;
}

export function validateAndSanitizeReplyContent(content: string): string {
  const result = validateReplyContent(content);
  if (!result.isValid) {
    throw createError('VALIDATION_ERROR', result.error || 'Invalid reply content');
  }
  return result.sanitized;
}