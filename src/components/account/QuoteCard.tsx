import type { QuoteItemKind } from '@prisma/client';
import { Badge } from '@/components/ui/Badge';
import { formatPaisa } from '@/lib/money';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

const ITEM_LABELS: Record<QuoteItemKind, string> = {
  INSPECTION: 'Muaina',
  LABOUR: 'Mazdoori',
  PARTS: 'Parts',
  EMERGENCY_FEE: 'Emergency fee',
  TRAVEL: 'Aane jane ka kharcha',
  OTHER: 'Deegar',
};

interface QuoteView {
  id: string;
  status: string;
  isAdditional: boolean;
  subtotalPaisa: number;
  notes: string | null;
  validUntil: Date | string | null;
  submittedAt: Date | string | null;
  rejectionReason: string | null;
  items: Array<{
    id: string;
    kind: QuoteItemKind;
    label: string;
    quantity: number;
    unitPricePaisa: number;
    totalPaisa: number;
  }>;
}

/**
 * Itemised quote.
 *
 * Every line is shown with its own total — the point of the quote system is
 * that the customer can see exactly what they are agreeing to, so nothing is
 * rolled into a single opaque figure.
 */
export function QuoteCard({
  quote,
  showStatus,
  className,
}: {
  quote: QuoteView;
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-ink-200 bg-white p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">
            {quote.isAdditional ? 'Extra charges' : 'Quote'}
          </span>
          {quote.isAdditional ? <Badge tone="warn">Additional</Badge> : null}
          {showStatus ? (
            <Badge
              tone={
                quote.status === 'APPROVED'
                  ? 'success'
                  : quote.status === 'REJECTED'
                    ? 'danger'
                    : 'neutral'
              }
            >
              {quote.status === 'APPROVED'
                ? 'Approved'
                : quote.status === 'REJECTED'
                  ? 'Rejected'
                  : quote.status === 'SUPERSEDED'
                    ? 'Purana'
                    : quote.status}
            </Badge>
          ) : null}
        </div>
        {quote.submittedAt ? (
          <span className="text-xs text-ink-400">{formatDateTime(quote.submittedAt)}</span>
        ) : null}
      </div>

      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Quote ki tafseel</caption>
        <tbody className="divide-y divide-ink-100">
          {quote.items.map((item) => (
            <tr key={item.id}>
              <td className="py-2 pr-2">
                <span className="text-ink-800">{item.label}</span>
                <span className="ml-1.5 text-xs text-ink-400">{ITEM_LABELS[item.kind]}</span>
                {item.quantity > 1 ? (
                  <span className="ml-1.5 text-xs text-ink-500">× {item.quantity}</span>
                ) : null}
              </td>
              <td className="py-2 text-right font-medium text-ink-900">
                {formatPaisa(item.totalPaisa)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-200">
            <th scope="row" className="py-2.5 text-left font-semibold text-ink-900">
              Total
            </th>
            <td className="py-2.5 text-right text-base font-bold text-ink-950">
              {formatPaisa(quote.subtotalPaisa)}
            </td>
          </tr>
        </tfoot>
      </table>

      {quote.notes ? (
        <p className="mt-2 border-t border-ink-100 pt-2 text-sm text-ink-600">{quote.notes}</p>
      ) : null}
      {quote.rejectionReason ? (
        <p className="mt-2 text-sm text-alert-600">Reject ki wajah: {quote.rejectionReason}</p>
      ) : null}
      {quote.validUntil ? (
        <p className="mt-1.5 text-xs text-ink-500">{formatDateTime(quote.validUntil)} tak valid</p>
      ) : null}
    </div>
  );
}
