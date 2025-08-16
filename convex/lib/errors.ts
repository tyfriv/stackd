// convex/lib/errors.ts
export class StackdError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'StackdError';
  }
}

export const ERROR_CODES = {
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  CONTENT_BLOCKED: 'CONTENT_BLOCKED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  // Forum-specific error codes
  THREAD_LOCKED: 'THREAD_LOCKED',
  THREAD_ARCHIVED: 'THREAD_ARCHIVED',
  CATEGORY_DISABLED: 'CATEGORY_DISABLED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  INVALID_QUOTE: 'INVALID_QUOTE',
  SELF_REFERENCE: 'SELF_REFERENCE',
  MODERATION_REQUIRED: 'MODERATION_REQUIRED',
} as const;

// Helper function to create standardized errors
export function createError(
  code: keyof typeof ERROR_CODES,
  message: string,
  statusCode?: number,
  userMessage?: string
): StackdError {
  const defaultStatusCodes = {
    AUTH_ERROR: 401,
    VALIDATION_ERROR: 400,
    NOT_FOUND: 404,
    RATE_LIMITED: 429,
    CONTENT_BLOCKED: 400,
    UNAUTHORIZED: 403,
    DUPLICATE_RESOURCE: 409,
    EXTERNAL_API_ERROR: 502,
    // Forum-specific status codes
    THREAD_LOCKED: 423, // Locked
    THREAD_ARCHIVED: 410, // Gone
    CATEGORY_DISABLED: 403, // Forbidden
    INSUFFICIENT_PERMISSIONS: 403,
    CONTENT_TOO_LONG: 413, // Payload Too Large
    CONTENT_TOO_SHORT: 400,
    INVALID_QUOTE: 400,
    SELF_REFERENCE: 400,
    MODERATION_REQUIRED: 202, // Accepted (for review)
  };

  return new StackdError(
    message,
    ERROR_CODES[code],
    statusCode || defaultStatusCodes[code],
    userMessage
  );
}

// Forum-specific error creators for common scenarios
export const ForumErrors = {
  threadLocked: (threadTitle?: string) => createError(
    'THREAD_LOCKED',
    `Thread "${threadTitle || 'Unknown'}" is locked`,
    423,
    'This thread is locked and cannot be modified.'
  ),

  threadNotFound: (threadId?: string) => createError(
    'NOT_FOUND',
    `Thread ${threadId || 'unknown'} not found`,
    404,
    'Thread not found.'
  ),

  replyNotFound: (replyId?: string) => createError(
    'NOT_FOUND',
    `Reply ${replyId || 'unknown'} not found`,
    404,
    'Reply not found.'
  ),

  categoryNotFound: (categoryId?: string) => createError(
    'NOT_FOUND',
    `Category ${categoryId || 'unknown'} not found`,
    404,
    'Category not found.'
  ),

  invalidQuote: (reason?: string) => createError(
    'INVALID_QUOTE',
    `Invalid quote reference: ${reason || 'unknown reason'}`,
    400,
    'The quoted message is not valid.'
  ),

  selfQuote: () => createError(
    'SELF_REFERENCE',
    'Cannot quote your own message',
    400,
    'You cannot quote your own message.'
  ),

  contentTooLong: (maxLength: number, actualLength: number) => createError(
    'CONTENT_TOO_LONG',
    `Content length ${actualLength} exceeds maximum of ${maxLength}`,
    413,
    `Content is too long. Maximum ${maxLength} characters allowed.`
  ),

  contentTooShort: (minLength: number, actualLength: number) => createError(
    'CONTENT_TOO_SHORT',
    `Content length ${actualLength} is below minimum of ${minLength}`,
    400,
    `Content is too short. Minimum ${minLength} characters required.`
  ),

  unauthorized: (action: string) => createError(
    'UNAUTHORIZED',
    `User is not authorized to ${action}`,
    403,
    'You are not authorized to perform this action.'
  ),

  rateLimited: (action: string, limit: number, window: string) => createError(
    'RATE_LIMITED',
    `Rate limit exceeded for ${action}: ${limit} per ${window}`,
    429,
    `You're doing that too often. Please wait before trying again.`
  ),

  blockedContent: (reason?: string) => createError(
    'CONTENT_BLOCKED',
    `Content blocked: ${reason || 'violates community guidelines'}`,
    400,
    'Your content violates our community guidelines and cannot be posted.'
  ),

  moderationRequired: () => createError(
    'MODERATION_REQUIRED',
    'Content requires moderation approval',
    202,
    'Your content has been submitted for review and will appear after approval.'
  ),
};

// Error logging helper (for debugging)
export function logError(error: Error | StackdError, context?: Record<string, any>) {
  console.error('Error occurred:', {
    name: error.name,
    message: error.message,
    code: error instanceof StackdError ? error.code : 'UNKNOWN',
    statusCode: error instanceof StackdError ? error.statusCode : 500,
    context,
    stack: error.stack,
  });
}

// Error response formatter for consistent client responses
export function formatErrorResponse(error: Error | StackdError) {
  if (error instanceof StackdError) {
    return {
      error: true,
      code: error.code,
      message: error.userMessage || error.message,
      statusCode: error.statusCode,
    };
  }

  // Generic error response for non-StackdError instances
  return {
    error: true,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    statusCode: 500,
  };
}