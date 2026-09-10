import { Logo } from '@/components/layout/Logo';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link href="/" className="text-sm text-ink-600 hover:text-brand-700 hover:underline">
            Home
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
