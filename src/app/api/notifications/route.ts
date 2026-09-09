import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/http';
import { requireAuth } from '@/lib/auth/session';
import { countUnread, listNotifications } from '@/lib/notifications';

const querySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  take: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export const GET = route(async (request) => {
  const ctx = await requireAuth();
  const query = parseQuery(request, querySchema);

  const [items, unread] = await Promise.all([
    listNotifications(ctx.user.id, query),
    countUnread(ctx.user.id),
  ]);

  return ok(
    items.map((item) => ({
      id: item.id,
      event: item.event,
      title: item.title,
      body: item.body,
      href: item.href,
      readAt: item.readAt,
      createdAt: item.createdAt,
    })),
    { unread, nextCursor: items.at(-1)?.id ?? null },
  );
});
