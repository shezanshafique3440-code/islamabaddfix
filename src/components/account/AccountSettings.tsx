'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, TextInput, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

interface Preferences {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
  marketing: boolean;
}

const CHANNELS: Array<{ key: keyof Preferences; label: string; hint: string }> = [
  { key: 'email', label: 'Email', hint: 'Booking confirmations, quotes and receipts.' },
  { key: 'sms', label: 'SMS', hint: 'Notice before the technician arrives.' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'The same updates on WhatsApp.' },
  { key: 'push', label: 'Push', hint: 'Browser ya app notification.' },
  {
    key: 'marketing',
    label: 'Offers and new services',
    hint: 'Only when you turn it on yourself.',
  },
];

/** Delivery choices. In-app is not listed because it cannot be switched off. */
export function NotificationPreferences({ initial }: { initial: Preferences }) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(key: keyof Preferences, value: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSaving(key);
    try {
      setPrefs(await api.patch<Preferences>('/api/account/notifications', { [key]: value }));
    } catch (caught) {
      // Put the switch back rather than leaving the UI claiming something the
      // server did not accept.
      setPrefs(previous);
      toast({
        tone: 'error',
        title: caught instanceof ApiError ? caught.message : 'The setting was not saved.',
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {CHANNELS.map((channel) => (
        <Checkbox
          key={channel.key}
          checked={prefs[channel.key]}
          disabled={saving === channel.key}
          onChange={(event) => void toggle(channel.key, event.target.checked)}
          label={
            <span>
              <span className="font-medium text-ink-900">{channel.label}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{channel.hint}</span>
            </span>
          }
        />
      ))}
      <p className="border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
        Essential booking notices always stay on inside the app — they cannot be turned off.
        Password and security messages are always sent too.
      </p>
    </div>
  );
}

/** Data export and account closure — the two rights the privacy policy names. */
export function AccountControls({ blockers }: { blockers: string[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function close(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/account/close', { password, reason: reason.trim() || undefined });
      toast({ tone: 'success', title: 'Account closed' });
      window.location.href = '/';
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The account could not be closed.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">Download your data</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          Your details, bookings, quotes, payments and reviews, in one JSON file.
        </p>
        {/* A plain link: the server sends it as a download, so no script needed. */}
        <a
          href="/api/account/export"
          className="mt-2 inline-flex h-9 items-center rounded-xl border border-ink-300 px-3.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          Download
        </a>
      </div>

      <div className="border-t border-ink-100 pt-5">
        <h3 className="text-sm font-semibold text-ink-900">Close account</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          Your name, email, phone, addresses and photos are removed. Booking and payment records are
          kept to meet accounting requirements and the other party’s rights — but your name is no
          longer on them.
        </p>

        {blockers.length > 0 ? (
          <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
            <p className="text-sm font-semibold text-warn-700">Cannot be closed yet</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-warn-700/90">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
            Close account
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Close account"
        description="This cannot be undone. Enter your password to confirm."
      >
        <form onSubmit={close} className="space-y-4">
          {error ? (
            <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
              <p className="text-sm font-medium text-alert-700">{error}</p>
            </div>
          ) : null}

          <TextInput
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Textarea
            label="Reason (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 500))}
            rows={2}
            hint="This helps us improve. Optional."
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Leave it
            </Button>
            <Button type="submit" variant="danger" loading={loading} disabled={!password}>
              Close permanently
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
