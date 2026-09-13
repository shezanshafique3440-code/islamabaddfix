import type { Metadata } from 'next';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { ProfileForm } from '@/components/account/ProfileForm';
import { VerificationPanel } from '@/components/account/VerificationPanel';
import { AccountControls, NotificationPreferences } from '@/components/account/AccountSettings';
import { getNotificationPreferences } from '@/lib/notifications';
import { closureBlockers } from '@/lib/account';
import { formatDate } from '@/lib/utils';
import { formatPaisa } from '@/lib/money';

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const ctx = await requirePageAuth('/account/profile');

  const [user, stats, preferences, blockers] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        fullName: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        createdAt: true,
        customerProfile: {
          select: { totalBookings: true, completedBookings: true, cancelledBookings: true },
        },
      },
    }),
    prisma.booking.aggregate({
      where: { customerId: ctx.user.id, status: 'COMPLETED' },
      _sum: { finalTotalPaisa: true },
    }),
    getNotificationPreferences(ctx.user.id),
    closureBlockers(ctx.user.id),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-display-sm text-ink-950">Profile</h1>
      <p className="mt-1 text-sm text-ink-600">Your details and account settings.</p>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Details</h2>
        <div className="mt-4">
          <ProfileForm
            initial={{ fullName: user.fullName, phone: user.phone ?? '', email: user.email }}
            emailVerified={user.emailVerifiedAt !== null}
            phoneVerified={user.phoneVerifiedAt !== null}
          />
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Verification</h2>
        <p className="mt-1 text-sm text-ink-600">
          A verified contact means booking updates reach you and the technician can get in touch.
        </p>
        <div className="mt-4">
          <VerificationPanel
            email={user.email}
            phone={user.phone}
            emailVerified={user.emailVerifiedAt !== null}
            phoneVerified={user.phoneVerifiedAt !== null}
          />
        </div>
      </section>

      {user.customerProfile ? (
        <section className="mt-5 rounded-2xl border border-ink-200 bg-surface p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Your record</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total bookings" value={String(user.customerProfile.totalBookings)} />
            <Stat label="Completed" value={String(user.customerProfile.completedBookings)} />
            <Stat label="Cancelled" value={String(user.customerProfile.cancelledBookings)} />
            <Stat
              label="Spent"
              value={stats._sum.finalTotalPaisa ? formatPaisa(stats._sum.finalTotalPaisa) : 'Rs. 0'}
            />
          </dl>
          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            Member since {formatDate(user.createdAt)}
          </p>
        </section>
      ) : null}

      <section className="mt-5 rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">How you want to be notified</h2>
        <p className="mt-1 text-sm text-ink-600">You decide how we reach you.</p>
        <div className="mt-4">
          <NotificationPreferences initial={preferences} />
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Privacy</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
          <li>
            Your full address and phone number reach the technician only after they accept the job.
          </li>
          <li>Only your first name appears on reviews.</li>
          <li>The photos you send stay in private storage.</li>
        </ul>
        <div className="mt-5 border-t border-ink-100 pt-5">
          <AccountControls blockers={blockers} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-ink-950">{value}</dd>
    </div>
  );
}
