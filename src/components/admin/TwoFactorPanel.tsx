'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

interface Status {
  enabled: boolean;
  pending: boolean;
  recoveryCodesRemaining: number;
}

/**
 * Two-factor enrolment for a staff account.
 *
 * The secret and the recovery codes are each shown exactly once, at the moment
 * they are created — the server keeps only an encrypted secret and hashes of
 * the codes, so there is no "show them again" to build.
 */
export function TwoFactorPanel({ initial, email }: { initial: Status; email: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(initial);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function begin() {
    setLoading(true);
    setError(null);
    try {
      setSetup(await api.put<{ secret: string; uri: string }>('/api/auth/two-factor', {}));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Setup shuru nahi ho saka.');
    } finally {
      setLoading(false);
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.patch<{ recoveryCodes: string[] }>('/api/auth/two-factor', {
        action: 'confirm',
        code,
      });
      setRecoveryCodes(result.recoveryCodes);
      setStatus({
        enabled: true,
        pending: false,
        recoveryCodesRemaining: result.recoveryCodes.length,
      });
      setSetup(null);
      setCode('');
      toast({ tone: 'success', title: 'Two-factor on ho gaya' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Code check nahi kar sake.');
    } finally {
      setLoading(false);
    }
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.patch('/api/auth/two-factor', { action: 'disable', code });
      setStatus({ enabled: false, pending: false, recoveryCodesRemaining: 0 });
      setCode('');
      toast({ tone: 'success', title: 'Two-factor off kar diya' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Off nahi kar sake.');
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------- recovery codes, shown once
  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
          <p className="text-sm font-semibold text-warn-700">
            Yeh recovery codes abhi mehfooz kar lein
          </p>
          <p className="mt-1 text-sm leading-relaxed text-warn-700/90">
            Har code sirf ek baar chalta hai. Phone kho jaye to yahi aap ko wapis andar laate hain —
            dobara nahi dikhaye jayenge.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded-xl border border-ink-200 bg-ink-50 p-4 font-mono text-sm">
          {recoveryCodes.map((entry) => (
            <li key={entry} className="text-ink-900">
              {entry}
            </li>
          ))}
        </ul>
        <Button variant="outline" onClick={() => setRecoveryCodes(null)}>
          Maine save kar liye
        </Button>
      </div>
    );
  }

  // ------------------------------------------------------------- enrolment
  if (setup) {
    return (
      <form onSubmit={confirm} className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-600">
          Authenticator app (Google Authenticator, 1Password, Authy) mein yeh key add karein, phir
          jo 6-hindson ka code aaye woh likhein.
        </p>
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-500">
            Setup key — {email}
          </p>
          <p className="mt-1 break-all font-mono text-sm font-semibold text-ink-900">
            {setup.secret}
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-alert-600">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <TextInput
            label="App ka code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-40"
          />
          <Button type="submit" loading={loading} disabled={code.length !== 6}>
            Confirm karein
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
            Rehne dein
          </Button>
        </div>
      </form>
    );
  }

  // ---------------------------------------------------------------- status
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">Two-factor authentication</p>
          <p className="mt-0.5 text-sm text-ink-600">
            {status.enabled
              ? `On hai. ${status.recoveryCodesRemaining} recovery codes baqi hain.`
              : 'Password ke saath ek aur code — refunds aur provider approvals is account se hote hain.'}
          </p>
        </div>
        {status.enabled ? <Badge tone="success">✓ On</Badge> : <Badge tone="warn">Off</Badge>}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-alert-600">
          {error}
        </p>
      ) : null}

      {status.enabled ? (
        <form onSubmit={disable} className="flex flex-wrap items-end gap-2">
          <TextInput
            label="Off karne ke liye code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 20))}
            inputMode="numeric"
            className="w-44"
          />
          <Button type="submit" variant="outline" loading={loading} disabled={code.length < 6}>
            Off karein
          </Button>
        </form>
      ) : (
        <Button onClick={begin} loading={loading}>
          Two-factor on karein
        </Button>
      )}
    </div>
  );
}
