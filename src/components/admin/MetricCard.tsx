/**
 * Metric tile.
 *
 * A value of "—" is used deliberately where a metric cannot be computed yet, so
 * an empty platform does not display zeros that look like measurements.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-4">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd
        className={
          tone === 'positive'
            ? 'mt-1.5 text-xl font-bold tracking-tight text-brand-700'
            : tone === 'negative'
              ? 'mt-1.5 text-xl font-bold tracking-tight text-alert-600'
              : 'mt-1.5 text-xl font-bold tracking-tight text-ink-950'
        }
      >
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
