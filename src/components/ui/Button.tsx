import { forwardRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white dark:text-brand-50 hover:bg-brand-800 active:bg-brand-900 shadow-sm',
  secondary:
    'bg-contrast text-contrast-fg hover:bg-contrast-hover active:bg-contrast-active shadow-sm',
  outline: 'border border-ink-300 bg-surface text-ink-900 hover:bg-ink-50 active:bg-ink-100',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger:
    // Red is the one hue where neither a light nor a dark foreground clears AA
    // against a mid tone. So on a dark ground the button takes a genuinely dark
    // red — a low step, because the ramp inverts — and keeps its white text.
    // A bright red with dark text passes too, but reads as a warning chip
    // rather than something you are about to do.
    'bg-alert-600 text-white hover:bg-alert-700 active:bg-alert-700 shadow-sm dark:bg-alert-300 dark:hover:bg-alert-400',
  success:
    'bg-brand-600 text-white dark:text-brand-50 hover:bg-brand-700 active:bg-brand-800 shadow-sm',
};

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on the two sizes used on mobile.
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[0.9375rem] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
};

const BASE =
  'inline-flex items-center justify-center font-semibold ' +
  'transition-[background-color,border-color,color,transform] duration-150 ' +
  // A 2% dip under the finger. Small enough to read as physical rather than
  // bouncy, and switched off entirely under prefers-reduced-motion.
  'press active:scale-[0.98] ' +
  'disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button stays focusable but rejects clicks, and announces itself.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

type ButtonLinkProps = CommonProps &
  Omit<React.ComponentProps<typeof Link>, 'className' | 'children'>;

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
