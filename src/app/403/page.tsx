import type { Metadata } from 'next';
import { Logo } from '@/components/layout/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { getAuthContext } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Ijazat nahi',
  robots: { index: false, follow: false },
};

/**
 * Shown when a signed-in user reaches a page their role does not cover.
 * `requirePageRole` redirects here rather than throwing, so the person gets a
 * route they can act on instead of a generic error screen.
 */
export default async function ForbiddenPage() {
  const ctx = await getAuthContext();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex h-16 max-w-content items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="text-eyebrow uppercase text-alert-600">403</p>
          <h1 className="mt-2 text-display-sm text-ink-950">Is section ki ijazat nahi</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            {ctx
              ? 'Aapke account ke paas is page ka access nahi hai. Agar yeh ghalti lagti hai to support se rabta karein.'
              : 'Yeh page dekhne ke liye login zaroori hai.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {ctx ? (
              <ButtonLink href={homeForRole(ctx.role)}>Mera dashboard</ButtonLink>
            ) : (
              <ButtonLink href="/login">Login karein</ButtonLink>
            )}
            <ButtonLink href="/" variant="outline">
              Home
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
