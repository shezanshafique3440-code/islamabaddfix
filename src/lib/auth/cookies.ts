import { cookies } from 'next/headers';
import { env, isProduction } from '../env';

/**
 * Cookie names are prefixed with `__Host-` in production, which pins them to
 * the exact host over HTTPS and blocks subdomain cookie-shadowing attacks.
 * That prefix requires Secure + Path=/ + no Domain, so it cannot be used on
 * plain-HTTP local development.
 */
export const ACCESS_COOKIE = isProduction ? '__Host-ifx_at' : 'ifx_at';
export const REFRESH_COOKIE = isProduction ? '__Host-ifx_rt' : 'ifx_rt';
/**
 * Readable-by-JS CSRF token. Paired with a header echo on unsafe requests
 * (double-submit); the value is meaningless without the matching cookie.
 */
export const CSRF_COOKIE = 'ifx_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const baseOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
};

export async function setAuthCookies(params: {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, params.accessToken, {
    ...baseOptions,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  jar.set(REFRESH_COOKIE, params.refreshToken, {
    ...baseOptions,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
  jar.set(CSRF_COOKIE, params.csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    jar.set(name, '', { ...baseOptions, httpOnly: name !== CSRF_COOKIE, maxAge: 0 });
  }
}

export async function readAuthCookies(): Promise<{
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
}> {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value,
    refreshToken: jar.get(REFRESH_COOKIE)?.value,
    csrfToken: jar.get(CSRF_COOKIE)?.value,
  };
}
