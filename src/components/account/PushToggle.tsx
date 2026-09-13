'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';

/**
 * Turning push notifications on for *this browser*.
 *
 * Separate from the "Push" preference above it, because they are genuinely two
 * different things: the preference says whether this account wants push at all,
 * this says whether the browser in front of you is registered to receive it.
 * Someone can want push and still not have granted permission on their laptop.
 *
 * Every state it can be in is shown plainly — unsupported browser, server with
 * no keys, permission refused, permission granted but not subscribed. A control
 * that silently does nothing on an iPhone Safari tab is exactly the kind of
 * fake button this product refuses to ship.
 */

type State =
  'checking' | 'unsupported' | 'not_configured' | 'denied' | 'subscribed' | 'unsubscribed';

/** The applicationServerKey has to be raw bytes, not the base64url we serve. */
function decodeKey(base64url: string): Uint8Array {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function PushToggle() {
  const { toast } = useToast();
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supported()) {
      setState('unsupported');
      return;
    }

    try {
      const key = await api.get<{ configured: boolean; publicKey: string | null }>('/api/push/key');
      if (!key.configured || !key.publicKey) {
        setState('not_configured');
        return;
      }
      setPublicKey(key.publicKey);
    } catch {
      setState('not_configured');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const existing = await registration?.pushManager.getSubscription();
    setState(existing ? 'subscribed' : 'unsubscribed');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'unsubscribed');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Non-negotiable for Chrome: every message must be user-visible.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey!) as BufferSource,
      });

      const json = subscription.toJSON();
      await api.post('/api/push/subscribe', {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });

      setState('subscribed');
      toast({ tone: 'success', title: 'Notifications are on for this device' });
    } catch (caught) {
      toast({
        tone: 'error',
        title: 'Could not turn notifications on',
        description: caught instanceof ApiError ? caught.message : undefined,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        // Tell the server first: if unsubscribing locally succeeded and the
        // call failed, the row would be left sending into a dead endpoint.
        await api.delete('/api/push/subscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }

      setState('unsubscribed');
      toast({ tone: 'info', title: 'Notifications are off for this device' });
    } catch (caught) {
      toast({
        tone: 'error',
        title: 'Could not turn notifications off',
        description: caught instanceof ApiError ? caught.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-surface-sunken px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
            This device
            {state === 'subscribed' ? (
              <Badge tone="success">On</Badge>
            ) : state === 'checking' ? null : (
              <Badge tone="neutral">Off</Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{EXPLANATION[state]}</p>
        </div>

        {state === 'unsubscribed' ? (
          <Button size="sm" loading={busy} onClick={() => void enable()}>
            Turn on
          </Button>
        ) : state === 'subscribed' ? (
          <Button size="sm" variant="outline" loading={busy} onClick={() => void disable()}>
            Turn off
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const EXPLANATION: Record<State, string> = {
  checking: 'Checking this browser…',
  unsupported:
    'This browser cannot receive push notifications. On an iPhone, add the site to your home screen first — Safari only allows them there.',
  not_configured:
    'Push notifications are not set up on this deployment yet, so there is nothing to turn on. Everything still reaches you inside the app.',
  denied:
    'This browser is blocking notifications from us. You can allow them again in the site settings next to the address bar.',
  subscribed: 'Booking updates will reach this browser even when the site is closed.',
  unsubscribed:
    'Get booking updates on this browser even when the site is closed. Your browser will ask for permission.',
};
