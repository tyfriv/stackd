// convex/media/spotify.ts
import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { APIError, extractYear, cleanDescription, standardizePosterUrl, checkRateLimit } from "../lib/apiHelpers";
import type { MediaSearchResult } from "../lib/apiHelpers";

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_BASE_URL = "https://api.spotify.com/v1";

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error("SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is not set in environment variables");
}

// In-memory token storage
let spotifyAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

// Spotify API response types
interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  type: "artist";
}

interface SpotifyAlbum {
  id: string;
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  images: SpotifyImage[];
  artists: SpotifyArtist[];
  album_type: "album" | "single" | "compilation";
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  explicit: boolean;
  popularity: number;
}

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrack[];
    total: number;
    limit: number;
    offset: number;
  };
  albums?: {
    items: SpotifyAlbum[];
    total: number;
    limit: number;
    offset: number;
  };
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

/**
 * Get Spotify access token using Client Credentials flow
 */
// Replace this function in your convex/media/spotify.ts file

/**
 * Web-compatible base64 encoding function
 * Replaces Buffer.from().toString('base64') which isn't available in Convex
 */
function encodeBase64(str: string): string {
  // Use the btoa function which is available in web environments
  try {
    return btoa(str);
  } catch (error) {
    // Fallback manual base64 encoding if btoa isn't available
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    while (i < str.length) {
      const byte1 = str.charCodeAt(i++);
      const byte2 = i < str.length ? str.charCodeAt(i++) : 0;
      const byte3 = i < str.length ? str.charCodeAt(i++) : 0;
      
      const bitmap = (byte1 << 16) | (byte2 << 8) | byte3;
      
      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += chars.charAt((bitmap >> 6) & 63);
      result += chars.charAt(bitmap & 63);
    }
    
    const padding = str.length % 3;
    if (padding === 1) {
      result = result.slice(0, -2) + '==';
    } else if (padding === 2) {
      result = result.slice(0, -1) + '=';
    }
    
    return result;
  }
}

/**
 * Get Spotify access token using Client Credentials flow
 * UPDATED VERSION - replaces the one with Buffer.from()
 */
