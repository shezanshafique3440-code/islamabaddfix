import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/rbac';
import { LoginForm } from '@/components/auth/AuthForm';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Islamabad Fix account mein login karein.',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // Already signed in: send them where they were going.
  const ctx = await getAuthContext();
  if (ctx) redirect(homeForRole(ctx.role));

  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Wapis khush aamdeed</h1>
      <p className="mt-2 text-sm text-ink-600">
        Apni bookings, quotes aur payments dekhne ke liye login karein.
      </p>
      <div className="mt-7">
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
