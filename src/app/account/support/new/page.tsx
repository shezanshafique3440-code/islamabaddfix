import type { Metadata } from 'next';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { NewTicketForm } from '@/components/account/NewTicketForm';

export const metadata: Metadata = { title: 'Naya ticket', robots: { index: false, follow: false } };

export default async function NewTicketPage() {
  const ctx = await requirePageAuth('/account/support/new');

  // Only the caller's own bookings can be attached to a ticket.
  const bookings = await prisma.booking.findMany({
    where: { customerId: ctx.user.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      reference: true,
      service: { select: { name: true } },
      createdAt: true,
    },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-display-sm text-ink-950">Naya support ticket</h1>
      <p className="mt-1 text-sm text-ink-600">
        Masla tafseel se batayein. Booking select karne se team ko context mil jata hai.
      </p>
      <div className="mt-6">
        <NewTicketForm
          bookings={bookings.map((booking) => ({
            id: booking.id,
            label: `${booking.reference} — ${booking.service.name}`,
          }))}
        />
      </div>
    </div>
  );
}
