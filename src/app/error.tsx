'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui/Button';

/**
 * Global error boundary.
 *
 * Never renders the error's message or stack: those can contain internal detail,
 * and the server already logged the specifics. `digest` is Next's own
 * correlation id, which is safe to show and lets support find the log line.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] rendering error', { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-display-sm text-ink-950">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          We could not load this page. Try again — if the problem continues, contact support.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-ink-500">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="outline">
            Home
          </ButtonLink>
        </div>
        <p className="mt-5 text-sm text-ink-500">
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
