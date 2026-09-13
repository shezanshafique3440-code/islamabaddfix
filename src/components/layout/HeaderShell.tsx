'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The chrome around the site header.
 *
 * At the very top of a page the header is transparent, so the hero's washes run
 * behind it unbroken. As soon as the page moves it takes a surface, a border and
 * a shadow — that transition is what tells the reader the bar is pinned rather
 * than part of the hero.
 *
 * A client component purely for the scroll listener; the header's contents stay
 * on the server so the signed-in state is still correct on first paint.
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Passive, and reads a value the browser already has — no layout thrash.
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300',
        scrolled
          ? 'border-ink-200 bg-surface/85 shadow-e1 backdrop-blur-xl'
          : 'border-transparent bg-surface/60 backdrop-blur-sm',
      )}
    >
      {children}
    </header>
  );
}
