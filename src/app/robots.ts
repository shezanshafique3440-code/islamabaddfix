import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing behind authentication should be crawled, and the API is not
        // content. `/book` is excluded because it is a stateful wizard, not a
        // page worth indexing.
        disallow: ['/api/', '/account/', '/provider/', '/admin/', '/book', '/login', '/register'],
      },
    ],
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
