'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Checkbox, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

interface AuthResult {
  user: { id: string; fullName: string; role: string };
  redirectTo: string;
}

/** A correct password on an account with a second factor buys only this. */
interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

type LoginResponse = AuthResult | TwoFactorChallenge;

const needsSecondFactor = (result: LoginResponse): result is TwoFactorChallenge =>
  'twoFactorRequired' in result;

/** Field-level errors from the server, keyed by the schema path. */
type Errors = Record<string, string>;

export function LoginForm() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const next = searchParams.get('next');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    try {
      const result = await api.post<LoginResponse>('/api/auth/login', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });

      if (needsSecondFactor(result)) {
        setChallenge(result.challengeToken);
        setLoading(false);
        return;
      }

      toast({ tone: 'success', title: `Khush aamdeed, ${result.user.fullName.split(' ')[0]}!` });
      // Full navigation so every server component re-renders signed in.
      window.location.href = next ?? result.redirectTo;
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldMap);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setLoading(false);
    }
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const result = await api.post<AuthResult>('/api/auth/two-factor', {
        challengeToken: challenge,
        code,
      });
      toast({ tone: 'success', title: `Khush aamdeed, ${result.user.fullName.split(' ')[0]}!` });
      window.location.href = next ?? result.redirectTo;
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'We could not check the code.');
      setLoading(false);
    }
  }

  if (challenge) {
    return (
      <form onSubmit={submitCode} className="space-y-4" noValidate>
        {formError ? <FormError message={formError} /> : null}

        <p className="text-sm leading-relaxed text-ink-600">
          Open your authenticator app and enter the 6-digit code. If you have lost your phone,
          recovery code bhi chalega.
        </p>

        <TextInput
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 20))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
        />

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={code.length < 6}>
          Finish signing in
        </Button>

        <button
          type="button"
          onClick={() => {
            setChallenge(null);
            setCode('');
            setFormError(null);
          }}
          className="w-full text-center text-sm text-ink-500 hover:text-ink-800 hover:underline"
        >
          Go back
        </button>
      </form>
    );
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
        placeholder="you@example.com"
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
        No account?{' '}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
          className="font-medium text-brand-700 hover:underline"
        >
          Register
        </Link>
      </p>
      <Link
        href="/forgot-password"
        className="block w-full text-center text-sm text-ink-500 hover:text-ink-800 hover:underline"
      >
        Forgot your password?
      </Link>
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
        title: 'Account created',
        description:
          role === 'PROVIDER'
            ? 'Now complete your profile so the team can review it.'
            : 'You can book now.',
      });
      window.location.href = next ?? result.redirectTo;
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldMap);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <FormError message={formError} /> : null}

      {/* Role is chosen here but clamped server-side: a client cannot ask for staff. */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-800">Who are you?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'CUSTOMER', label: 'Customer', hint: 'I need a service' },
              { value: 'PROVIDER', label: 'Provider', hint: 'I provide a service' },
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
        label="Full name"
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
        placeholder="you@example.com"
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
            ? 'Required — this is how customers reach you.'
            : 'The technician will contact you on this.'
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
        hint="At least 10 characters, with upper and lower case letters or numbers."
      />

      <Checkbox
        name="acceptedTerms"
        required
        error={errors.acceptedTerms}
        label={
          <>
            Main{' '}
            <Link
              href="/terms"
              target="_blank"
              className="font-medium text-brand-700 hover:underline"
            >
              Terms
            </Link>{' '}
            aur{' '}
            <Link
              href="/privacy"
              target="_blank"
              className="font-medium text-brand-700 hover:underline"
            >
              Privacy Policy
            </Link>{' '}
            .
          </>
        }
      />

      <Button type="submit" fullWidth size="lg" loading={loading}>
        {role === 'PROVIDER' ? 'Create a provider account' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-medium text-brand-700 hover:underline"
        >
          Sign in
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
