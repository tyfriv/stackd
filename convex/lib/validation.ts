// convex/lib/validation.ts
import { StackdError } from './errors';

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
    throw new StackdError("Review too long (max 5000 characters)", "VALIDATION_ERROR");
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
  return sanitized.length >= 3 && sanitized.length <= 30 && /^[a-z0-9_-]+$/.test(sanitized);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Content filtering for profanity/inappropriate content
const BLOCKED_WORDS = [
  // Add your blocked words list here - keeping it minimal for example
  'spam', 'scam'
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
  
  return timestamp >= oneYearAgo && timestamp <= oneDayForward;
}

export function validateReviewLength(review: string): boolean {
  return review.length <= 5000 && review.trim().length >= 3;
}