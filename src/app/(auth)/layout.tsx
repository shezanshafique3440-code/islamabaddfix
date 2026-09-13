import { Logo } from '@/components/layout/Logo';
import Link from 'next/link';

/**
 * Auth shell.
 *
 * Carries the same washes and grain as the marketing hero, so signing in does
 * not feel like leaving the product for a plain form on a white page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="grid-lines absolute inset-0 opacity-50" />
        <div className="absolute -left-[8%] -top-[20%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgb(var(--c-brand-400)/calc(0.2*var(--wash-strength)))_0%,transparent_70%)] blur-2xl" />
        <div className="absolute -right-[10%] bottom-[-15%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgb(var(--c-info-400)/calc(0.12*var(--wash-strength)))_0%,transparent_70%)] blur-2xl" />
        <div className="grain absolute inset-0" />
      </div>

      <header className="border-b border-ink-200/70">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link href="/" className="text-sm text-ink-600 hover:text-brand-700 hover:underline">
            Home
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
