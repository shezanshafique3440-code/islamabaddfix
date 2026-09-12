import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmailView } from '@/components/auth/VerifyEmailView';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Email verification',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <div>
      <h1 className="text-display-sm text-ink-950">Email verify kar rahe hain</h1>
      <div className="mt-7">
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <VerifyEmailView />
        </Suspense>
      </div>
    </div>
  );
}
