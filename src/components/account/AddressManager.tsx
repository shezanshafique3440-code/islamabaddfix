'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Select, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';

interface AddressView {
  id: string;
  label: string;
  addressLine: string;
  houseOrBuilding: string | null;
  landmark: string | null;
  contactPhone: string | null;
  zoneId: string | null;
  zoneName: string | null;
  city: string;
  isDefault: boolean;
  hasCoordinates: boolean;
}

export function AddressManager({
  addresses,
  zones,
}: {
  addresses: AddressView[];
  zones: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AddressView | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AddressView | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <Button onClick={() => setEditing('new')}>+ New address</Button>

      {addresses.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-ink-200 bg-surface p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{address.label}</span>
                  {address.isDefault ? <Badge tone="brand">Default</Badge> : null}
                  {address.hasCoordinates ? <Badge tone="neutral">GPS</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-ink-700">{address.addressLine}</p>
                {address.houseOrBuilding ? (
                  <p className="text-xs text-ink-500">{address.houseOrBuilding}</p>
                ) : null}
                {address.landmark ? (
                  <p className="text-xs text-ink-500">Landmark: {address.landmark}</p>
                ) : null}
                <p className="mt-0.5 text-xs text-ink-500">
                  {address.zoneName ?? address.city}
                  {address.contactPhone ? ` · ${address.contactPhone}` : ''}
                </p>
              </div>

              <div className="flex shrink-0 gap-1.5">
                {!address.isDefault ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api.patch(`/api/addresses/${address.id}`, { isDefault: true });
                        toast({ tone: 'success', title: 'Default address set' });
                        router.refresh();
                      } catch (error) {
                        toast({
                          tone: 'error',
                          title: 'Not set',
                          description: error instanceof ApiError ? error.message : undefined,
                        });
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => setEditing(address)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(address)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-4"
          title="No saved addresses"
          description="Saving an address makes your next booking much faster."
        />
      )}

      <AddressDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        address={editing === 'new' ? null : editing}
        zones={zones}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove this address?"
        description="Past booking records stay intact; the address is only removed from your list."
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await api.delete(`/api/addresses/${deleting.id}`);
            toast({ tone: 'success', title: 'Address removed' });
            setDeleting(null);
            router.refresh();
          } catch (error) {
            toast({
              tone: 'error',
              title: 'Could not be removed',
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

function AddressDialog({
  open,
  address,
  zones,
  onClose,
  onDone,
}: {
  open: boolean;
  address: AddressView | null;
  zones: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    label: address?.label ?? 'Home',
    zoneId: address?.zoneId ?? '',
    addressLine: address?.addressLine ?? '',
    houseOrBuilding: address?.houseOrBuilding ?? '',
    landmark: address?.landmark ?? '',
    contactPhone: address?.contactPhone ?? '',
    isDefault: address?.isDefault ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setErrors({});
    const payload = {
      label: form.label,
      zoneId: form.zoneId || null,
      addressLine: form.addressLine,
      houseOrBuilding: form.houseOrBuilding || undefined,
      landmark: form.landmark || undefined,
      contactPhone: form.contactPhone || undefined,
      isDefault: form.isDefault,
    };
    try {
      if (address) await api.patch(`/api/addresses/${address.id}`, payload);
      else await api.post('/api/addresses', payload);
      toast({
        tone: 'success',
        title: address ? 'Address updated' : 'Address saved',
      });
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldMap);
        toast({ tone: 'error', title: error.message });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={address ? 'Edit address' : 'New address'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button loading={loading} onClick={save} disabled={form.addressLine.trim().length < 5}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput
          label="Naam"
          value={form.label}
          onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
          placeholder="Home / Office"
          error={errors.label}
        />
        <Select
          label="Sector / area"
          value={form.zoneId}
          onChange={(event) => setForm((f) => ({ ...f, zoneId: event.target.value }))}
          error={errors.zoneId}
        >
          <option value="">Choose an area</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>
        <TextInput
          label="Full address"
          required
          value={form.addressLine}
          onChange={(event) => setForm((f) => ({ ...f, addressLine: event.target.value }))}
          placeholder="House 12, Street 4, G-10/2, Islamabad"
          error={errors.addressLine}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="House / building"
            value={form.houseOrBuilding}
            onChange={(event) => setForm((f) => ({ ...f, houseOrBuilding: event.target.value }))}
            error={errors.houseOrBuilding}
          />
          <TextInput
            label="Landmark"
            value={form.landmark}
            onChange={(event) => setForm((f) => ({ ...f, landmark: event.target.value }))}
            error={errors.landmark}
          />
        </div>
        <TextInput
          label="Contact number"
          type="tel"
          inputMode="tel"
          value={form.contactPhone}
          onChange={(event) => setForm((f) => ({ ...f, contactPhone: event.target.value }))}
          error={errors.contactPhone}
        />
        <label className="flex items-center gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(event) => setForm((f) => ({ ...f, isDefault: event.target.checked }))}
            className="h-[1.125rem] w-[1.125rem] rounded border-ink-300 text-brand-700 focus:ring-brand-600"
          />
          Make this the default address
        </label>
      </div>
    </Dialog>
  );
}
