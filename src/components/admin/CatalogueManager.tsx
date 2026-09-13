'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Checkbox, Select, Textarea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { formatPaisaRange } from '@/lib/money';

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  minPricePaisa: number;
  maxPricePaisa: number | null;
  requiresInspection: boolean;
  estimatedMinutes: number;
  isActive: boolean;
  isEmergencyEnabled: boolean;
  guaranteeEligible: boolean;
  bookingCount: number;
  providerCount: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  iconKey: string;
  isActive: boolean;
  isEmergencyCategory: boolean;
  guaranteeEligible: boolean;
  sortOrder: number;
  services: ServiceRow[];
}

const ICON_KEYS = [
  'wrench',
  'snowflake',
  'bolt',
  'droplet',
  'sparkles',
  'hammer',
  'brush',
  'plug',
  'shield',
];

/**
 * Catalogue editor.
 *
 * Deletes are soft and refuse while live bookings exist, so retiring a service
 * can never orphan a job in progress. The row shows booking and provider counts
 * precisely so an operator can see what a change would affect.
 */
export function CatalogueManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [categoryDialog, setCategoryDialog] = useState<CategoryRow | 'new' | null>(null);
  const [serviceDialog, setServiceDialog] = useState<{
    categoryId: string;
    service: ServiceRow | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    kind: 'category' | 'service';
    id: string;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <Button onClick={() => setCategoryDialog('new')}>+ New category</Button>

      <div className="mt-5 space-y-4">
        {categories.map((category) => (
          <section key={category.id} className="rounded-2xl border border-ink-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <ServiceIconTile iconKey={category.iconKey} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[0.9375rem] font-semibold text-ink-900">{category.name}</h2>
                    {!category.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                    {category.isEmergencyCategory ? <Badge tone="danger">Emergency</Badge> : null}
                    {!category.guaranteeEligible ? <Badge tone="warn">No guarantee</Badge> : null}
                  </div>
                  <p className="text-xs text-ink-500">
                    /{category.slug} · {category.services.length} services · order{' '}
                    {category.sortOrder}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setServiceDialog({ categoryId: category.id, service: null })}
                >
                  + Service
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCategoryDialog(category)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDeleting({ kind: 'category', id: category.id, name: category.name })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>

            {category.services.length > 0 ? (
              <ul className="divide-y divide-ink-100">
                {category.services.map((service) => (
                  <li
                    key={service.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{service.name}</span>
                        {!service.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                        {service.isEmergencyEnabled ? <Badge tone="danger">Emergency</Badge> : null}
                        {service.requiresInspection ? (
                          <Badge tone="neutral">Inspection first</Badge>
                        ) : null}
                        {!service.guaranteeEligible ? (
                          <Badge tone="warn">No guarantee</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatPaisaRange(service.minPricePaisa, service.maxPricePaisa)} ·{' '}
                        {service.estimatedMinutes} min · {service.bookingCount} bookings ·{' '}
                        {service.providerCount} providers
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setServiceDialog({ categoryId: category.id, service })}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDeleting({ kind: 'service', id: service.id, name: service.name })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-ink-500">No services in this category.</p>
            )}
          </section>
        ))}
      </div>

      <CategoryDialog
        key={categoryDialog === 'new' ? 'new-category' : (categoryDialog?.id ?? 'closed')}
        open={categoryDialog !== null}
        category={categoryDialog === 'new' ? null : categoryDialog}
        onClose={() => setCategoryDialog(null)}
        onDone={() => {
          setCategoryDialog(null);
          router.refresh();
        }}
      />

      <ServiceDialog
        key={serviceDialog?.service?.id ?? `new-${serviceDialog?.categoryId ?? 'closed'}`}
        open={serviceDialog !== null}
        categoryId={serviceDialog?.categoryId ?? ''}
        service={serviceDialog?.service ?? null}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        onClose={() => setServiceDialog(null)}
        onDone={() => {
          setServiceDialog(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="This is a soft delete — the record is kept and past bookings stay intact. The delete is refused if there are live bookings."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await api.delete(
              deleting.kind === 'category'
                ? `/api/admin/catalogue/categories/${deleting.id}`
                : `/api/admin/catalogue/services/${deleting.id}`,
            );
            toast({ tone: 'success', title: 'Deleted' });
            setDeleting(null);
            router.refresh();
          } catch (error) {
            toast({
              tone: 'error',
              title: 'Could not delete',
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

function CategoryDialog({
  open,
  category,
  onClose,
  onDone,
}: {
  open: boolean;
  category: CategoryRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: category?.name ?? '',
    tagline: category?.tagline ?? '',
    iconKey: category?.iconKey ?? 'wrench',
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
    isEmergencyCategory: category?.isEmergencyCategory ?? false,
    guaranteeEligible: category?.guaranteeEligible ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            disabled={form.name.trim().length < 2}
            onClick={async () => {
              setLoading(true);
              setErrors({});
              const payload = {
                name: form.name,
                tagline: form.tagline || undefined,
                iconKey: form.iconKey,
                sortOrder: Number(form.sortOrder) || 0,
                isActive: form.isActive,
                isEmergencyCategory: form.isEmergencyCategory,
                guaranteeEligible: form.guaranteeEligible,
              };
              try {
                if (category)
                  await api.patch(`/api/admin/catalogue/categories/${category.id}`, payload);
                else await api.post('/api/admin/catalogue/categories', payload);
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
          label="Naam"
          required
          value={form.name}
          onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
          error={errors.name}
        />
        <TextInput
          label="Tagline"
          value={form.tagline}
          onChange={(event) => setForm((f) => ({ ...f, tagline: event.target.value }))}
          error={errors.tagline}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Icon"
            value={form.iconKey}
            onChange={(event) => setForm((f) => ({ ...f, iconKey: event.target.value }))}
          >
            {ICON_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </Select>
          <TextInput
            label="Sort order"
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => setForm((f) => ({ ...f, sortOrder: event.target.value }))}
          />
        </div>
        <Checkbox
          label="Active (visible to customers)"
          checked={form.isActive}
          onChange={(event) => setForm((f) => ({ ...f, isActive: event.target.checked }))}
        />
        <Checkbox
          label="Emergency category"
          checked={form.isEmergencyCategory}
          onChange={(event) =>
            setForm((f) => ({ ...f, isEmergencyCategory: event.target.checked }))
          }
        />
        <Checkbox
          label="Guarantee eligible"
          checked={form.guaranteeEligible}
          onChange={(event) => setForm((f) => ({ ...f, guaranteeEligible: event.target.checked }))}
        />
      </div>
    </Dialog>
  );
}

function ServiceDialog({
  open,
  categoryId,
  service,
  categories,
  onClose,
  onDone,
}: {
  open: boolean;
  categoryId: string;
  service: ServiceRow | null;
  categories: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    categoryId,
    name: service?.name ?? '',
    description: service?.description ?? '',
    minPriceRupees: service ? String(service.minPricePaisa / 100) : '',
    maxPriceRupees: service?.maxPricePaisa ? String(service.maxPricePaisa / 100) : '',
    estimatedMinutes: String(service?.estimatedMinutes ?? 60),
    requiresInspection: service?.requiresInspection ?? true,
    isActive: service?.isActive ?? true,
    isEmergencyEnabled: service?.isEmergencyEnabled ?? false,
    guaranteeEligible: service?.guaranteeEligible ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={service ? 'Edit service' : 'New service'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button
            loading={loading}
            disabled={form.name.trim().length < 2}
            onClick={async () => {
              setLoading(true);
              setErrors({});
              const payload = {
                categoryId: form.categoryId,
                name: form.name,
                description: form.description || undefined,
                minPriceRupees: Number(form.minPriceRupees) || 0,
                maxPriceRupees: form.maxPriceRupees ? Number(form.maxPriceRupees) : null,
                estimatedMinutes: Number(form.estimatedMinutes) || 60,
                requiresInspection: form.requiresInspection,
                isActive: form.isActive,
                isEmergencyEnabled: form.isEmergencyEnabled,
                guaranteeEligible: form.guaranteeEligible,
              };
              try {
                if (service)
                  await api.patch(`/api/admin/catalogue/services/${service.id}`, payload);
                else await api.post('/api/admin/catalogue/services', payload);
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
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(event) => setForm((f) => ({ ...f, categoryId: event.target.value }))}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <TextInput
          label="Naam"
          required
          value={form.name}
          onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
          error={errors.name}
        />
        <Textarea
          label="Details"
          rows={2}
          value={form.description}
          onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
          error={errors.description}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput
            label="Min price (Rs.)"
            type="number"
            min={0}
            value={form.minPriceRupees}
            onChange={(event) => setForm((f) => ({ ...f, minPriceRupees: event.target.value }))}
            error={errors.minPriceRupees}
          />
          <TextInput
            label="Max price (Rs.)"
            type="number"
            min={0}
            value={form.maxPriceRupees}
            onChange={(event) => setForm((f) => ({ ...f, maxPriceRupees: event.target.value }))}
            error={errors.maxPriceRupees}
            hint="Leave blank for open-ended"
          />
          <TextInput
            label="Estimated minutes"
            type="number"
            min={15}
            value={form.estimatedMinutes}
            onChange={(event) => setForm((f) => ({ ...f, estimatedMinutes: event.target.value }))}
            error={errors.estimatedMinutes}
          />
        </div>
        <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
          These ranges only give customers an idea. The price actually charged comes from the
          provider’s quote.
        </p>
        <Checkbox
          label="Inspection required (quote follows inspection)"
          checked={form.requiresInspection}
          onChange={(event) => setForm((f) => ({ ...f, requiresInspection: event.target.checked }))}
        />
        <Checkbox
          label="Active"
          checked={form.isActive}
          onChange={(event) => setForm((f) => ({ ...f, isActive: event.target.checked }))}
        />
        <Checkbox
          label="Emergency booking allowed"
          checked={form.isEmergencyEnabled}
          onChange={(event) => setForm((f) => ({ ...f, isEmergencyEnabled: event.target.checked }))}
        />
        <Checkbox
          label="Guarantee eligible"
          checked={form.guaranteeEligible}
          onChange={(event) => setForm((f) => ({ ...f, guaranteeEligible: event.target.checked }))}
        />
      </div>
    </Dialog>
  );
}
