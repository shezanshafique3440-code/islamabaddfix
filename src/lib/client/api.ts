'use client';

/**
 * Browser API client.
 *
 * Responsibilities:
 *  - attach the CSRF header on unsafe requests (double-submit against the
 *    non-httpOnly cookie the server set at login)
 *  - retry once through /api/auth/refresh when the access token has expired,
 *    so a 15-minute token never interrupts someone mid-booking
 *  - unwrap the { success, data } envelope and turn failures into a typed
 *    ApiError carrying the server's code and any field errors
 */

import { CSRF_COOKIE_NAME, CSRF_HEADER } from './csrf';

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: FieldError[];

  constructor(message: string, code: string, status: number, fields?: FieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }

  /** Field errors keyed by path, for wiring straight into form inputs. */
  get fieldMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const field of this.fields ?? []) {
      map[field.path] ??= field.message;
    }
    return map;
  }
}

function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === CSRF_COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set internally to stop a refresh loop. */
  retried?: boolean;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  fields?: FieldError[];
  meta?: Record<string, unknown>;
}

async function send<T>(
  path: string,
  options: RequestOptions,
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { body, retried, headers, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const finalHeaders = new Headers(headers);
  if (!isFormData && body !== undefined) finalHeaders.set('Content-Type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCsrfToken();
    if (csrf) finalHeaders.set(CSRF_HEADER, csrf);
  }

  const response = await fetch(path, {
    ...rest,
    method,
    headers: finalHeaders,
    credentials: 'same-origin',
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  // An expired access token: refresh once, then replay the original request.
  if (response.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    const refreshHeaders = new Headers();
    const csrf = readCsrfToken();
    if (csrf) refreshHeaders.set(CSRF_HEADER, csrf);
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: refreshHeaders,
    });
    if (refreshed.ok) return send<T>(path, { ...options, retried: true });
  }

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError(
      'No response from the server. Please try again.',
      'INTERNAL_ERROR',
      response.status,
    );
  }

  if (!response.ok || payload.success !== true) {
    throw new ApiError(
      payload.message ?? 'Something went wrong.',
      payload.code ?? 'INTERNAL_ERROR',
      response.status,
      payload.fields,
    );
  }

  return { data: payload.data as T, meta: payload.meta };
}

const unwrap = async <T>(path: string, options: RequestOptions): Promise<T> =>
  (await send<T>(path, options)).data;

export const api = {
  get: <T>(path: string) => unwrap<T>(path, {}),
  post: <T>(path: string, body?: unknown) => unwrap<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => unwrap<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => unwrap<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => unwrap<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    unwrap<T>(path, { method: 'POST', body: formData }),
  /** Use when the response's `meta` (e.g. pagination) is needed. */
  withMeta: <T>(path: string, options: RequestOptions = {}) => send<T>(path, options),
};
