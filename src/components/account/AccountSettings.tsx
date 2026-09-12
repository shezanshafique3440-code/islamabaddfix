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
  { key: 'email', label: 'Email', hint: 'Booking confirm, quote aur receipt.' },
  { key: 'sms', label: 'SMS', hint: 'Technician ke aane se pehle ittila.' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Wohi updates WhatsApp par.' },
  { key: 'push', label: 'Push', hint: 'Browser ya app notification.' },
  {
    key: 'marketing',
    label: 'Offers aur naye services',
    hint: 'Sirf tab jab aap khud on karein.',
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
        title: caught instanceof ApiError ? caught.message : 'Setting save nahi hui.',
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
        Booking ki zaroori ittila hamesha app ke andar milti rahegi — woh band nahi hoti. Password
        aur security ke messages bhi hamesha bheje jate hain.
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
      toast({ tone: 'success', title: 'Account band kar diya gaya' });
      window.location.href = '/';
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Account band nahi ho saka.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">Apna data download karein</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          Aap ki maloomat, bookings, quotes, payments aur reviews ek JSON file mein.
        </p>
        {/* A plain link: the server sends it as a download, so no script needed. */}
        <a
          href="/api/account/export"
          className="mt-2 inline-flex h-9 items-center rounded-xl border border-ink-300 px-3.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          Download karein
        </a>
      </div>

      <div className="border-t border-ink-100 pt-5">
        <h3 className="text-sm font-semibold text-ink-900">Account band karein</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          Aapka naam, email, phone, addresses aur tasveerein hata di jayengi. Booking aur payment ka
          record accounting ki zaroorat aur doosri party ke haq ke tehat rakha jata hai — us par aap
          ka naam nahi rahega.
        </p>

        {blockers.length > 0 ? (
          <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
            <p className="text-sm font-semibold text-warn-700">Abhi band nahi kiya ja sakta</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-warn-700/90">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
            Account band karein
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Account band karein"
        description="Yeh wapis nahi ho sakta. Tasdeeq ke liye apna password likhein."
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
            label="Wajah (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 500))}
            rows={2}
            hint="Isse hum behtar ho sakte hain. Likhna zaroori nahi."
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Rehne dein
            </Button>
            <Button type="submit" variant="danger" loading={loading} disabled={!password}>
              Hamesha ke liye band karein
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
