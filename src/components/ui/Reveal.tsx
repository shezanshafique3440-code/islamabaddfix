'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The distinction matters here: the hidden state has to be applied before the
 * browser paints, or the section flashes in and then disappears. React warns
 * about `useLayoutEffect` during SSR, so it is swapped out there.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Reveals its children as they scroll into view.
 *
 * Two rules this follows that most scroll-reveal code does not:
 *
 * The markup ships visible. The hidden state is added by script, before the
 * first paint, so a reader whose JavaScript failed — a slow 3G connection
 * dropping one chunk is not hypothetical here — gets the whole page rather than
 * a column of blank space. Search engines and screen readers see the content
 * either way.
 *
 * It only ever moves fourteen pixels, once. Content that slides a long way, or
 * re-hides when it scrolls back up, turns reading into a slideshow; the
 * observer unsubscribes after the first crossing.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Component = 'div',
}: {
  children: React.ReactNode;
  /** Milliseconds, for staggering siblings. Keep the whole stagger under ~250ms. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;

    node.classList.add('reveal-init');
    node.style.setProperty('--reveal-delay', `${delay}ms`);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('reveal-in');
          observer.unobserve(entry.target);
        }
      },
      // A little before the edge, so a section is already settled when it
      // arrives rather than animating in the reader's peripheral vision.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Component ref={ref as never} className={className}>
      {children}
    </Component>
  );
}

/**
 * A number that counts up to its real value the first time it is seen.
 *
 * `value` is the figure that is rendered on the server and the figure the
 * animation lands on — nothing here invents or rounds it. The count is decor on
 * top of a true number, which is the only version of this worth shipping.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;

    let frame = 0;
    const DURATION = 900;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        const started = performance.now();
        const step = (now: number) => {
          const progress = Math.min(1, (now - started) / DURATION);
          // Ease out, so it decelerates onto the true figure.
          const eased = 1 - Math.pow(1 - progress, 3);
          node.textContent = (value * eased).toFixed(decimals) + suffix;
          if (progress < 1) frame = requestAnimationFrame(step);
          else node.textContent = value.toFixed(decimals) + suffix;
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, decimals, suffix]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
