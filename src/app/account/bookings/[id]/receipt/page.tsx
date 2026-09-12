import { Fragment } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { isStaff } from '@/lib/auth/rbac';
import { formatPaisa } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';
import { getSetting } from '@/lib/settings';
import { PrintButton } from '@/components/account/PrintButton';

export const metadata: Metadata = {
  title: 'Receipt',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

const ITEM_LABELS: Record<string, string> = {
  INSPECTION: 'Muaina',
  LABOUR: 'Mazdoori',
  PARTS: 'Parts',
  EMERGENCY_FEE: 'Emergency fee',
  TRAVEL: 'Aane jane ka kharcha',
  OTHER: 'Deegar',
};

/**
 * Printable receipt for a finished job.
 *
 * Built as a page rather than a generated PDF: every phone and desktop browser
 * already prints to PDF, and a rendering library on the server would be a
 * dependency, a font-loading problem and a new attack surface for a document
 * the browser can make itself.
 *
 * It only ever shows what the customer actually agreed to and paid. The
 * platform's commission is not on it — that is between the platform and the
 * technician, and putting it on a customer's receipt would invite the
 * reasonable question of why they are being shown it.
 */
export default async function ReceiptPage({ params }: Params) {
  const ctx = await requirePageAuth('/account/bookings');
  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      completedAt: true,
      createdAt: true,
      scheduledFor: true,
      problemDescription: true,
      customerId: true,
      emergencyFeePaisa: true,
      discountPaisa: true,
      finalTotalPaisa: true,
      approvedTotalPaisa: true,
      guaranteeEligible: true,
      guaranteeDays: true,
      guaranteeExpiresAt: true,
      customer: { select: { fullName: true } },
      service: { select: { name: true } },
      provider: { select: { businessName: true } },
      address: { select: { addressLine: true, city: true, zone: { select: { name: true } } } },
      promoCode: { select: { code: true } },
      quotes: {
        where: { status: 'APPROVED' },
        orderBy: { respondedAt: 'asc' },
        select: {
          isAdditional: true,
          subtotalPaisa: true,
          respondedAt: true,
          items: {
            select: { kind: true, label: true, quantity: true, unitPricePaisa: true },
          },
        },
      },
      payments: {
        where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
        select: {
          method: true,
          status: true,
          amountPaisa: true,
          refundedPaisa: true,
          paidAt: true,
        },
      },
    },
  });

  // Not this customer's booking, not staff: the same 404 they get everywhere else.
  if (!booking || (booking.customerId !== ctx.user.id && !isStaff(ctx.role))) notFound();

  // A receipt for work that is not finished would be a receipt for nothing.
  if (booking.status !== 'COMPLETED' && booking.status !== 'REFUNDED') notFound();

  const supportEmail = await getSetting('platform.supportEmail');
  const total = booking.finalTotalPaisa ?? booking.approvedTotalPaisa ?? 0;
  const refunded = booking.payments.reduce((sum, payment) => sum + payment.refundedPaisa, 0);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Screen-only controls; `print:hidden` keeps them off the paper. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/account/bookings/${booking.id}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Booking par wapis
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-2xl border border-ink-200 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-5">
          <div>
            <p className="text-lg font-bold tracking-tight text-ink-950">
              Islamabad<span className="text-brand-700">Fix</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-500">Problem batao. Baqi hum sambhal lenge.</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Receipt</p>
            <p className="text-sm font-bold text-ink-950">{booking.reference}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {formatDateTime(booking.completedAt ?? booking.createdAt)}
            </p>
          </div>
        </header>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <Pair label="Customer" value={booking.customer.fullName} />
          <Pair label="Service" value={booking.service.name} />
          <Pair label="Technician" value={booking.provider?.businessName ?? '—'} />
          <Pair
            label="Location"
            value={`${booking.address.addressLine}, ${
              booking.address.zone?.name ?? booking.address.city
            }`}
          />
        </dl>

        <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-600">
          <span className="font-medium text-ink-800">Masla: </span>
          {booking.problemDescription}
        </p>

        {/* Every approved quote, in the order the customer approved them, so an
            additional charge is visibly separate from the original. */}
        <table className="mt-5 w-full text-sm">
          <caption className="sr-only">Kaam ki tafseel aur qeemat</caption>
          <thead>
            <tr className="border-b border-ink-200 text-left">
              <th scope="col" className="pb-2 text-xs font-semibold uppercase text-ink-500">
                Tafseel
              </th>
              <th
                scope="col"
                className="pb-2 text-right text-xs font-semibold uppercase text-ink-500"
              >
                Qeemat
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {booking.quotes.map((quote, quoteIndex) => (
              // A keyed fragment, because the rows of one quote are siblings in
              // the table body rather than a wrapper element of their own.
              <Fragment key={quoteIndex}>
                {quote.isAdditional ? (
                  <tr>
                    <td colSpan={2} className="pt-3 text-xs font-semibold uppercase text-ink-500">
                      Extra charges — aap ki approval ke baad
                    </td>
                  </tr>
                ) : null}
                {quote.items.map((item, itemIndex) => (
                  <tr key={`${quoteIndex}-${itemIndex}`}>
                    <td className="py-2 pr-3">
                      <span className="text-ink-800">{item.label}</span>
                      <span className="ml-1.5 text-xs text-ink-400">
                        {ITEM_LABELS[item.kind] ?? item.kind}
                      </span>
                      {item.quantity > 1 ? (
                        <span className="ml-1.5 text-xs text-ink-500">× {item.quantity}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right font-medium text-ink-900">
                      {formatPaisa(item.unitPricePaisa * item.quantity)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}

            {booking.emergencyFeePaisa > 0 ? (
              <tr>
                <td className="py-2 pr-3 text-ink-800">Emergency fee</td>
                <td className="py-2 text-right font-medium text-ink-900">
                  {formatPaisa(booking.emergencyFeePaisa)}
                </td>
              </tr>
            ) : null}
            {booking.discountPaisa > 0 ? (
              <tr>
                <td className="py-2 pr-3 text-ink-800">
                  Discount{booking.promoCode ? ` (${booking.promoCode.code})` : ''}
                </td>
                <td className="py-2 text-right font-medium text-brand-700">
                  −{formatPaisa(booking.discountPaisa)}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-300">
              <th scope="row" className="pt-3 text-left font-semibold text-ink-900">
                Total
              </th>
              <td className="pt-3 text-right text-base font-bold text-ink-950">
                {formatPaisa(total)}
              </td>
            </tr>
            {refunded > 0 ? (
              <tr>
                <th scope="row" className="pt-1.5 text-left text-sm font-medium text-ink-700">
                  Refund
                </th>
                <td className="pt-1.5 text-right text-sm font-semibold text-brand-700">
                  −{formatPaisa(refunded)}
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>

        <section className="mt-5 border-t border-ink-100 pt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Payment</h2>
          {booking.payments.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-600">
              Is booking par koi payment record nahi hai.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-sm text-ink-700">
              {booking.payments.map((payment, index) => (
                <li key={index}>
                  {payment.method === 'CASH'
                    ? 'Cash'
                    : payment.method === 'BANK_TRANSFER'
                      ? 'Bank transfer'
                      : 'Online'}{' '}
                  — {formatPaisa(payment.amountPaisa)}
                  {payment.paidAt ? ` · ${formatDateTime(payment.paidAt)}` : ''}
                  {payment.refundedPaisa > 0
                    ? ` · ${formatPaisa(payment.refundedPaisa)} refund`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        {booking.guaranteeEligible && booking.guaranteeExpiresAt ? (
          <p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-900 print:border-ink-300 print:bg-transparent">
            <strong className="font-semibold">
              {booking.guaranteeDays}-din Fix Guarantee is booking par laagu hai
            </strong>{' '}
            — {formatDateTime(booking.guaranteeExpiresAt)} tak. Wohi masla wapis aaye to re-visit
            request kar sakte hain; har claim ka jaiza ops team karti hai.
          </p>
        ) : null}

        <footer className="mt-5 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-500">
          <p>
            Islamabad Fix ek marketplace hai. Technicians khud-mukhtar (independent) service
            providers hain, Islamabad Fix ke mulazim nahi. Sawal ho to {supportEmail} par likhein
            aur booking reference {booking.reference} zaroor likhein.
          </p>
          <p className="mt-1.5">
            Yeh computer se bana receipt hai, is par dastakhat ki zaroorat nahi.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-ink-900">{value}</dd>
    </div>
  );
}
