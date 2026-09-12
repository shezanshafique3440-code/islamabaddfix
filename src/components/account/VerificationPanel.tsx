'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { NotConfiguredNotice } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface SendResult {
  delivered: boolean;
  sentTo?: string;
  devToken?: string;
  notice?: string;
}

/**
 * Email and phone verification.
 *
 * A badge here means a check that actually completed — an emailed link that was
 * opened, or an SMS code that was typed back. Nothing is marked verified
 * because a field merely has a value in it.
 */
export function VerificationPanel({
  email,
  phone,
  emailVerified,
  phoneVerified,
}: {
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}) {
  return (
    <div className="space-y-5">
      <EmailRow email={email} verified={emailVerified} />
      <div className="border-t border-ink-100 pt-5">
        <PhoneRow phone={phone} verified={phoneVerified} />
      </div>
    </div>
  );
}

function EmailRow({ email, verified }: { email: string; verified: boolean }) {
  const { toast } = useToast();
  const [result, setResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    try {
      const response = await api.put<SendResult>('/api/auth/verify-email', {});
      setResult(response);
      if (response.delivered) {
        toast({ tone: 'success', title: 'Verification link bhej diya', description: email });
      }
    } catch (caught) {
      toast({
        tone: 'error',
        title: caught instanceof ApiError ? caught.message : 'Link bhej nahi sake.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">Email</p>
          <p className="mt-0.5 truncate text-sm text-ink-600">{email}</p>
        </div>
        {verified ? (
          <Badge tone="success">✓ Verified</Badge>
        ) : (
          <Button size="sm" variant="outline" onClick={send} loading={loading}>
            Verification link bhejein
          </Button>
        )}
      </div>

      {!verified && result ? (
        <div className="mt-3 space-y-2">
          {result.delivered ? (
            <p className="text-sm text-ink-600">
              Link bhej diya gaya. Inbox aur spam folder dekhein — 24 ghante tak valid hai.
            </p>
          ) : result.notice ? (
            <NotConfiguredNotice feature="Email bhejna" detail={result.notice} />
          ) : null}
          {result.devToken ? (
            <a
              href={`/verify-email?token=${encodeURIComponent(result.devToken)}`}
              className="block break-all text-sm font-medium text-brand-700 underline"
            >
              Development: verification link kholein
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PhoneRow({ phone, verified }: { phone: string | null; verified: boolean }) {
  const { toast } = useToast();
  const [stage, setStage] = useState<'idle' | 'code'>('idle');
  const [result, setResult] = useState<SendResult | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(verified);

  async function send() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.put<SendResult>('/api/auth/verify-phone', {});
      setResult(response);
      setStage('code');
      if (response.delivered) toast({ tone: 'success', title: 'Code bhej diya' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Code bhej nahi sake.');
    } finally {
      setLoading(false);
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/auth/verify-phone', { code });
      setDone(true);
      setStage('idle');
      toast({ tone: 'success', title: 'Number verify ho gaya' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Code check nahi kar sake.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">Phone number</p>
          <p className="mt-0.5 truncate text-sm text-ink-600">
            {phone ?? 'Abhi koi number add nahi kiya'}
          </p>
        </div>
        {done ? (
          <Badge tone="success">✓ Verified</Badge>
        ) : phone ? (
          <Button size="sm" variant="outline" onClick={send} loading={loading && stage === 'idle'}>
            {stage === 'code' ? 'Naya code bhejein' : 'Code bhejein'}
          </Button>
        ) : (
          <Badge tone="neutral">Pehle number add karein</Badge>
        )}
      </div>

      {!done && stage === 'code' ? (
        <div className="mt-3 space-y-3">
          {result && !result.delivered && result.notice ? (
            <NotConfiguredNotice feature="SMS bhejna" detail={result.notice} />
          ) : null}
          {result?.devToken ? (
            <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700">
              Development code: <span className="font-mono font-semibold">{result.devToken}</span>
            </p>
          ) : null}

          <form onSubmit={confirm} className="flex flex-wrap items-end gap-2">
            <TextInput
              label="6-hindson ka code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              error={error ?? undefined}
              className="w-40"
            />
            <Button type="submit" loading={loading} disabled={code.length !== 6}>
              Verify karein
            </Button>
          </form>
          <p className="text-xs text-ink-500">Code 10 minute tak valid hai.</p>
        </div>
      ) : null}

      {!done && stage === 'idle' && error ? (
        <p role="alert" className="mt-2 text-sm text-alert-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
