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
  };

  return new StackdError(
    message,
    ERROR_CODES[code],
    statusCode || defaultStatusCodes[code],
    userMessage
  );
}