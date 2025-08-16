// convex/showcases/showcaseUtils.ts
import { Doc } from "../_generated/dataModel";

export type ShowcaseType = "movies" | "tvShows" | "games" | "music";
export type MediaType = "movie" | "tv" | "game" | "music";

// Mapping between showcase types and media types
export const SHOWCASE_TO_MEDIA_TYPE: Record<ShowcaseType, MediaType> = {
  movies: "movie",
  tvShows: "tv", 
  games: "game",
  music: "music",
};

// Mapping between media types and showcase types
export const MEDIA_TYPE_TO_SHOWCASE: Record<MediaType, ShowcaseType> = {
  movie: "movies",
  tv: "tvShows",
  game: "games", 
  music: "music",
};

// Get the correct field name for the user's showcase
export function getShowcaseFieldName(showcaseType: ShowcaseType): keyof Pick<Doc<"users">, "topMovies" | "topTvShows" | "topGames" | "topMusic"> {
  const fieldMapping = {
    movies: "topMovies",
    tvShows: "topTvShows", 
    games: "topGames",
    music: "topMusic",
  } as const;
  
  return fieldMapping[showcaseType];
}

// Validate that a media item can be added to a specific showcase
export function validateMediaForShowcase(media: Doc<"media">, showcaseType: ShowcaseType): { valid: boolean; error?: string } {
  const expectedMediaType = SHOWCASE_TO_MEDIA_TYPE[showcaseType];
  
  if (media.type !== expectedMediaType) {
    return {
      valid: false,
      error: `Cannot add ${media.type} to ${showcaseType} showcase. Expected ${expectedMediaType}.`
    };
  }
  
  return { valid: true };
}

// Validate showcase position
export function validatePosition(position: number): { valid: boolean; error?: string } {
  if (position < 0 || position > 3) {
    return {
      valid: false,
      error: "Position must be between 0 and 3"
    };
  }
  
  return { valid: true };
}

// Validate showcase array length
export function validateShowcaseLength(mediaIds: string[]): { valid: boolean; error?: string } {
  if (mediaIds.length > 4) {
    return {
      valid: false,
      error: "Showcase cannot have more than 4 items"
    };
  }
  
  return { valid: true };
}

// Check for duplicate media in showcase
export function checkForDuplicates(currentShowcase: string[], newMediaId: string): { valid: boolean; error?: string } {
  if (currentShowcase.includes(newMediaId)) {
    return {
      valid: false,
      error: "Media is already in your showcase"
    };
  }
  
  return { valid: true };
}

// Insert media at specific position, handling array shifts
export function insertAtPosition(array: string[], item: string, position: number): string[] {
  const newArray = [...array];
  
  if (position >= newArray.length) {
    // Add to end
    newArray.push(item);
  } else {
    // Insert at position
    newArray.splice(position, 0, item);
  }
  
  // Ensure max 4 items
  return newArray.slice(0, 4);
}

// Get friendly name for showcase type
export function getShowcaseDisplayName(showcaseType: ShowcaseType): string {
  const displayNames = {
    movies: "Movies",
    tvShows: "TV Shows",
    games: "Games", 
    music: "Music",
  };
  
  return displayNames[showcaseType];
}

// Get friendly name for media type
export function getMediaTypeDisplayName(mediaType: MediaType): string {
  const displayNames = {
    movie: "Movie",
    tv: "TV Show",
    game: "Game",
    music: "Music",
  };
  
  return displayNames[mediaType];
}

// Determine which showcase a media item should go in based on its type
export function getShowcaseTypeForMedia(media: Doc<"media">): ShowcaseType {
  return MEDIA_TYPE_TO_SHOWCASE[media.type];
}

// Calculate showcase statistics
export interface ShowcaseStats {
  totalItems: number;
  itemsByType: Record<ShowcaseType, number>;
  completionPercentage: number;
  emptyShowcases: ShowcaseType[];
  fullShowcases: ShowcaseType[];
}

export function calculateShowcaseStats(user: Doc<"users">): ShowcaseStats {
  const itemsByType = {
    movies: user.topMovies.length,
    tvShows: user.topTvShows.length,
    games: user.topGames.length,
    music: user.topMusic.length,
  };
  
  const totalItems = Object.values(itemsByType).reduce((sum, count) => sum + count, 0);
  const maxPossibleItems = 16; // 4 items × 4 categories
  const completionPercentage = (totalItems / maxPossibleItems) * 100;
  
  const emptyShowcases: ShowcaseType[] = [];
  const fullShowcases: ShowcaseType[] = [];
  
  Object.entries(itemsByType).forEach(([type, count]) => {
    if (count === 0) {
      emptyShowcases.push(type as ShowcaseType);
    } else if (count === 4) {
      fullShowcases.push(type as ShowcaseType);
    }
  });
  
  return {
    totalItems,
    itemsByType,
    completionPercentage: Math.round(completionPercentage),
    emptyShowcases,
    fullShowcases,
  };
}

// Format showcase for display with media details
export interface ShowcaseItem {
  media: Doc<"media">;
  position: number;
}

export interface FormattedShowcase {
  type: ShowcaseType;
  displayName: string;
  items: ShowcaseItem[];
  availableSlots: number;
  isFull: boolean;
}

export function formatShowcaseWithMedia(
  showcaseType: ShowcaseType,
  mediaItems: Doc<"media">[]
): FormattedShowcase {
  const items: ShowcaseItem[] = mediaItems.map((media, index) => ({
    media,
    position: index,
  }));
  
  return {
    type: showcaseType,
    displayName: getShowcaseDisplayName(showcaseType),
    items,
    availableSlots: 4 - items.length,
    isFull: items.length >= 4,
  };
}

// Validate entire showcase update
export interface ShowcaseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateShowcaseUpdate(
  currentShowcase: string[],
  newMediaIds: string[],
  mediaItems: Doc<"media">[],
  showcaseType: ShowcaseType
): ShowcaseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check length
  const lengthValidation = validateShowcaseLength(newMediaIds);
  if (!lengthValidation.valid) {
    errors.push(lengthValidation.error!);
  }
  
  // Check media types
  mediaItems.forEach((media) => {
    const mediaValidation = validateMediaForShowcase(media, showcaseType);
    if (!mediaValidation.valid) {
      errors.push(`${media.title}: ${mediaValidation.error}`);
    }
  });
  
  // Check for duplicates within the new list
  const duplicates = newMediaIds.filter((id, index) => newMediaIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    errors.push("Duplicate items found in showcase");
  }
  
  // Warnings for significant changes
  if (currentShowcase.length > 0 && newMediaIds.length === 0) {
    warnings.push("This will clear your entire showcase");
  }
  
  const removedItems = currentShowcase.filter(id => !newMediaIds.includes(id));
  if (removedItems.length > 0) {
    warnings.push(`${removedItems.length} item(s) will be removed from your showcase`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}