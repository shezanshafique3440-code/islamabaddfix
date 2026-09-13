'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Confirms an email verification link.
 *
 * The token is the proof, so this does not require a session: somebody opening
 * the link from their mail client may well not be signed in there.
 */
export function VerifyEmailView() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState<string | null>(null);
  // React runs effects twice in development; verifying twice would consume the
  // token and then report the second call's failure.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState('failed');
      setMessage('That link is incomplete.');
      return;
    }
    api
      .post('/api/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((error: unknown) => {
        setState('failed');
        setMessage(
          error instanceof ApiError ? error.message : 'Verification could not be completed.',
        );
      });
  }, [token]);

  if (state === 'working') return <Skeleton className="h-40 rounded-xl" />;

  if (state === 'done') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-sm font-semibold text-brand-900">Email verified</p>
          <p className="mt-1 text-sm leading-relaxed text-brand-900/90">
            You can now get booking updates by email too.
          </p>
        </div>
        <Link href="/account" className="block">
          <Button fullWidth size="lg">
            Open account
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
        <p className="text-sm font-semibold text-alert-700">Could not be verified</p>
        <p className="mt-1 text-sm leading-relaxed text-alert-700/90">{message}</p>
      </div>
      <Link href="/account/profile" className="block">
        <Button fullWidth size="lg" variant="secondary">
          Send a new link from your profile
        </Button>
      </Link>
    </div>
  );
}
