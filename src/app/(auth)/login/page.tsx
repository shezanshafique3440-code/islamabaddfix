import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/rbac';
import { LoginForm } from '@/components/auth/AuthForm';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Sign in to your Islamabad Fix account.',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // Already signed in: send them where they were going.
  const ctx = await getAuthContext();
  if (ctx) redirect(homeForRole(ctx.role));

  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Welcome back</h1>
      <p className="mt-2 text-sm text-ink-600">
        Sign in to see your bookings, quotes and payments.
      </p>
      <div className="mt-7">
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
