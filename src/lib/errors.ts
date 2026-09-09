/**
 * Application error taxonomy.
 *
 * Every failure surfaced to a client goes through AppError so responses have a
 * stable shape ({ success, message, code }) and stack traces stay server-side.
 */

export type ErrorCode =
  // auth
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'FORBIDDEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REUSED'
  | 'EMAIL_TAKEN'
  | 'PHONE_TAKEN'
  // validation / request
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  // domain
  | 'INVALID_STATUS_TRANSITION'
  | 'BOOKING_NOT_AVAILABLE'
  | 'PROVIDER_NOT_VERIFIED'
  | 'PROVIDER_SUSPENDED'
  | 'PROVIDER_AT_CAPACITY'
  | 'NO_PROVIDERS_AVAILABLE'
  | 'QUOTE_NOT_PENDING'
  | 'QUOTE_REQUIRED'
  | 'REVIEW_ALREADY_EXISTS'
  | 'REVIEW_NOT_ALLOWED'
  | 'PAYMENT_ALREADY_SETTLED'
  | 'GUARANTEE_NOT_ELIGIBLE'
  | 'GUARANTEE_EXPIRED'
  | 'DISPUTE_ALREADY_OPEN'
  | 'CANCELLATION_NOT_ALLOWED'
  | 'PROMO_INVALID'
  // integrations
  | 'INTEGRATION_NOT_CONFIGURED'
  | 'INTEGRATION_FAILED'
  // fallback
  | 'INTERNAL_ERROR';

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_DISABLED: 403,
  FORBIDDEN: 403,
  TOKEN_EXPIRED: 401,
  TOKEN_REUSED: 401,
  EMAIL_TAKEN: 409,
  PHONE_TAKEN: 409,
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INVALID_STATUS_TRANSITION: 409,
  BOOKING_NOT_AVAILABLE: 409,
  PROVIDER_NOT_VERIFIED: 403,
  PROVIDER_SUSPENDED: 403,
  PROVIDER_AT_CAPACITY: 409,
  NO_PROVIDERS_AVAILABLE: 404,
  QUOTE_NOT_PENDING: 409,
  QUOTE_REQUIRED: 409,
  REVIEW_ALREADY_EXISTS: 409,
  REVIEW_NOT_ALLOWED: 403,
  PAYMENT_ALREADY_SETTLED: 409,
  GUARANTEE_NOT_ELIGIBLE: 409,
  GUARANTEE_EXPIRED: 409,
  DISPUTE_ALREADY_OPEN: 409,
  CANCELLATION_NOT_ALLOWED: 409,
  PROMO_INVALID: 422,
  INTEGRATION_NOT_CONFIGURED: 503,
  INTEGRATION_FAILED: 502,
  INTERNAL_ERROR: 500,
};

export interface FieldError {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldError[];
  /** Extra context logged server-side but never returned to the client. */
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; fields?: FieldError[]; context?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? DEFAULT_STATUS[code];
    this.fields = options?.fields;
    this.context = options?.context;
  }
}

/** Convenience constructors for the codes used most often. */
export const notFound = (what = 'Resource') =>
  new AppError('NOT_FOUND', `${what} nahi mila. (${what} not found.)`);
export const forbidden = (message = 'Aap is action ke liye authorized nahi hain.') =>
  new AppError('FORBIDDEN', message);
export const unauthenticated = (message = 'Pehle login karein.') =>
  new AppError('UNAUTHENTICATED', message);
export const validationError = (message: string, fields?: FieldError[]) =>
  new AppError('VALIDATION_ERROR', message, { fields });
export const notConfigured = (integration: string) =>
  new AppError(
    'INTEGRATION_NOT_CONFIGURED',
    `${integration} abhi configured nahi hai. (${integration} is not configured on this deployment.)`,
  );
