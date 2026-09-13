'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Checkbox, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

interface ZoneRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  sortOrder: number;
  providerCount: number;
  addressCount: number;
}

/**
 * Service-area editor.
 *
 * Zones are deactivated rather than deleted: customers' saved addresses point at
 * them, and someone's address should not lose its area because ops retired a
 * sector. Provider coverage is shown so a thin area is visible before it is
 * opened to customers.
 */
export function ZoneManager({ zones }: { zones: ZoneRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<ZoneRow | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<ZoneRow | null>(null);
  const [busy, setBusy] = useState(false);

  const uncovered = zones.filter((zone) => zone.isActive && zone.providerCount === 0);

  return (
    <div>
      <Button onClick={() => setEditing('new')}>+ New area</Button>

      {uncovered.length > 0 ? (
        <div className="mt-4 rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="text-sm font-semibold text-warn-700">
            No provider in {uncovered.length} active area(s)
          </p>
          <p className="mt-1 text-sm text-ink-700">
            {uncovered.map((zone) => zone.name).join(', ')} — bookings in these areas will not match
            automatically and will queue for manual assignment.
          </p>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-ink-200">
        <table className="w-full min-w-[42rem] text-sm">
          <caption className="sr-only">Service areas</caption>
          <thead className="bg-ink-50 text-left">
            <tr>
              <Th>Area</Th>
              <Th>City</Th>
              <Th className="text-right">Providers</Th>
              <Th className="text-right">Addresses</Th>
              <Th>Centroid</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-surface">
            {zones.map((zone) => (
              <tr key={zone.id}>
                <Td>
                  <span className="font-medium text-ink-900">{zone.name}</span>
                  <span className="block text-xs text-ink-500">/{zone.slug}</span>
                </Td>
                <Td className="text-ink-600">{zone.city}</Td>
                <Td className="text-right">
                  <span
                    className={
                      zone.providerCount === 0 ? 'font-semibold text-warn-700' : 'text-ink-900'
                    }
                  >
                    {zone.providerCount}
                  </span>
                </Td>
                <Td className="text-right text-ink-600">{zone.addressCount}</Td>
                <Td className="text-xs text-ink-500">
                  {zone.latitude !== null && zone.longitude !== null
                    ? `${zone.latitude.toFixed(3)}, ${zone.longitude.toFixed(3)}`
                    : 'Not set'}
                </Td>
                <Td>
                  <Badge tone={zone.isActive ? 'success' : 'neutral'}>
                    {zone.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(zone)}>
                      Edit
                    </Button>
                    {zone.isActive ? (
                      <Button variant="ghost" size="sm" onClick={() => setDeactivating(zone)}>
                        Deactivate
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ZoneDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        zone={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title={`Deactivate “${deactivating?.name}”?`}
        description="This area will not appear for new bookings. Existing addresses and bookings stay intact — which is why it is deactivated, not deleted."
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={async () => {
          if (!deactivating) return;
          setBusy(true);
          try {
            await api.delete(`/api/admin/catalogue/zones/${deactivating.id}`);
            toast({ tone: 'success', title: 'Area deactivated' });
            setDeactivating(null);
            router.refresh();
          } catch (error) {
            toast({
              tone: 'error',
              title: 'Not deactivated',
              description: error instanceof ApiError ? error.message : undefined,
            });
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function ZoneDialog({
  open,
  zone,
  onClose,
  onDone,
}: {
  open: boolean;
  zone: ZoneRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: zone?.name ?? '',
    city: zone?.city ?? 'Islamabad',
    latitude: zone?.latitude !== null && zone?.latitude !== undefined ? String(zone.latitude) : '',
    longitude:
      zone?.longitude !== null && zone?.longitude !== undefined ? String(zone.longitude) : '',
    isActive: zone?.isActive ?? true,
    sortOrder: String(zone?.sortOrder ?? 0),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={zone ? 'Edit area' : 'New service area'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            disabled={form.name.trim().length < 1}
            onClick={async () => {
              setLoading(true);
              setErrors({});
              const payload = {
                name: form.name,
                city: form.city,
                latitude: form.latitude ? Number(form.latitude) : null,
                longitude: form.longitude ? Number(form.longitude) : null,
                isActive: form.isActive,
                sortOrder: Number(form.sortOrder) || 0,
              };
              try {
                if (zone) await api.patch(`/api/admin/catalogue/zones/${zone.id}`, payload);
                else await api.post('/api/admin/catalogue/zones', payload);
                toast({ tone: 'success', title: 'Saved' });
                onDone();
              } catch (error) {
                if (error instanceof ApiError) {
                  setErrors(error.fieldMap);
                  toast({ tone: 'error', title: error.message });
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Area ka naam"
          required
          value={form.name}
          onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
          placeholder="G-10"
          error={errors.name}
        />
        <TextInput
          label="City"
          value={form.city}
          onChange={(event) => setForm((f) => ({ ...f, city: event.target.value }))}
          error={errors.city}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Latitude"
            type="number"
            step="0.0001"
            value={form.latitude}
            onChange={(event) => setForm((f) => ({ ...f, latitude: event.target.value }))}
            error={errors.latitude}
          />
          <TextInput
            label="Longitude"
            type="number"
            step="0.0001"
            value={form.longitude}
            onChange={(event) => setForm((f) => ({ ...f, longitude: event.target.value }))}
            error={errors.longitude}
          />
        </div>
        <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
          The centroid is optional. When a customer does not drop a GPS pin, matching uses it to
          estimate distance — so setting it makes matching better.
        </p>
        <TextInput
          label="Sort order"
          type="number"
          min={0}
          value={form.sortOrder}
          onChange={(event) => setForm((f) => ({ ...f, sortOrder: event.target.value }))}
        />
        <Checkbox
          label="Active (available for booking)"
          checked={form.isActive}
          onChange={(event) => setForm((f) => ({ ...f, isActive: event.target.checked }))}
        />
      </div>
    </Dialog>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3.5 py-3 ${className ?? ''}`}>{children}</td>;
}
