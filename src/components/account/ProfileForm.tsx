'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TextInput } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

export function ProfileForm({
  initial,
  emailVerified,
  phoneVerified,
}: {
  initial: { fullName: string; phone: string; email: string };
  emailVerified: boolean;
  phoneVerified: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: initial.fullName, phone: initial.phone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const dirty = form.fullName !== initial.fullName || form.phone !== initial.phone;

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setErrors({});
          try {
            await api.patch('/api/auth/me', {
              fullName: form.fullName,
              ...(form.phone ? { phone: form.phone } : {}),
            });
            toast({ tone: 'success', title: 'Profile updated' });
            router.refresh();
          } catch (error) {
            if (error instanceof ApiError) {
              setErrors(error.fieldMap);
              toast({ tone: 'error', title: error.message });
            }
          } finally {
            setLoading(false);
          }
        }}
      >
        <TextInput
          label="Full name"
          value={form.fullName}
          onChange={(event) => setForm((f) => ({ ...f, fullName: event.target.value }))}
          error={errors.fullName}
          required
        />

        <div>
          <TextInput
            label="Phone number"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
            error={errors.phone}
            hint={
              form.phone !== initial.phone
                ? 'Changing the number means verifying it again.'
                : undefined
            }
          />
          {phoneVerified && form.phone === initial.phone ? (
            <Badge tone="success" className="mt-1.5">
              ✓ Verified
            </Badge>
          ) : null}
        </div>

        <div>
          <TextInput label="Email" value={initial.email} disabled readOnly />
          <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
            {emailVerified ? (
              <Badge tone="success">✓ Verified</Badge>
            ) : (
              <Badge tone="warn">Not verified</Badge>
            )}
            Contact support to change your email.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" loading={loading} disabled={!dirty}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </div>
      </form>

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change password"
      description="For security, changing your password means signing in again."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            disabled={current.length === 0 || next.length < 10}
            onClick={async () => {
              setLoading(true);
              setErrors({});
              try {
                await api.post('/api/auth/password', {
                  currentPassword: current,
                  newPassword: next,
                });
                toast({
                  tone: 'success',
                  title: 'Password changed',
                  description: 'Please sign in again.',
                });
                // Every session was revoked, including this one.
                window.location.href = '/login';
              } catch (error) {
                if (error instanceof ApiError) {
                  setErrors(error.fieldMap);
                  toast({ tone: 'error', title: error.message });
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            Change password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={errors.currentPassword}
          required
        />
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          error={errors.newPassword}
          hint="Kam az kam 10 characters."
          required
        />
      </div>
    </Dialog>
  );
}
