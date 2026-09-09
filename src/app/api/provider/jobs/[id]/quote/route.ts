import { created, ok, parseJson, route } from '@/lib/http';
import { requireProvider } from '@/lib/auth/session';
import { submitQuoteSchema } from '@/lib/validation/schemas';
import { quoteHistoryFor, submitQuote } from '@/lib/bookings/quotes';
import { rupeesToPaisa } from '@/lib/money';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request, { params }: Params) => {
  await requireProvider();
  const { id } = await params;
  return ok(await quoteHistoryFor(id));
});

/**
 * Submit a quote (or additional charges).
 *
 * Line items arrive in rupees; the total is computed inside submitQuote from
 * the persisted paisa values. There is no total field on the request.
 */
export const POST = route(async (request, { params }: Params) => {
  const ctx = await requireProvider();
  const { id } = await params;
  const input = await parseJson(request, submitQuoteSchema);

  const quote = await submitQuote({
    bookingId: id,
    providerId: ctx.providerId,
    actorUserId: ctx.user.id,
    items: input.items.map((item) => ({
      kind: item.kind,
      label: item.label,
      quantity: item.quantity,
      unitPricePaisa: rupeesToPaisa(item.unitPriceRupees),
    })),
    notes: input.notes,
    validUntil: input.validUntil ?? null,
  });

  return created({
    id: quote.id,
    status: quote.status,
    subtotalPaisa: quote.subtotalPaisa,
    isAdditional: quote.isAdditional,
  });
});
