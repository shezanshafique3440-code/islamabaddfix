import { ok, route } from '@/lib/http';
import { getPublicProvider } from '@/lib/providers/visibility';
import { publicReviewsFor } from '@/lib/bookings/reviews';
import { notFound } from '@/lib/errors';

type Params = { params: Promise<{ slug: string }> };

export const GET = route(async (_request, { params }: Params) => {
  const { slug } = await params;
  const provider = await getPublicProvider(slug);
  if (!provider) throw notFound('Provider');

  const reviews = await publicReviewsFor(provider.id, { take: 10 });
  return ok({ provider, reviews });
});
