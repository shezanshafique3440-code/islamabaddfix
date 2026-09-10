import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';
import { getAuthContext } from '@/lib/auth/session';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Rabta karein',
  description: 'Islamabad Fix support se rabta karein — phone, email ya support ticket ke zariye.',
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
        title="Rabta karein"
        description="Booking, quote, payment ya kisi bhi masle mein madad chahiye? Humein batayein."
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
            <p className="mt-1 text-sm text-ink-600">Booking aur urgent masail ke liye</p>
          </a>

          <a
            href={`mailto:${email}`}
            className="rounded-2xl border border-ink-200 bg-white p-5 transition-shadow hover:shadow-card"
          >
            <p className="text-eyebrow uppercase text-ink-500">Email</p>
            <p className="mt-2 break-all text-lg font-semibold text-ink-950">{email}</p>
            <p className="mt-1 text-sm text-ink-600">Tafseeli sawalat ke liye</p>
          </a>
        </div>

        <div className="mt-8 rounded-2xl border border-ink-200 bg-ink-50/60 p-6">
          <h2 className="text-title text-ink-950">Support ticket</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Kisi booking se related masla hai? Ticket khol dein — usmein aap booking select kar
            sakte hain, evidence attach kar sakte hain aur status track kar sakte hain.
          </p>
          <div className="mt-4">
            {ctx ? (
              <ButtonLink href="/account/support/new">Ticket kholein</ButtonLink>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href="/login?next=/account/support/new">
                  Login kar ke ticket kholein
                </ButtonLink>
                <span className="text-sm text-ink-500">
                  Account nahi hai?{' '}
                  <Link href="/register" className="font-medium text-brand-700 hover:underline">
                    Register karein
                  </Link>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-alert-200 bg-alert-50 p-6">
          <h2 className="text-sm font-semibold text-alert-700">Emergency</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Aag, gas leak, ya kisi ke zakhmi hone ki soorat mein pehle{' '}
            <strong className="font-semibold">Rescue 1122</strong> ko call karein. Iske baad hum
            emergency technician ka intezam kar sakte hain.
          </p>
        </div>
      </div>
    </>
  );
}
