'use client';

/**
 * Prints the page it sits on.
 *
 * A client component for one call to `window.print()` is a small cost, and the
 * alternative — a server-rendered anchor with a data attribute and a global
 * listener — is the kind of cleverness that stops working silently.
 */
export function PrintButton({ label = 'Print / PDF save karein' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center rounded-xl border border-ink-300 px-3.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
    >
      {label}
    </button>
  );
}
