'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'isbfix.theme';

/**
 * The script that runs before the first paint.
 *
 * Inlined into <head> so the stored choice is applied before anything renders.
 * Without it every dark-mode user gets a white flash on every navigation — the
 * one bug that makes a dark theme feel bolted on.
 *
 * Deliberately tiny and dependency-free: it runs blocking, ahead of React.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* Private mode, blocked storage: fall through to the light default. */
  }
})();
`.trim();

let switchTimer: ReturnType<typeof setTimeout> | null = null;

function apply(theme: Theme): void {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Cross-fade the palette, but only for the moment the switch takes. A
  // permanent colour transition makes every hover feel laggy.
  root.classList.add('theme-switching');
  if (switchTimer) clearTimeout(switchTimer);
  switchTimer = setTimeout(() => root.classList.remove('theme-switching'), 220);

  root.classList.toggle('dark', dark);
}

const LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const ORDER: Theme[] = ['light', 'dark', 'system'];

/**
 * Light / dark / system, cycled by one button.
 *
 * Three states rather than two, because "follow my phone" is what most people
 * actually want and a two-way switch quietly overrides it forever the first
 * time it is touched.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (stored && ORDER.includes(stored)) setTheme(stored);
    } catch {
      /* Storage blocked; the default stands. */
    }
  }, []);

  // Following the system means following it as it changes, not once at load.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* The theme still applies for this page; it just will not be remembered. */
    }
  };

  // Before mount the stored choice is unknown, so render a stable placeholder
  // rather than a label that would visibly correct itself a moment later.
  const label = mounted ? LABELS[theme] : 'Theme';

  return (
    <button
      type="button"
      onClick={() => choose(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!)}
      className={
        className ??
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900'
      }
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
    >
      <Icon theme={mounted ? theme : 'system'} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Icon({ theme }: { theme: Theme }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M17 12.4A7.5 7.5 0 0 1 7.6 3a7.5 7.5 0 1 0 9.4 9.4Z" />
      </svg>
    );
  }
  if (theme === 'light') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M10 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-11a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 12a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM3 10a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm12 0a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM5.1 5.1a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 0-1.4Zm7.7 7.7a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 0-1.4Zm2.1-7.7a1 1 0 0 1 0 1.4l-.7.7a1 1 0 1 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0ZM7.2 12.8a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11v1.5h1.75a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5H9V15H5.5A2.5 2.5 0 0 1 3 12.5v-7Zm2.5-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-9Z" />
    </svg>
  );
}
