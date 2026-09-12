import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * `script-src 'self'` is the load-bearing part: an injected `<script src=...>`
 * pointing anywhere off-origin is refused, as is any plugin, frame or form post
 * to another origin. Inline scripts are still allowed, because Next's hydration
 * bootstrap is inline and the alternative — a per-request nonce issued from
 * middleware — makes every page dynamic, which would cost the marketing pages
 * their static rendering. That is a deliberate trade-off, not an oversight: it
 * means CSP is a second line of defence here rather than a complete one, so
 * output escaping (see src/lib/seo.ts) has to be right on its own. Moving to
 * nonce-based CSP is the documented next step.
 *
 * `style-src` needs `unsafe-inline` for the same reason Next injects styles at
 * runtime. `connect-src 'self'` is accurate today: no browser code in this app
 * calls a third-party origin — the maps, AI, payment and messaging integrations
 * are all called server-side.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'" +
    (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

/**
 * Security headers applied to every response.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server with only the node_modules
  // it actually imports, which is what the Dockerfile copies into the runtime
  // image. Keeps the production image small and free of build tooling.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Server Actions payload ceiling — file uploads go through the API route instead.
    serverActions: { bodySizeLimit: '2mb' },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
