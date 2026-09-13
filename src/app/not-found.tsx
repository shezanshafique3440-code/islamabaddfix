import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex h-16 max-w-content items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="text-eyebrow uppercase text-brand-700">404</p>
          <h1 className="mt-2 text-display-sm text-ink-950">Page not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            The link may be old or the page may have been removed. Carry on from below.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <ButtonLink href="/">Home</ButtonLink>
            <ButtonLink href="/services" variant="outline">
              All services
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm text-ink-500">
            Need help?{' '}
            <Link href="/contact" className="font-medium text-brand-700 hover:underline">
              Contact support
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
