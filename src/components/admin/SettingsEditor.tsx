'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatPaisa } from '@/lib/money';
import { cn } from '@/lib/utils';

interface SettingMeta {
  key: string;
  label: string;
  help: string;
  group: string;
  unit?: string;
  kind: 'boolean' | 'number' | 'string' | 'json';
}

/**
 * Settings editor.
 *
 * Rendered entirely from the settings registry's metadata, so a new business
 * rule appears here automatically when it is added to the registry.
 *
 * Financially sensitive keys are marked and gated behind the super-admin
 * permission — the API enforces the same rule, this just avoids offering an
 * input that would be rejected.
 */
const FINANCIAL_KEYS = new Set([
  'platform.commissionRateBp',
  'booking.cancellationFeePaisa',
  'emergency.defaultFeePaisa',
  'emergency.maxFeePaisa',
]);

const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  booking: 'Booking policy',
  commerce: 'Commerce & commission',
  matching: 'Matching algorithm',
  emergency: 'Emergency',
  guarantee: 'Fix Guarantee',
  reviews: 'Reviews',
  notifications: 'Notifications',
  ai: 'AI assistant',
  providers: 'Provider onboarding',
};

export function SettingsEditor({
  values,
  metadata,
  canWrite,
  canWriteFinancial,
}: {
  values: Record<string, unknown>;
  metadata: SettingMeta[];
  canWrite: boolean;
  canWriteFinancial: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const groups = [...new Set(metadata.map((entry) => entry.group))];

  async function save(entry: SettingMeta, rawValue: unknown) {
    setSaving(entry.key);
    try {
      await api.patch('/api/admin/settings', { key: entry.key, value: rawValue });
      toast({ tone: 'success', title: `${entry.label} updated` });
      setDrafts((current) => {
        const next = { ...current };
        delete next[entry.key];
        return next;
      });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Not saved',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      {!canWrite ? (
        <div className="rounded-xl border border-info-100 bg-info-50 px-4 py-3">
          <p className="text-sm text-info-700">You can see these settings but not change them.</p>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group} className="rounded-2xl border border-ink-200 bg-surface">
          <div className="border-b border-ink-200 px-5 py-3.5">
            <h2 className="text-[0.9375rem] font-semibold text-ink-900">
              {GROUP_LABELS[group] ?? group}
            </h2>
          </div>

          <ul className="divide-y divide-ink-100">
            {metadata
              .filter((entry) => entry.group === group)
              .map((entry) => {
                const isFinancial = FINANCIAL_KEYS.has(entry.key);
                const locked = !canWrite || (isFinancial && !canWriteFinancial);
                const currentValue = values[entry.key];
                const draft = drafts[entry.key];

                return (
                  <li key={entry.key} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink-900">{entry.label}</p>
                          {isFinancial ? <Badge tone="warn">Financial</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{entry.help}</p>
                        <p className="mt-1 font-mono text-[0.6875rem] text-ink-500">{entry.key}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {entry.kind === 'boolean' ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={currentValue === true}
                            aria-label={entry.label}
                            disabled={locked || saving === entry.key}
                            onClick={() => save(entry, currentValue !== true)}
                            className={cn(
                              'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
                              currentValue === true ? 'bg-brand-600' : 'bg-ink-300',
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform',
                                currentValue === true
                                  ? 'translate-x-[1.375rem]'
                                  : 'translate-x-0.5',
                              )}
                            />
                          </button>
                        ) : entry.kind === 'number' ? (
                          <>
                            <input
                              type="number"
                              defaultValue={String(currentValue ?? '')}
                              disabled={locked}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [entry.key]: event.target.value,
                                }))
                              }
                              aria-label={entry.label}
                              className="h-10 w-28 rounded-xl border border-ink-300 px-3 text-sm disabled:bg-ink-50"
                            />
                            {entry.unit ? (
                              <span className="text-xs text-ink-500">{entry.unit}</span>
                            ) : null}
                            {draft !== undefined && draft !== String(currentValue) ? (
                              <Button
                                size="sm"
                                loading={saving === entry.key}
                                onClick={() => save(entry, Number(draft))}
                              >
                                Save
                              </Button>
                            ) : null}
                          </>
                        ) : entry.kind === 'string' ? (
                          <>
                            <input
                              type="text"
                              defaultValue={String(currentValue ?? '')}
                              disabled={locked}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [entry.key]: event.target.value,
                                }))
                              }
                              aria-label={entry.label}
                              className="h-10 w-48 rounded-xl border border-ink-300 px-3 text-sm disabled:bg-ink-50"
                            />
                            {draft !== undefined && draft !== String(currentValue) ? (
                              <Button
                                size="sm"
                                loading={saving === entry.key}
                                onClick={() => save(entry, draft)}
                              >
                                Save
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          /* Structured values (matching weights, channel toggles) edit as JSON. */
                          <div className="flex flex-col items-end gap-2">
                            <textarea
                              defaultValue={JSON.stringify(currentValue, null, 2)}
                              disabled={locked}
                              rows={6}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [entry.key]: event.target.value,
                                }))
                              }
                              aria-label={entry.label}
                              className="w-64 rounded-xl border border-ink-300 p-2.5 font-mono text-xs disabled:bg-ink-50"
                            />
                            {draft !== undefined ? (
                              <Button
                                size="sm"
                                loading={saving === entry.key}
                                onClick={() => {
                                  try {
                                    save(entry, JSON.parse(draft));
                                  } catch {
                                    toast({ tone: 'error', title: 'Enter valid JSON' });
                                  }
                                }}
                              >
                                Save
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Paisa values are hard to read as integers; show the rupee equivalent. */}
                    {entry.unit === 'paisa' && typeof currentValue === 'number' ? (
                      <p className="mt-1.5 text-xs text-ink-500">= {formatPaisa(currentValue)}</p>
                    ) : null}
                    {entry.unit === 'bp' && typeof currentValue === 'number' ? (
                      <p className="mt-1.5 text-xs text-ink-500">= {currentValue / 100}%</p>
                    ) : null}
                    {isFinancial && !canWriteFinancial ? (
                      <p className="mt-1.5 text-xs text-warn-700">
                        Only a super admin can change this setting.
                      </p>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <p className="text-xs text-ink-500">
        Every change is recorded in the audit log with the old and new value.
      </p>
    </div>
  );
}
