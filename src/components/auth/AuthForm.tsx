'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Checkbox, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

interface AuthResult {
  user: { id: string; fullName: string; role: string };
  redirectTo: string;
}

/** Field-level errors from the server, keyed by the schema path. */
type Errors = Record<string, string>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = searchParams.get('next');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    try {
      const result = await api.post<AuthResult>('/api/auth/login', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      toast({ tone: 'success', title: `Khush aamdeed, ${result.user.fullName.split(' ')[0]}!` });
      // Full navigation so every server component re-renders signed in.
      window.location.href = next ?? result.redirectTo;
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldMap);
        setFormError(error.message);
      } else {
        setFormError('Kuch ghalat ho gaya. Dobara koshish karein.');
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormError message={formError} /> : null}

      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={errors.email}
        placeholder="aap@example.com"
      />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password}
      />

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Login
      </Button>

      <p className="text-center text-sm text-ink-600">
        Account nahi hai?{' '}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
          className="font-medium text-brand-700 hover:underline"
        >
          Register karein
        </Link>
      </p>
      <button
        type="button"
        onClick={() => router.push('/contact')}
        className="w-full text-center text-sm text-ink-500 hover:text-ink-800 hover:underline"
      >
        Password bhool gaye? Support se rabta karein
      </button>
    </form>
  );
}

export function RegisterForm() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const roleParam = searchParams.get('role');
  const [role, setRole] = useState<'CUSTOMER' | 'PROVIDER'>(
    roleParam === 'provider' ? 'PROVIDER' : 'CUSTOMER',
  );
  const next = searchParams.get('next');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();

    try {
      const result = await api.post<AuthResult>('/api/auth/register', {
        fullName: String(form.get('fullName') ?? ''),
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        ...(phone ? { phone } : {}),
        role,
        acceptedTerms: form.get('acceptedTerms') === 'on',
      });
      toast({
        tone: 'success',
        title: 'Account ban gaya',
        description:
          role === 'PROVIDER'
            ? 'Ab apni profile mukammal karein taake team review kar sake.'
            : 'Ab aap booking kar sakte hain.',
      });
      window.location.href = next ?? result.redirectTo;
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldMap);
        setFormError(error.message);
      } else {
        setFormError('Kuch ghalat ho gaya. Dobara koshish karein.');
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormError message={formError} /> : null}

      {/* Role is chosen here but clamped server-side: a client cannot ask for staff. */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-800">Aap kaun hain?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'CUSTOMER', label: 'Customer', hint: 'Service chahiye' },
              { value: 'PROVIDER', label: 'Provider', hint: 'Service deta hoon' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              aria-pressed={role === option.value}
              className={
                role === option.value
                  ? 'rounded-xl border border-brand-600 bg-brand-50/60 p-3 text-left ring-1 ring-brand-600'
                  : 'rounded-xl border border-ink-200 p-3 text-left hover:border-ink-300 hover:bg-ink-50'
              }
            >
              <span className="block text-sm font-semibold text-ink-900">{option.label}</span>
              <span className="block text-xs text-ink-500">{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <TextInput
        label="Poora naam"
        name="fullName"
        autoComplete="name"
        required
        error={errors.fullName}
        placeholder="Ayesha Khan"
      />
      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={errors.email}
        placeholder="aap@example.com"
      />
      <TextInput
        label="Phone number"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        error={errors.phone}
        placeholder="0300 1234567"
        hint={
          role === 'PROVIDER'
            ? 'Zaroori hai — customers isi par rabta karte hain.'
            : 'Technician isi par rabta karega.'
        }
        required={role === 'PROVIDER'}
      />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.password}
        hint="Kam az kam 10 characters, choti aur bari letters ya numbers ke saath."
      />

      <Checkbox
        name="acceptedTerms"
        required
        error={errors.acceptedTerms}
        label={
          <>
            Main{' '}
            <Link href="/terms" target="_blank" className="font-medium text-brand-700 hover:underline">
              Terms
            </Link>{' '}
            aur{' '}
            <Link href="/privacy" target="_blank" className="font-medium text-brand-700 hover:underline">
              Privacy Policy
            </Link>{' '}
            se ittefaq karta/karti hoon.
          </>
        }
      />

      <Button type="submit" fullWidth size="lg" loading={loading}>
        {role === 'PROVIDER' ? 'Provider account banayein' : 'Account banayein'}
      </Button>

      <p className="text-center text-sm text-ink-600">
        Pehle se account hai?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-medium text-brand-700 hover:underline"
        >
          Login karein
        </Link>
      </p>
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
      <p className="text-sm font-medium text-alert-700">{message}</p>
    </div>
  );
}
