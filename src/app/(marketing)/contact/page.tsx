import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';
import { getAuthContext } from '@/lib/auth/session';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Contact Islamabad Fix support — by phone, email or a support ticket.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const [phone, email, ctx] = await Promise.all([
    getSetting('platform.supportPhone'),
    getSetting('platform.supportEmail'),
    getAuthContext(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Contact us"
        description="Need help with a booking, a quote, a payment or anything else? Tell us."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className="rounded-2xl border border-ink-200 bg-white p-5 transition-shadow hover:shadow-card"
          >
            <p className="text-eyebrow uppercase text-ink-500">Phone</p>
            <p className="mt-2 text-lg font-semibold text-ink-950">{phone}</p>
            <p className="mt-1 text-sm text-ink-600">For bookings and urgent problems</p>
          </a>

          <a
            href={`mailto:${email}`}
            className="rounded-2xl border border-ink-200 bg-white p-5 transition-shadow hover:shadow-card"
          >
            <p className="text-eyebrow uppercase text-ink-500">Email</p>
            <p className="mt-2 break-all text-lg font-semibold text-ink-950">{email}</p>
            <p className="mt-1 text-sm text-ink-600">For detailed questions</p>
          </a>
        </div>

        <div className="mt-8 rounded-2xl border border-ink-200 bg-ink-50/60 p-6">
          <h2 className="text-title text-ink-950">Support ticket</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Is the problem about a booking? Open a ticket — you can pick the booking in it, attach
            evidence and track the status.
          </p>
          <div className="mt-4">
            {ctx ? (
              <ButtonLink href="/account/support/new">Open a ticket</ButtonLink>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href="/login?next=/account/support/new">
                  Sign in to open a ticket
                </ButtonLink>
                <span className="text-sm text-ink-500">
                  No account?{' '}
                  <Link href="/register" className="font-medium text-brand-700 hover:underline">
                    Register
                  </Link>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-alert-200 bg-alert-50 p-6">
          <h2 className="text-sm font-semibold text-alert-700">Emergency</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            If there is a fire, a gas leak or anyone is injured, call{' '}
            <strong className="font-semibold">Rescue 1122</strong> first. After that we can arrange
            an emergency technician.
          </p>
        </div>
      </div>
    </>
  );
}