async function getSpotifyAccessToken(): Promise<string> {
  // Check if we have a valid token
  if (spotifyAccessToken && Date.now() < tokenExpiresAt) {
    return spotifyAccessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new APIError("Spotify credentials not configured", "spotify");
  }

  // Use web-compatible base64 encoding instead of Buffer
  const credentials = encodeBase64(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  
  try {
    console.log("🎵 Spotify: Getting new access token");
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new APIError(`Spotify auth error: ${response.status}`, "spotify", response.status);
    }

    const data: SpotifyTokenResponse = await response.json();
    
    spotifyAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000; // Subtract 1 minute for buffer
    
    console.log("🎵 Spotify: Token obtained successfully");
    return spotifyAccessToken;
  } catch (error) {
    console.error("🎵 Spotify: Token error:", error);
    throw new APIError(
      `Failed to get Spotify access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      "spotify",
      undefined,
      error
    );
  }
}
/**
 * Helper to get the best image from Spotify images array
 */
function getBestSpotifyImage(images: SpotifyImage[]): string {
  if (!images || images.length === 0) return '/placeholder-poster.jpg';
  
  // Sort by size (width * height) and pick the largest that's reasonable for our use
  const sortedImages = images
    .filter(img => img.width && img.height)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  
  // Prefer images around 300-640px width for our use case
  const preferredImage = sortedImages.find(img => img.width >= 300 && img.width <= 640);
  
  return preferredImage ? preferredImage.url : sortedImages[0]?.url || '/placeholder-poster.jpg';
}

/**
 * Helper to format artist names
 */
function formatArtistNames(artists: SpotifyArtist[]): string {
  return artists.map(artist => artist.name).join(', ');
}

/**
 * Transform Spotify track data to standardized MediaSearchResult format
 */
function transformSpotifyTrack(track: SpotifyTrack): MediaSearchResult {
  return {
    externalId: track.id,
    type: "music" as const,
    title: track.name,
    releaseYear: extractYear(track.album.release_date),
    posterUrl: standardizePosterUrl(getBestSpotifyImage(track.album.images), "spotify"),
    description: cleanDescription(`${track.album.name} • ${formatArtistNames(track.artists)}`),
    artist: formatArtistNames(track.artists),
    season: undefined // Music doesn't have seasons
  };
}

/**
 * Transform Spotify album data to standardized MediaSearchResult format
 */
function transformSpotifyAlbum(album: SpotifyAlbum): MediaSearchResult {
  return {
    externalId: album.id,
    type: "music" as const,
    title: album.name,
    releaseYear: extractYear(album.release_date),
    posterUrl: standardizePosterUrl(getBestSpotifyImage(album.images), "spotify"),
    description: cleanDescription(`${album.album_type} • ${formatArtistNames(album.artists)}`),
    artist: formatArtistNames(album.artists),
    season: undefined // Music doesn't have seasons
  };
}

/**
 * Search for music (tracks) using Spotify API
 */
export const searchMusic = action({
  args: { 
    query: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    const { query, limit = 20, offset = 0 } = args;

    if (!query.trim()) {
      return [];
    }

    // Rate limiting check - Spotify allows more requests than RAWG
    if (!checkRateLimit("spotify", 100, 60000)) { // 100 requests per minute
      throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
    }

    // Check cache first - search for music with matching titles
    const cachedResults = await ctx.runQuery(
      api.media.mediaQueries.searchCachedMedia,
      { query: query.trim(), type: "music", limit }
    );

    // If we have enough cached results, return them
    if (cachedResults.length >= Math.min(limit, 10)) {
      console.log(`🎵 Spotify: Returning ${cachedResults.length} cached music results for "${query}"`);
      return cachedResults;
    }

    try {
      const accessToken = await getSpotifyAccessToken();
      const searchParams = new URLSearchParams({
        q: query.trim(),
        type: 'track',
        limit: Math.min(limit, 50).toString(), // Spotify allows up to 50
        offset: offset.toString(),
        market: 'US' // Get market-specific results
      });

      console.log(`🎵 Spotify: Searching music for "${query}"`);
      
      const response = await fetch(
        `${SPOTIFY_BASE_URL}/search?${searchParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
        }
        if (response.status === 401) {
          // Token might be expired, reset it
          spotifyAccessToken = null;
          tokenExpiresAt = 0;
          throw new APIError("Spotify authentication failed", "spotify", 401);
        }
        throw new APIError(`Spotify API error: ${response.status}`, "spotify", response.status);
      }

      const data: SpotifySearchResponse = await response.json();
      
      if (!data.tracks || !Array.isArray(data.tracks.items)) {
        console.warn("🎵 Spotify: Unexpected API response structure");
        return cachedResults; // Return cached results as fallback
      }

      console.log(`🎵 Spotify: Found ${data.tracks.items.length} tracks`);

      // Transform and cache results
      const transformedResults: MediaSearchResult[] = [];
      
      for (const track of data.tracks.items) {
        try {
          const transformed = transformSpotifyTrack(track);
          
          // Cache the track
          await ctx.runMutation(
            internal.media.mediaQueries.cacheMediaItem,
            {
              externalId: transformed.externalId,
              type: transformed.type,
              title: transformed.title,
              releaseYear: transformed.releaseYear,
              posterUrl: transformed.posterUrl,
              description: transformed.description,
              artist: transformed.artist,
              season: transformed.season,
              rawData: track // Store full Spotify response
            }
          );

          transformedResults.push(transformed);
        } catch (error) {
          console.error(`🎵 Spotify: Error processing track ${track.id}:`, error);
          // Continue processing other tracks
        }
      }

      // Combine with cached results, removing duplicates
      const allResults = [...cachedResults];
      for (const newResult of transformedResults) {
        if (!allResults.some(cached => cached.externalId === newResult.externalId)) {
          allResults.push(newResult);
        }
      }

      return allResults.slice(0, limit);

    } catch (error) {
      console.error("🎵 Spotify: Search error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached results as fallback
      if (cachedResults.length > 0) {
        console.log(`🎵 Spotify: Returning cached results due to API error`);
        return cachedResults;
      }
      
      throw new APIError("Failed to search music", "spotify");
    }
  }
});

