// convex/showcases/index.ts
// Main export file for all showcase functionality

// Re-export all showcase operations
export {
  getUserShowcases,
  addToShowcase,
  removeFromShowcase,
  reorderShowcase,
  replaceShowcase,
  clearShowcase,
  getShowcaseAvailability,
  checkMediaInShowcases,
} from "./showcaseOperations";

// Re-export search and discovery functions
export {
  searchForShowcase,
  getShowcaseRecommendations,
  getRecentMediaForShowcase,
  getLoggedMediaForShowcase,
  quickAddToShowcase,
} from "./showcaseSearch";

// Re-export helper functions (these are only in showcaseHelpers.ts)
export {
  getProfileShowcaseData,
  smartAddToShowcase,
  batchUpdateShowcases,
  getShowcaseEditData,
} from "./showcaseHelpers";

// Re-export utilities and types
export {
  type ShowcaseType,
  type MediaType,
  type ShowcaseStats,
  type ShowcaseItem,
  type FormattedShowcase,
  type ShowcaseValidationResult,
  SHOWCASE_TO_MEDIA_TYPE,
  MEDIA_TYPE_TO_SHOWCASE,
  getShowcaseFieldName,
  validateMediaForShowcase,
  validatePosition,
  validateShowcaseLength,
  checkForDuplicates,
  insertAtPosition,
  getShowcaseDisplayName,
  getMediaTypeDisplayName,
  getShowcaseTypeForMedia,
  calculateShowcaseStats,
  formatShowcaseWithMedia,
  validateShowcaseUpdate,
} from "./showcaseUtils";