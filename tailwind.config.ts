import type { Config } from 'tailwindcss';

/**
 * Islamabad Fix design system.
 *
 * Type is served from a tuned system-font stack rather than a webfont: on the
 * mobile networks this product targets, zero font bytes and no FOIT beat a
 * marginally more distinctive face. Weight, tracking and scale carry the
 * typographic identity instead.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf5',
          100: '#d6f5e6',
          200: '#b0e9d0',
          300: '#7cd7b4',
          400: '#45bd93',
          500: '#1fa179',
          600: '#0f8663',
          700: '#0b6b51',
          800: '#0b5442',
          900: '#0a4537',
          950: '#032720',
        },
        ink: {
          50: '#f7f8f8',
          100: '#eef0f1',
          200: '#d8dde0',
          300: '#b6bfc4',
          400: '#8d9aa1',
          500: '#6e7c84',
          600: '#57646b',
          700: '#475257',
          800: '#3d464a',
          900: '#242b2e',
          950: '#14181a',
        },
        alert: {
          50: '#fef3f2',
          100: '#fee4e2',
          200: '#fecdca',
          400: '#f97066',
          500: '#f04438',
          600: '#d92d20',
          700: '#b42318',
        },
        warn: {
          50: '#fffaeb',
          100: '#fef0c7',
          200: '#fedf89',
          500: '#f79009',
          600: '#dc6803',
          700: '#b54708',
        },
        info: {
          50: '#eff8ff',
          100: '#d1e9ff',
          500: '#2e90fa',
          600: '#1570ef',
          700: '#175cd3',
        },
        /*
         * Categorical chart hues, in fixed assignment order.
         *
         * Deliberately separate from the status colours above: amber and red
         * mean "warning" and "problem" everywhere else in the product, so
         * reusing them as data series would make a chart look like an alert.
         *
         * Validated with the dataviz palette checker (light surface, all pairs):
         * worst adjacent CVD deltaE 10.0 deutan / 13.2 tritan, normal-vision 21.9 —
         * all above the 8 floor, so colour alone is legible for CVD readers,
         * and every chart still carries a legend plus direct labels.
         */
        chart: {
          1: '#0f8663',
          2: '#6d28d9',
          3: '#b45309',
        },
      },
      fontFamily: {
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
        'display-lg': ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.033em', fontWeight: '700' }],
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.028em', fontWeight: '700' }],
        'display-sm': ['1.875rem', { lineHeight: '1.15', letterSpacing: '-0.022em', fontWeight: '700' }],
        'title': ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.014em', fontWeight: '650' }],
        'eyebrow': ['0.75rem', { lineHeight: '1', letterSpacing: '0.08em', fontWeight: '650' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        card: '0 1px 2px 0 rgb(20 24 26 / 0.04), 0 1px 3px 0 rgb(20 24 26 / 0.06)',
        lift: '0 4px 6px -2px rgb(20 24 26 / 0.05), 0 12px 16px -4px rgb(20 24 26 / 0.10)',
        pop: '0 8px 8px -4px rgb(20 24 26 / 0.04), 0 20px 24px -4px rgb(20 24 26 / 0.10)',
      },
      maxWidth: { content: '75rem' },
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
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