/**
 * Search for albums using Spotify API
 */
export const searchAlbums = action({
  args: { 
    query: v.string(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<MediaSearchResult[]> => {
    const { query, limit = 20, offset = 0 } = args;

    if (!query.trim()) {
      return [];
    }

    // Rate limiting check
    if (!checkRateLimit("spotify", 100, 60000)) {
      throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
    }

    try {
      const accessToken = await getSpotifyAccessToken();
      const searchParams = new URLSearchParams({
        q: query.trim(),
        type: 'album',
        limit: Math.min(limit, 50).toString(),
        offset: offset.toString(),
        market: 'US'
      });

      console.log(`🎵 Spotify: Searching albums for "${query}"`);
      
      const response = await fetch(
        `${SPOTIFY_BASE_URL}/search?${searchParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
        }
        if (response.status === 401) {
          spotifyAccessToken = null;
          tokenExpiresAt = 0;
          throw new APIError("Spotify authentication failed", "spotify", 401);
        }
        throw new APIError(`Spotify API error: ${response.status}`, "spotify", response.status);
      }

      const data: SpotifySearchResponse = await response.json();
      
      if (!data.albums || !Array.isArray(data.albums.items)) {
        console.warn("🎵 Spotify: Unexpected album API response structure");
        return [];
      }

      console.log(`🎵 Spotify: Found ${data.albums.items.length} albums`);

      // Transform and cache results
      const results: MediaSearchResult[] = [];
      
      for (const album of data.albums.items) {
        try {
          const transformed = transformSpotifyAlbum(album);
          
          // Cache the album
          await ctx.runMutation(
            internal.media.mediaQueries.cacheMediaItem,
            {
              externalId: transformed.externalId,
              type: transformed.type,
              title: transformed.title,
              releaseYear: transformed.releaseYear,
              posterUrl: transformed.posterUrl,
              description: transformed.description,
              artist: transformed.artist,
              season: transformed.season,
              rawData: album
            }
          );

          results.push(transformed);
        } catch (error) {
          console.error(`🎵 Spotify: Error processing album ${album.id}:`, error);
          // Continue processing other albums
        }
      }

      return results;

    } catch (error) {
      console.error("🎵 Spotify: Album search error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      throw new APIError("Failed to search albums", "spotify");
    }
  }
});

/**
 * Get detailed track information
 */
export const getTrackDetails = action({
  args: { trackId: v.string() },
  handler: async (ctx, args): Promise<MediaSearchResult | null> => {
    const { trackId } = args;

    // Rate limiting check
    if (!checkRateLimit("spotify", 100, 60000)) {
      throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
    }

    // Check cache first
    const cached = await ctx.runQuery(
      internal.media.mediaQueries.getCachedMedia,
      { externalId: trackId, type: "music" }
    );

    if (cached && cached._creationTime > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      console.log(`🎵 Spotify: Returning cached track details for ${trackId}`);
      return {
        externalId: cached.externalId,
        type: cached.type,
        title: cached.title,
        releaseYear: cached.releaseYear,
        posterUrl: cached.posterUrl,
        description: cached.description,
        artist: cached.artist,
        season: cached.season
      };
    }

    try {
      const accessToken = await getSpotifyAccessToken();
      console.log(`🎵 Spotify: Fetching track details for ${trackId}`);
      
      const response = await fetch(
        `${SPOTIFY_BASE_URL}/tracks/${trackId}?market=US`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        if (response.status === 429) {
          throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
        }
        if (response.status === 401) {
          spotifyAccessToken = null;
          tokenExpiresAt = 0;
          throw new APIError("Spotify authentication failed", "spotify", 401);
        }
        throw new APIError(`Spotify API error: ${response.status}`, "spotify", response.status);
      }

      const track: SpotifyTrack = await response.json();
      const transformed = transformSpotifyTrack(track);

      // Cache the detailed track info
      await ctx.runMutation(
        internal.media.mediaQueries.cacheMediaItem,
        {
          externalId: transformed.externalId,
          type: transformed.type,
          title: transformed.title,
          releaseYear: transformed.releaseYear,
          posterUrl: transformed.posterUrl,
          description: transformed.description,
          artist: transformed.artist,
          season: transformed.season,
          rawData: track
        }
      );

      console.log(`🎵 Spotify: Cached track details for "${track.name}"`);
      return transformed;

    } catch (error) {
      console.error("🎵 Spotify: Track details error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached result as fallback (even if older)
      if (cached) {
        console.log(`🎵 Spotify: Returning stale cache due to API error`);
        return {
          externalId: cached.externalId,
          type: cached.type,
          title: cached.title,
          releaseYear: cached.releaseYear,
          posterUrl: cached.posterUrl,
          description: cached.description,
          artist: cached.artist,
          season: cached.season
        };
      }
      
      throw new APIError("Failed to get track details", "spotify");
    }
  }
});

/**
 * Get detailed album information
 */
export const getAlbumDetails = action({
  args: { albumId: v.string() },
  handler: async (ctx, args): Promise<MediaSearchResult | null> => {
    const { albumId } = args;

    // Rate limiting check
    if (!checkRateLimit("spotify", 100, 60000)) {
      throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
    }

    // Check cache first
    const cached = await ctx.runQuery(
      internal.media.mediaQueries.getCachedMedia,
      { externalId: albumId, type: "music" }
    );

    if (cached && cached._creationTime > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      console.log(`🎵 Spotify: Returning cached album details for ${albumId}`);
      return {
        externalId: cached.externalId,
        type: cached.type,
        title: cached.title,
        releaseYear: cached.releaseYear,
        posterUrl: cached.posterUrl,
        description: cached.description,
        artist: cached.artist,
        season: cached.season
      };
    }

    try {
      const accessToken = await getSpotifyAccessToken();
      console.log(`🎵 Spotify: Fetching album details for ${albumId}`);
      
      const response = await fetch(
        `${SPOTIFY_BASE_URL}/albums/${albumId}?market=US`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        if (response.status === 429) {
          throw new APIError("Spotify API rate limit exceeded", "spotify", 429);
        }
        if (response.status === 401) {
          spotifyAccessToken = null;
          tokenExpiresAt = 0;
          throw new APIError("Spotify authentication failed", "spotify", 401);
        }
        throw new APIError(`Spotify API error: ${response.status}`, "spotify", response.status);
      }

      const album: SpotifyAlbum = await response.json();
      const transformed = transformSpotifyAlbum(album);

      // Cache the detailed album info
      await ctx.runMutation(
        internal.media.mediaQueries.cacheMediaItem,
        {
          externalId: transformed.externalId,
          type: transformed.type,
          title: transformed.title,
          releaseYear: transformed.releaseYear,
          posterUrl: transformed.posterUrl,
          description: transformed.description,
          artist: transformed.artist,
          season: transformed.season,
          rawData: album
        }
      );

      console.log(`🎵 Spotify: Cached album details for "${album.name}"`);
      return transformed;

    } catch (error) {
      console.error("🎵 Spotify: Album details error:", error);
      
      if (error instanceof APIError) {
        throw error;
      }
      
      // Return cached result as fallback (even if older)
      if (cached) {
        console.log(`🎵 Spotify: Returning stale cache due to API error`);
        return {
          externalId: cached.externalId,
          type: cached.type,
          title: cached.title,
          releaseYear: cached.releaseYear,
          posterUrl: cached.posterUrl,
          description: cached.description,
          artist: cached.artist,
          season: cached.season
        };
      }
      
      throw new APIError("Failed to get album details", "spotify");
    }
  }
});