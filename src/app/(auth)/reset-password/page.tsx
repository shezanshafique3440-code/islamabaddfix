import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/PasswordResetForms';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'New password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Set a new password</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Choose a strong password you do not use anywhere else.
      </p>
      <div className="mt-7">
        <Suspense fallback={<Skeleton className="h-56 rounded-xl" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
