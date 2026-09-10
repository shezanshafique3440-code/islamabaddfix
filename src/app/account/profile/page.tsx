import type { Metadata } from 'next';
import { requirePageAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { ProfileForm } from '@/components/account/ProfileForm';
import { formatDate } from '@/lib/utils';
import { formatPaisa } from '@/lib/money';

export const metadata: Metadata = { title: 'Profile', robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const ctx = await requirePageAuth('/account/profile');

  const [user, stats] = await Promise.all([
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
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-display-sm text-ink-950">Profile</h1>
      <p className="mt-1 text-sm text-ink-600">Apni maloomat aur account settings.</p>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Maloomat</h2>
        <div className="mt-4">
          <ProfileForm
            initial={{ fullName: user.fullName, phone: user.phone ?? '', email: user.email }}
            emailVerified={user.emailVerifiedAt !== null}
            phoneVerified={user.phoneVerifiedAt !== null}
          />
        </div>
      </section>

      {user.customerProfile ? (
        <section className="mt-5 rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink-900">Aapka record</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total bookings" value={String(user.customerProfile.totalBookings)} />
            <Stat label="Mukammal" value={String(user.customerProfile.completedBookings)} />
            <Stat label="Cancelled" value={String(user.customerProfile.cancelledBookings)} />
            <Stat
              label="Kharch"
              value={
                stats._sum.finalTotalPaisa ? formatPaisa(stats._sum.finalTotalPaisa) : 'Rs. 0'
              }
            />
          </dl>
          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            Member since {formatDate(user.createdAt)}
          </p>
        </section>
      ) : null}

      <section className="mt-5 rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Privacy</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
          <li>
            Aapka poora address aur phone number technician ko sirf job qubool karne ke baad milta
            hai.
          </li>
          <li>Reviews par sirf aapka pehla naam dikhta hai.</li>
          <li>Aap ki bheji hui tasveerein private storage mein rehti hain.</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-ink-950">{value}</dd>
    </div>
  );
}
