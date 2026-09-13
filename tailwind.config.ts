import type { Config } from 'tailwindcss';

/**
 * Islamabad Fix design system.
 *
 * Body text is served from a tuned system-font stack: on the mobile networks
 * this product targets, zero font bytes and no FOIT beat a marginally more
 * distinctive face for the paragraphs people actually read.
 *
 * Headings are the one exception. A single variable display face (loaded and
 * self-hosted by next/font, latin subset, with a metric-matched fallback so
 * nothing shifts) is what separates a product that looks built from one that
 * looks assembled — and it only ever paints on a handful of lines per page.
 */
/** Tailwind steps for one palette, each pointing at its CSS variable. */
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function ramp(name: string): Record<string, string> {
  return Object.fromEntries(
    STEPS.map((step) => [String(step), `rgb(var(--c-${name}-${step}) / <alpha-value>)`]),
  );
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // Class strategy: the theme is chosen explicitly and stored, so a media
  // query alone would fight the user's own choice.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /*
         * Every palette resolves through a CSS variable so the dark theme can
         * restate it without touching a single component class. The variables
         * hold space-separated RGB channels, which is what lets Tailwind's
         * `<alpha-value>` keep working — `bg-surface/70` still means something.
         */
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          raised: 'rgb(var(--c-surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--c-surface-sunken) / <alpha-value>)',
        },
        /*
         * Two tokens for the "inverted" pattern, because it means two things.
         *
         * `contrast` is a small element deliberately opposite to the page — a
         * dark chip on white. On a dark page the honest equivalent is a light
         * chip, so it flips.
         *
         * `panel` is a large marketing block that is dark by design. It stays
         * dark in both themes and merely lifts off the background; flipping it
         * would put a white slab in the middle of a dark page.
         */
        contrast: {
          DEFAULT: 'rgb(var(--c-contrast) / <alpha-value>)',
          hover: 'rgb(var(--c-contrast-hover) / <alpha-value>)',
          active: 'rgb(var(--c-contrast-active) / <alpha-value>)',
          fg: 'rgb(var(--c-contrast-fg) / <alpha-value>)',
        },
        panel: {
          DEFAULT: 'rgb(var(--c-panel) / <alpha-value>)',
          fg: 'rgb(var(--c-panel-fg) / <alpha-value>)',
          muted: 'rgb(var(--c-panel-muted) / <alpha-value>)',
        },
        scrim: 'rgb(var(--c-scrim) / <alpha-value>)',
        brand: ramp('brand'),
        ink: ramp('ink'),
        alert: ramp('alert'),
        warn: ramp('warn'),
        info: ramp('info'),
        chart: {
          1: 'rgb(var(--c-chart-1) / <alpha-value>)',
          2: 'rgb(var(--c-chart-2) / <alpha-value>)',
          3: 'rgb(var(--c-chart-3) / <alpha-value>)',
        },
      },
      fontFamily: {
        /*
         * `--font-display` is set by next/font in the root layout and always
         * falls through to the body stack, so a blocked font request costs
         * nothing but a slightly plainer heading.
         */
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Noto Sans',
          'Arial',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        /*
         * Display steps carry their own tracking: type set at 4rem needs the
         * letters pulled in, type at 0.75rem needs them pushed apart, and a
         * scale that ignores that reads as "default" no matter the face.
         */
        'display-xl': ['4rem', { lineHeight: '1.02', letterSpacing: '-0.04em', fontWeight: '760' }],
        'display-lg': [
          '3.25rem',
          { lineHeight: '1.05', letterSpacing: '-0.033em', fontWeight: '740' },
        ],
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.028em', fontWeight: '730' }],
        'display-sm': [
          '1.875rem',
          { lineHeight: '1.15', letterSpacing: '-0.022em', fontWeight: '720' },
        ],
        title: ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.014em', fontWeight: '650' }],
        eyebrow: ['0.75rem', { lineHeight: '1', letterSpacing: '0.08em', fontWeight: '650' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        /*
         * Elevation resolves through variables for the same reason colour does.
         * A drop shadow is nearly invisible on a dark ground, so the dark theme
         * restates each step as a deeper shadow plus a hairline top highlight —
         * the way light actually falls on a raised surface in a dark room.
         */
        card: 'var(--shadow-e1)',
        lift: 'var(--shadow-e2)',
        pop: 'var(--shadow-e3)',
        e1: 'var(--shadow-e1)',
        e2: 'var(--shadow-e2)',
        e3: 'var(--shadow-e3)',
        e4: 'var(--shadow-e4)',
        glow: 'var(--shadow-glow)',
        inset: 'var(--shadow-inset)',
      },
      maxWidth: { content: '75rem' },
      transitionTimingFunction: {
        // A short overshoot. Used for things that appear, never for colour.
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        /* A slow drift for the hero's background washes. */
        drift: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(2%, -3%, 0) scale(1.06)' },
        },
        /* A gentle bob, for the decorative hero tiles. */
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        /* One expanding ring under a live status dot. */
        ping: {
          '75%, 100%': { transform: 'scale(2.2)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        drift: 'drift 22s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'drift-slow': 'drift 34s ease-in-out infinite reverse',
      },
    },
  },
  plugins: [],
};

export default config;
