'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingSummary } from '@/lib/bookings/queries';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ServiceIconTile } from '@/components/ui/ServiceIcon';
import { useToast } from '@/components/ui/Toast';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Field';
import { formatDateTime, formatRelative } from '@/lib/utils';

interface Offer {
  offerId: string;
  notifiedAt: Date | string;
  expiresAt: Date | string | null;
  booking: BookingSummary;
}

/**
 * Incoming job offers.
 *
 * The card deliberately shows the area, not the street address: the full
 * address is released by the API only after the job is accepted. Accepting is
 * one tap, because a technician is usually doing this between jobs.
 */
export function JobOfferList({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<Offer | null>(null);

  async function accept(offer: Offer) {
    setBusy(offer.offerId);
    try {
      await api.post(`/api/provider/jobs/${offer.booking.id}/status`, { action: 'accept' });
      toast({
        tone: 'success',
        title: 'Job accepted',
        description: 'You can now see the customer’s full address and phone number.',
      });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not accept',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {offers.map((offer) => (
          <li
            key={offer.offerId}
            className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-4"
          >
            <div className="flex items-start gap-3.5">
              <ServiceIconTile iconKey={offer.booking.category.iconKey} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.9375rem] font-semibold text-ink-900">
                    {offer.booking.serviceName}
                  </span>
                  {offer.booking.isEmergency ? <Badge tone="danger">🚨 Emergency</Badge> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-700">
                  {offer.booking.problemDescription}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
                  <span className="font-medium">{offer.booking.zoneName}</span>
                  {offer.booking.scheduledFor ? (
                    <span>{formatDateTime(offer.booking.scheduledFor)}</span>
                  ) : (
                    <span>Right now</span>
                  )}
                  <span>arrived {formatRelative(offer.notifiedAt)}</span>
                </div>
                {offer.expiresAt ? (
                  <p className="mt-1.5 text-xs font-medium text-warn-700">
                    respond within {formatRelative(offer.expiresAt)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="success"
                loading={busy === offer.offerId}
                onClick={() => accept(offer)}
                className="sm:flex-1"
              >
                Accept
              </Button>
              <Button variant="outline" onClick={() => setDeclining(offer)}>
                Not allowed
              </Button>
              <Link
                href={`/provider/jobs/${offer.booking.id}`}
                className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-ink-600 hover:bg-ink-100"
              >
                Details
              </Link>
            </div>

            <p className="mt-2 text-xs text-ink-500">
              The full address and the customer’s number appear once you accept.
            </p>
          </li>
        ))}
      </ul>

      <DeclineDialog
        offer={declining}
        onClose={() => setDeclining(null)}
        onDone={() => {
          setDeclining(null);
          router.refresh();
        }}
      />
    </>
  );
}

function DeclineDialog({
  offer,
  onClose,
  onDone,
}: {
  offer: Offer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Dialog
      open={offer !== null}
      onClose={onClose}
      title="Decline this job?"
      description="Giving a reason is optional but it improves matching."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Leave it
          </Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={async () => {
              if (!offer) return;
              setLoading(true);
              try {
                await api.post(`/api/provider/jobs/${offer.booking.id}/status`, {
                  action: 'decline',
                  reason: reason.trim() || undefined,
                });
                toast({ tone: 'info', title: 'Job declined' });
                onDone();
              } catch (error) {
                toast({
                  tone: 'error',
                  title: 'Could not decline',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            Decline
          </Button>
        </>
      }
    >
      <Textarea
        label="Reason (optional)"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="For example: I have another job at that time"
      />
    </Dialog>
  );
}
