import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/PasswordResetForms';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Naya password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Naya password set karein</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Ek mazboot password chunein jo aap kahin aur istemal nahi karte.
      </p>
      <div className="mt-7">
        <Suspense fallback={<Skeleton className="h-56 rounded-xl" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
