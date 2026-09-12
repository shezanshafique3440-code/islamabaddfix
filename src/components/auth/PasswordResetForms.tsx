'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { NotConfiguredNotice } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

interface ForgotResult {
  message: string;
  delivered: boolean;
  devToken?: string;
  notice?: string;
}

/**
 * Step one of a password reset.
 *
 * The success message is the same whether or not the address is registered —
 * the server answers identically on purpose, and the UI must not undo that by
 * saying "no such account".
 */
export function ForgotPasswordForm() {
  const [result, setResult] = useState<ForgotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      setResult(
        await api.post<ForgotResult>('/api/auth/forgot-password', {
          email: String(form.get('email') ?? ''),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Request bhej nahi sake. Dobara koshish karein.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-sm leading-relaxed text-brand-900">{result.message}</p>
        </div>

        {/* Honest about delivery: a "check your inbox" for mail that was never
            sent is exactly the kind of lie this product does not tell. */}
        {!result.delivered && result.notice ? (
          <NotConfiguredNotice feature="Email bhejna" detail={result.notice} />
        ) : null}

        {result.devToken ? (
          <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Development token
            </p>
            <Link
              href={`/reset-password?token=${encodeURIComponent(result.devToken)}`}
              className="mt-1.5 block break-all text-sm font-medium text-brand-700 underline"
            >
              Reset link kholein
            </Link>
          </div>
        ) : null}

        <Link
          href="/login"
          className="block text-center text-sm font-medium text-brand-700 hover:underline"
        >
          Login par wapis jayein
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
          <p className="text-sm font-medium text-alert-700">{error}</p>
        </div>
      ) : null}

      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="aap@example.com"
        hint="Jis email se account banaya tha."
      />

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Reset link bhejein
      </Button>

      <p className="text-center text-sm text-ink-600">
        Yaad aa gaya?{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Login karein
        </Link>
      </p>
    </form>
  );
}

/** Step two: set the new password, using the token from the link. */
export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'checking' | 'invalid' | 'ready' | 'done'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // Fail before asking for a password: nobody should type a new password twice
  // only to be told the link expired.
  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    let cancelled = false;
    api
      .get<{ valid: boolean }>(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!cancelled) setState(r.valid ? 'ready' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('newPassword') ?? '');
    const confirm = String(form.get('confirmPassword') ?? '');

    if (password !== confirm) {
      setFieldError('Dono passwords ek jaise nahi hain.');
      setLoading(false);
      return;
    }

    try {
      await api.post('/api/auth/reset-password', { token, newPassword: password });
      setState('done');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldError(caught.fieldMap.newPassword);
        setError(caught.message);
      } else {
        setError('Password badal nahi saka. Dobara koshish karein.');
      }
      setLoading(false);
    }
  }

  if (state === 'checking') return <Skeleton className="h-56 rounded-xl" />;

  if (state === 'invalid') {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
          <p className="text-sm font-semibold text-alert-700">Yeh link ab kaam nahi karta</p>
          <p className="mt-1 text-sm leading-relaxed text-alert-700/90">
            Reset link 30 minute tak valid rehta hai, aur ek hi baar istemal hota hai. Naya link
            mangwa lein.
          </p>
        </div>
        <Link href="/forgot-password" className="block">
          <Button fullWidth size="lg">
            Naya link mangwayein
          </Button>
        </Link>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-sm font-semibold text-brand-900">Password badal gaya</p>
          <p className="mt-1 text-sm leading-relaxed text-brand-900/90">
            Hifazat ke liye aapke sab devices se logout kar diya gaya hai. Naye password se login
            karein.
          </p>
        </div>
        <Link href="/login" className="block">
          <Button fullWidth size="lg">
            Login karein
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
          <p className="text-sm font-medium text-alert-700">{error}</p>
        </div>
      ) : null}

      <TextInput
        label="Naya password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError}
        hint="Kam az kam 10 characters, choti aur bari letters ya numbers ke saath."
      />
      <TextInput
        label="Naya password dobara"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
      />

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Password set karein
      </Button>
    </form>
  );
}
