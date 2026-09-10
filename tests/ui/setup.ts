import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Component-test environment.
 *
 * jsdom implements neither of the browser APIs these components rely on for
 * layout-adjacent behaviour, so both are stubbed here rather than in each test.
 * `fetch` is deliberately left alone: a test that needs the network stubs it
 * explicitly, and one that does not should fail loudly rather than silently
 * reach for a server that is not there.
 */
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!('scrollTo' in window)) {
  Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });
}
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
