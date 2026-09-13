import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageAuth } from '@/lib/auth/session';
import { listNotifications } from '@/lib/notifications';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelative } from '@/lib/utils';
import { MarkAllRead } from '@/components/account/MarkAllRead';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const ctx = await requirePageAuth('/account/notifications');
  const notifications = await listNotifications(ctx.user.id, { take: 50 });
  const hasUnread = notifications.some((entry) => entry.readAt === null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display-sm text-ink-950">Notifications</h1>
          <p className="mt-1 text-sm text-ink-600">Updates on bookings, quotes and payments.</p>
        </div>
        {hasUnread ? <MarkAllRead /> : null}
      </div>

      {notifications.length > 0 ? (
        <ul className="mt-6 divide-y divide-ink-200 overflow-hidden rounded-2xl border border-ink-200 bg-white">
          {notifications.map((entry) => {
            const body = (
              <div
                className={cn(
                  'flex items-start gap-3 px-4 py-3.5',
                  entry.readAt === null && 'bg-brand-50/40',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    entry.readAt === null ? 'bg-brand-600' : 'bg-transparent',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{entry.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{entry.body}</p>
                  <p className="mt-1 text-xs text-ink-400">{formatRelative(entry.createdAt)}</p>
                </div>
              </div>
            );

            return (
              <li key={entry.id}>
                {entry.href ? (
                  <Link href={entry.href} className="block hover:bg-ink-50">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          className="mt-6"
          title="No notifications"
          description="Updates appear here once you make a booking."
          action={{ label: 'Book a service', href: '/book' }}
        />
      )}
    </div>
  );
}
