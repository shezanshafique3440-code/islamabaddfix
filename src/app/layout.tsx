import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { env } from '@/lib/env';
import { ToastProvider } from '@/components/ui/Toast';
import { THEME_INIT_SCRIPT } from '@/components/layout/ThemeToggle';
import './globals.css';

/**
 * The one webfont on the site.
 *
 * Headings only, latin only, and the variable axis rather than three static
 * cuts — so the whole thing is a single file of roughly forty kilobytes, served
 * from this origin by next/font rather than from Google. `adjustFontFallback`
 * generates a metric-matched local fallback, so the pre-swap paint occupies the
 * same space and nothing jumps when the real face lands. Body copy stays on the
 * system stack, which is still where nearly all the text on a page is.
 */
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
});

const APP_NAME = 'Islamabad Fix';
const TAGLINE = 'Tell us the problem. We will handle the rest.';
const DESCRIPTION =
  'Trusted home and business services in Islamabad — verified professionals, transparent quotes and easy booking. AC, plumbing, electrical, cleaning, carpentry, appliances and CCTV.';

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: `${APP_NAME} — ${TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  keywords: [
    'Islamabad services',
    'AC repair Islamabad',
    'plumber Islamabad',
    'electrician Islamabad',
    'home cleaning Islamabad',
    'CCTV installation Islamabad',
    'appliance repair Islamabad',
  ],
  authors: [{ name: APP_NAME }],
  openGraph: {
    type: 'website',
    locale: 'en_PK',
    siteName: APP_NAME,
    title: `${APP_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    url: env.NEXT_PUBLIC_APP_URL,
  },
  twitter: { card: 'summary_large_image', title: APP_NAME, description: DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is left enabled deliberately: pinch-to-zoom is an accessibility need.
  maximumScale: 5,
  // Two entries so the browser chrome matches the theme in use rather than
  // painting a light bar above a dark page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b6b51' },
    { media: '(prefers-color-scheme: dark)', color: '#12171a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <head>
        {/*
         * Applies the stored theme before the first paint. Without this, every
         * dark-mode user sees a white flash on every navigation — the single
         * thing that makes a dark theme feel bolted on.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {/* Keyboard users land here first and can jump past the nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white dark:focus:text-brand-50"
        >
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
