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
} as const;