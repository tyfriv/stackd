// Shared types and utilities for all API integrations
import { Doc } from "../_generated/dataModel";

// Unified media types that match your schema
export type MediaType = "movie" | "tv" | "game" | "music";

// Standardized search result format for all APIs
export interface MediaSearchResult {
  externalId: string;
  type: MediaType;
  title: string;
  releaseYear: number;
  posterUrl: string;
  description?: string;
  artist?: string; // For music
  season?: number; // For TV shows
}

// Cache configuration
export const CACHE_DURATION = {
  MEDIA_ITEM: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
  SEARCH_RESULTS: 24 * 60 * 60 * 1000,  // 1 day in milliseconds
};

// Check if cached item is still fresh
export function isCacheValid(lastUpdated: number, duration: number = CACHE_DURATION.MEDIA_ITEM): boolean {
  return Date.now() - lastUpdated < duration;
}

// Standardize poster/image URLs
export function standardizePosterUrl(url: string | null | undefined, apiSource: 'tmdb' | 'rawg' | 'spotify'): string {
  if (!url) return '/placeholder-poster.jpg'; // You'll add this placeholder image
  
  switch (apiSource) {
    case 'tmdb':
      // TMDB returns relative paths, make them absolute
      return url.startsWith('http') ? url : `https://image.tmdb.org/t/p/w500${url}`;
    case 'rawg':
    case 'spotify':
      // These return full URLs
      return url;
    default:
      return url;
  }
}

// Extract year from various date formats
export function extractYear(dateString: string | null | undefined): number {
  if (!dateString) return new Date().getFullYear();
  
  // Handle formats: "2023", "2023-01-01", "January 1, 2023"
  const year = parseInt(dateString.substring(0, 4));
  return isNaN(year) ? new Date().getFullYear() : year;
}

// Clean and truncate descriptions
export function cleanDescription(description: string | null | undefined, maxLength: number = 300): string | undefined {
  if (!description) return undefined;
  
  const cleaned = description
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
  
  return cleaned.length > maxLength 
    ? cleaned.substring(0, maxLength) + '...'
    : cleaned;
}

// API error handling
export class APIError extends Error {
  constructor(
    message: string,
    public apiSource: string,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Handle fetch errors consistently
export async function handleAPIResponse(response: Response, apiSource: string): Promise<any> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new APIError(
      `${apiSource} API error: ${response.status} ${response.statusText}`,
      apiSource,
      response.status,
      errorText
    );
  }
  
  try {
    return await response.json();
  } catch (error) {
    throw new APIError(
      `${apiSource} API returned invalid JSON`,
      apiSource,
      response.status,
      error
    );
  }
}

// Rate limiting helper (simple in-memory)
const rateLimits = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(apiSource: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const key = `${apiSource}`;
  const current = rateLimits.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset window
    rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (current.count >= maxRequests) {
    return false; // Rate limited
  }
  
  current.count++;
  return true;
}

// Convert media doc to search result format
export function mediaDocToSearchResult(media: Doc<"media">): MediaSearchResult {
  return {
    externalId: media.externalId,
    type: media.type,
    title: media.title,
    releaseYear: media.releaseYear,
    posterUrl: media.posterUrl,
    description: media.description,
    artist: media.artist,
    season: media.season,
  };
}