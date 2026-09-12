'use client';

import { useId, useState } from 'react';
import { formatPaisa } from '@/lib/money';

interface Point {
  date: string;
  bookings: number;
  completed: number;
  cancelled: number;
  grossPaisa: number;
  commissionPaisa: number;
}

/**
 * Daily bookings and revenue.
 *
 * Two separate plots rather than one chart with two y-axes: counts run 0-20 and
 * revenue runs into six figures of paisa, and a dual-axis chart invites the
 * reader to compare two scales that have nothing to do with each other.
 *
 * Hand-rolled SVG instead of a charting library — three simple plots do not
 * justify ~100KB of JavaScript on the connections this product targets.
 *
 * Colours come from the validated `chart` ramp in the Tailwind config
 * (all-pairs CVD deltaE >= 10). Identity is never carried by colour alone: a
 * legend is always present, the peak bar is directly labelled, and a table view
 * below carries the same numbers for screen readers and for print.
 */

const CHART_1 = '#0f8663'; // chart.1 — bookings created
const CHART_2 = '#6d28d9'; // chart.2 — completed

export function BookingsChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  if (data.length === 0) {
    return <p className="text-sm text-ink-500">Is arse ka koi data nahi.</p>;
  }

  const maxCount = Math.max(1, ...data.map((point) => Math.max(point.bookings, point.completed)));
  const maxRevenue = Math.max(1, ...data.map((point) => point.grossPaisa));
  const peakIndex = data.reduce(
    (best, point, index) => (point.bookings > (data[best]?.bookings ?? 0) ? index : best),
    0,
  );

  // Geometry. One group per day; two bars per group with a 2px surface gap.
  const groupWidth = 100 / data.length;
  const barWidth = Math.max(2.2, groupWidth * 0.32);
  const gap = 0.6;

  return (
    <div>
      {/* Legend — always present for two series. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendItem color={CHART_1} label="Bookings aayi" />
        <LegendItem color={CHART_2} label="Mukammal hui" />
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="ml-auto text-xs font-medium text-ink-500 underline hover:text-ink-800"
          aria-expanded={showTable}
        >
          {showTable ? 'Table chhupayein' : 'Table dekhein'}
        </button>
      </div>

      {/* ------------------------------------------------------- counts plot */}
      <figure className="mt-4">
        <figcaption id={titleId} className="text-xs font-medium text-ink-500">
          Rozana bookings
        </figcaption>
        <div className="relative mt-2">
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={titleId}
            className="h-36 w-full overflow-visible"
          >
            {/* Recessive gridlines at quarters of the max. */}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <line
                key={fraction}
                x1={0}
                x2={100}
                y1={40 - fraction * 40}
                y2={40 - fraction * 40}
                stroke="#eef0f1"
                strokeWidth={0.25}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {data.map((point, index) => {
              const groupCentre = index * groupWidth + groupWidth / 2;
              const createdHeight = (point.bookings / maxCount) * 38;
              const completedHeight = (point.completed / maxCount) * 38;
              return (
                <g
                  key={point.date}
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${point.date}: ${point.bookings} bookings, ${point.completed} mukammal`}
                >
                  {/* Hit target wider than the marks, so hover is forgiving. */}
                  <rect
                    x={index * groupWidth}
                    y={0}
                    width={groupWidth}
                    height={40}
                    fill={hover === index ? '#f7f8f8' : 'transparent'}
                  />
                  {point.bookings > 0 ? (
                    <rect
                      x={groupCentre - barWidth - gap / 2}
                      y={40 - createdHeight}
                      width={barWidth}
                      height={createdHeight}
                      fill={CHART_1}
                      rx={0.8}
                    />
                  ) : null}
                  {point.completed > 0 ? (
                    <rect
                      x={groupCentre + gap / 2}
                      y={40 - completedHeight}
                      width={barWidth}
                      height={completedHeight}
                      fill={CHART_2}
                      rx={0.8}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>

          {/* Direct label on the peak only — never a number on every bar. */}
          {data[peakIndex] && data[peakIndex]!.bookings > 0 ? (
            <span
              className="pointer-events-none absolute -translate-x-1/2 text-[0.625rem] font-semibold text-ink-700"
              style={{
                left: `${peakIndex * groupWidth + groupWidth / 2}%`,
                top: `${(1 - data[peakIndex]!.bookings / maxCount) * 90 - 6}%`,
              }}
            >
              {data[peakIndex]!.bookings}
            </span>
          ) : null}

          {hover !== null && data[hover] ? (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs shadow-lift"
              style={{
                left: `${Math.min(88, Math.max(12, hover * groupWidth + groupWidth / 2))}%`,
                top: '-0.5rem',
              }}
              role="status"
            >
              <p className="font-semibold text-ink-900">{formatDay(data[hover]!.date)}</p>
              <p className="mt-0.5 text-ink-600">
                {data[hover]!.bookings} aayi · {data[hover]!.completed} mukammal
              </p>
              {data[hover]!.cancelled > 0 ? (
                <p className="text-ink-500">{data[hover]!.cancelled} cancelled</p>
              ) : null}
              <p className="mt-0.5 text-ink-600">{formatPaisa(data[hover]!.grossPaisa)}</p>
            </div>
          ) : null}
        </div>

        {/* Sparse x labels: first, middle, last. */}
        <div className="mt-1.5 flex justify-between text-[0.625rem] text-ink-400">
          <span>{formatDay(data[0]!.date)}</span>
          {data.length > 4 ? (
            <span>{formatDay(data[Math.floor(data.length / 2)]!.date)}</span>
          ) : null}
          <span>{formatDay(data.at(-1)!.date)}</span>
        </div>
      </figure>

      {/* ------------------------------------------------------ revenue plot */}
      <figure className="mt-6">
        <figcaption className="text-xs font-medium text-ink-500">
          Rozana revenue (mukammal bookings)
        </figcaption>
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          role="img"
          aria-label="Rozana revenue"
          className="mt-2 h-20 w-full"
        >
          <path
            d={areaPath(
              data.map((point) => point.grossPaisa),
              maxRevenue,
              100,
              24,
            )}
            fill={CHART_1}
            fillOpacity={0.1}
          />
          <path
            d={linePath(
              data.map((point) => point.grossPaisa),
              maxRevenue,
              100,
              24,
            )}
            fill="none"
            stroke={CHART_1}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-1 flex justify-between text-[0.625rem] text-ink-400">
          <span>Rs. 0</span>
          <span>Peak {formatPaisa(maxRevenue)}</span>
        </div>
      </figure>

      {/* Table view — the same numbers, reachable without colour or hover. */}
      {showTable ? (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">Rozana bookings aur revenue</caption>
            <thead className="bg-ink-50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase text-ink-500">
                  Tareekh
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-500"
                >
                  Aayi
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-500"
                >
                  Mukammal
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-500"
                >
                  Cancelled
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-500"
                >
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {data.map((point) => (
                <tr key={point.date}>
                  <td className="px-3 py-2 text-ink-700">{formatDay(point.date)}</td>
                  <td className="px-3 py-2 text-right text-ink-900">{point.bookings}</td>
                  <td className="px-3 py-2 text-right text-ink-900">{point.completed}</td>
                  <td className="px-3 py-2 text-right text-ink-600">{point.cancelled}</td>
                  <td className="px-3 py-2 text-right text-ink-900">
                    {formatPaisa(point.grossPaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function linePath(values: number[], max: number, width: number, height: number): string {
  if (values.length === 0) return '';
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 2) - 1;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function areaPath(values: number[], max: number, width: number, height: number): string {
  const line = linePath(values, max, width, height);
  if (!line) return '';
  return `${line} L${width} ${height} L0 ${height} Z`;
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short' }).format(date);
}
