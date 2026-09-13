import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, type ErrorCode, type FieldError } from './errors';
import { corsAllowedOrigins, isProduction } from './env';
import { CSRF_COOKIE, CSRF_HEADER } from './auth/cookies';

/**
 * Uniform API envelope.
 *
 * Success: { success: true, data, meta? }
 * Failure: { success: false, message, code, fields? }
 *
 * Stack traces and internal context never leave the server.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: ErrorCode;
  fields?: FieldError[];
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data, ...(meta ? { meta } : {}) }, init);
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, meta, { status: 201 });
}

export function fail(error: AppError, extraHeaders?: HeadersInit) {
  return NextResponse.json<ApiFailure>(
    {
      success: false,
      message: error.message,
      code: error.code,
      ...(error.fields ? { fields: error.fields } : {}),
    },
    { status: error.status, headers: extraHeaders },
  );
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export function paginated<T>(items: T[], pagination: PaginationMeta) {
  return ok(items, { pagination });
}

// -------------------------------------------------------------- error mapping

function zodToAppError(error: ZodError): AppError {
  return new AppError('VALIDATION_ERROR', 'Some of the details are missing or incorrect.', {
    fields: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    })),
  });
}

function prismaToAppError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      const target = Array.isArray(error.meta?.target)
        ? (error.meta.target as string[]).join(', ')
        : String(error.meta?.target ?? 'field');
      return new AppError('CONFLICT', `That record already exists (${target}).`);
    }
    case 'P2003':
      return new AppError('CONFLICT', 'A related record does not exist.');
    case 'P2025':
      return new AppError('NOT_FOUND', 'Record not found.');
    default:
      return new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.', {
        context: { prismaCode: error.code },
      });
  }
}

/** Normalise anything thrown inside a handler into an AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return zodToAppError(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) return prismaToAppError(error);
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError('VALIDATION_ERROR', 'The request data is not valid.');
  }
  return new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

/**
 * Wrap a route handler: catches everything, logs server-side detail, returns
 * the shared error envelope. Handlers stay free of try/catch boilerplate.
 */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const guard = guardRequest(request);
      if (guard) return guard;
      return await handler(request, ...args);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.status >= 500) {
        console.error('[api] unhandled error', {
          url: request.url,
          method: request.method,
          code: appError.code,
          message: appError.message,
          context: appError.context,
          stack: error instanceof Error ? error.stack : undefined,
        });
      } else if (!isProduction) {
        console.warn('[api]', appError.code, appError.message);
      }
      const headers: Record<string, string> = {};
      if (appError.code === 'RATE_LIMITED') {
        const retry = Number(appError.context?.retryAfterSeconds ?? 60);
        headers['Retry-After'] = String(retry);
      }
      return fail(appError, headers);
    }
  };
}

// ------------------------------------------------------------ request guards

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF + origin checks for cookie-authenticated mutations.
 *
 * Two independent defences:
 *  1. Origin/Referer must match the app or an explicitly allow-listed origin.
 *  2. Double-submit CSRF token: header must equal the non-httpOnly cookie.
 *
 * Webhook routes opt out via `x-ifx-webhook` handling in their own module —
 * they authenticate by signature instead and are matched by path below.
 */
const WEBHOOK_PATHS = ['/api/webhooks/'];

function guardRequest(request: Request): Response | null {
  if (!UNSAFE_METHODS.has(request.method)) return null;

  const url = new URL(request.url);
  if (WEBHOOK_PATHS.some((p) => url.pathname.startsWith(p))) return null;

  const origin = request.headers.get('origin');
  if (origin) {
    const allowed = [url.origin, ...corsAllowedOrigins];
    if (!allowed.includes(origin)) {
      return fail(
        new AppError('FORBIDDEN', 'Cross-origin requests are not allowed.', {
          context: { origin },
        }),
      );
    }
  }

  // Double-submit CSRF check. Absent cookie means an unauthenticated caller
  // (login/register), where CSRF has nothing to ride on.
  const cookieToken = readCookie(request, CSRF_COOKIE);
  if (cookieToken) {
    const headerToken = request.headers.get(CSRF_HEADER);
    if (!headerToken || headerToken !== cookieToken) {
      return fail(new AppError('FORBIDDEN', 'The CSRF token is missing or wrong.'));
    }
  }
  return null;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

// ------------------------------------------------------------------- parsing

export async function parseJson<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', 'The request body is not valid JSON.');
  }
  return schema.parse(body);
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): output<S> {
  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0]!;
  }
  return schema.parse(raw);
}

export function requestMeta(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;
  return { ipAddress, userAgent: request.headers.get('user-agent') };
}

/** Rate-limit identity: the user when known, otherwise the client IP. */
export function rateLimitIdentity(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const { ipAddress } = requestMeta(request);
  return `ip:${ipAddress ?? 'unknown'}`;
}
