import { ServiceIcon } from '@/components/ui/ServiceIcon';
import { cn } from '@/lib/utils';

/**
 * The hero's right-hand composition.
 *
 * Purely decorative, and deliberately so: it is the brand mark with the live
 * service categories orbiting it, not a mock-up of a screen. A fake dashboard
 * or a fake "technician on the way" card would fill the same space and imply
 * functionality that the reader has not got yet — this cannot be misread,
 * because there is nothing in it to read.
 *
 * Hidden below `lg`, where the space does not exist and the bytes would be
 * spent on a phone that needs them for the search field.
 */
export function HeroArt({ iconKeys, className }: { iconKeys: string[]; className?: string }) {
  // Five satellites, evenly spaced, starting at the top.
  const satellites = iconKeys.slice(0, 5);
  const radius = 38;

  return (
    <div aria-hidden="true" className={cn('relative aspect-square w-full', className)}>
      {/* Glow behind the whole composition. */}
      <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgb(var(--c-brand-400)/0.22)_0%,transparent_70%)] blur-xl" />

      {/* Two orbit rings. */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgb(var(--c-brand-500) / 0.3)"
          strokeWidth="0.3"
          strokeDasharray="1.5 2.5"
        />
        <circle
          cx="50"
          cy="50"
          r={radius - 12}
          fill="none"
          stroke="rgb(var(--c-ink-300) / 0.5)"
          strokeWidth="0.3"
        />
      </svg>

      {/* The mark at the centre. */}
      <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-e3 ring-1 ring-inset ring-white/15 dark:text-brand-50">
        <svg viewBox="0 0 24 24" className="h-14 w-14" fill="currentColor">
          <path d="M12 1.8 4.4 4.7v6.6c0 4.6 3.1 8.4 7.6 9.5 4.5-1.1 7.6-4.9 7.6-9.5V4.7L12 1.8Zm4.1 5.4a3.4 3.4 0 0 1-4.4 4.4l-2.9 2.9a1.2 1.2 0 0 1-1.7-1.7l2.9-2.9a3.4 3.4 0 0 1 4.4-4.4l-1.9 1.9 1.7 1.7 1.9-1.9Z" />
        </svg>
      </div>

      {/* The categories, one tile each, bobbing out of phase. */}
      {satellites.map((iconKey, index) => {
        const angle = (index / satellites.length) * 2 * Math.PI - Math.PI / 2;
        const left = 50 + radius * Math.cos(angle);
        const top = 50 + radius * Math.sin(angle);
        return (
          <div
            key={`${iconKey}-${index}`}
            className="absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-float items-center justify-center rounded-2xl border border-ink-200 bg-surface text-brand-700 shadow-e2"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${index * 0.7}s`,
            }}
          >
            <ServiceIcon iconKey={iconKey} className="h-7 w-7" />
          </div>
        );
      })}
    </div>
  );
}
