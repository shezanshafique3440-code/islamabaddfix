'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Toast notifications.
 *
 * Deliberately tiny — no dependency for something this small. Toasts are
 * announced through an aria-live region so a screen reader hears the outcome of
 * an action rather than only seeing it flash by.
 */

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: { tone?: ToastTone; title: string; description?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue['toast']>(
    ({ tone = 'info', title, description }) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, tone, title, description }]);
      // Errors stay a little longer: they usually need reading, not glancing at.
      setTimeout(() => dismiss(id), tone === 'error' ? DURATION_MS * 1.6 : DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
      >
        {toasts.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-e3 backdrop-blur-sm',
              entry.tone === 'success' && 'border-brand-200 bg-surface',
              entry.tone === 'error' && 'border-alert-200 bg-surface',
              entry.tone === 'info' && 'border-ink-200 bg-surface',
            )}
          >
            <ToastIcon tone={entry.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">{entry.title}</p>
              {entry.description ? (
                <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{entry.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(entry.id)}
              className="-mr-1 -mt-0.5 rounded-lg p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Close"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7 6.3 5z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const shared = 'mt-0.5 h-5 w-5 shrink-0';
  if (tone === 'success') {
    return (
      <svg
        viewBox="0 0 20 20"
        className={cn(shared, 'text-brand-600')}
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3-1.4-1.4L9 10.6 7.7 9.3l-1.4 1.4 2.7 2.7 4.7-4.7Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (tone === 'error') {
    return (
      <svg
        viewBox="0 0 20 20"
        className={cn(shared, 'text-alert-600')}
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-12H9v6h2V6Zm0 7H9v2h2v-2Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn(shared, 'text-info-600')}
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-12H9v2h2V6Zm0 3H9v5h2V9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
