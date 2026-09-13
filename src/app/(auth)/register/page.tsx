import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/rbac';
import { RegisterForm } from '@/components/auth/AuthForm';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create an Islamabad Fix account — as a customer or as a service provider.',
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect(homeForRole(ctx.role));

  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Create account</h1>
      <p className="mt-2 text-sm text-ink-600">
        It takes two minutes. Bookings, quotes and guarantee all in one place.
      </p>
      <div className="mt-7">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
