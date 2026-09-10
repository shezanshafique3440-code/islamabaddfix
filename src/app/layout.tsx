import type { Metadata, Viewport } from 'next';
import { env } from '@/lib/env';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const APP_NAME = 'Islamabad Fix';
const TAGLINE = 'Problem batao. Baqi hum sambhal lenge.';
const DESCRIPTION =
  'Islamabad mein trusted home & business services — verified professionals, transparent quotes aur easy booking. AC, plumbing, electrical, cleaning, carpenter, appliances aur CCTV.';

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: `${APP_NAME} — ${TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: APP_NAME,
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
  themeColor: '#0b6b51',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Keyboard users land here first and can jump past the nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Main content par jayein
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
