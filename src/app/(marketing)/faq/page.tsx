import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';
import { env } from '@/lib/env';
import { jsonLdScript } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Common questions (FAQ)',
  description:
    'Common questions about Islamabad Fix — pricing, verification, the guarantee, payments and how disputes work.',
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const [guaranteeDays, guaranteeEnabled, commissionBp, freeCancelMinutes] = await Promise.all([
    getSetting('guarantee.days'),
    getSetting('guarantee.enabled'),
    getSetting('platform.commissionRateBp'),
    getSetting('booking.freeCancellationMinutes'),
  ]);

  const sections: Array<{ heading: string; items: Array<{ q: string; a: string }> }> = [
    {
      heading: 'Booking',
      items: [
        {
          q: 'How do I make a booking?',
          a: 'Describe your problem on the home page or pick a category. Then choose an address and time, see the verified technicians available and pick one. The whole thing takes under two minutes.',
        },
        {
          q: 'Do I need to create an account?',
          a: 'Yes. A booking is tied to your account so you can track its status, approve the quote and open a dispute if you need to.',
        },
        {
          q: 'Can I cancel a booking?',
          a: `Yes. Cancelling is free up to ${Math.round(freeCancelMinutes / 60)} hours before the scheduled time. After that a late cancellation fee may apply — it is shown clearly when you cancel.`,
        },
        {
          q: 'What if the technician does not turn up?',
          a: 'Open a dispute on the booking and pick "The technician did not turn up" as the reason. The ops team hears both sides and decides, arranging a refund or a repeat visit if needed.',
        },
      ],
    },
    {
      heading: 'Pricing and payment',
      items: [
        {
          q: 'Will I be charged the price shown on the site?',
          a: 'No. The ranges on the site are estimates only. The actual price comes in the technician’s written quote after inspection, which you approve or reject.',
        },
        {
          q: 'Can the price go up midway through the work?',
          a: 'Not without your permission. If the technician needs extra work or a part, they send a separate "additional charges" quote. The job cannot be marked complete until you approve it.',
        },
        {
          q: 'How does payment work?',
          a: 'Cash on Service is available for now — pay the technician in cash when the work is done and record the payment in the app. Online payment and bank transfer are built and will be enabled later.',
        },
        {
          q: 'How much commission does the platform take?',
          a: `On every completed booking, ${commissionBp / 100}% commission is deducted from the provider’s earnings. You are not charged separately for it.`,
        },
      ],
    },
    {
      heading: 'Trust and guarantee',
      items: [
        {
          q: 'What exactly does "Verified" mean?',
          a: 'It means our team has checked the provider’s identity document and onboarding details, and confirmed their phone and email. Only badges that have actually been verified appear on a profile. We do not claim government licensing, insurance or police background checks.',
        },
        {
          q: guaranteeEnabled
            ? `How does the ${guaranteeDays}-day guarantee work?`
            : 'Is there a guarantee?',
          a: guaranteeEnabled
            ? `On eligible services, if the same problem returns within ${guaranteeDays} days of completion, you can claim a re-visit. Not every service is covered — each booking states clearly whether the guarantee applies. Every claim is reviewed by the ops team.`
            : 'The guarantee programme is currently switched off. If you are not satisfied with the work, you can open a dispute on the booking.',
        },
        {
          q: 'Who can see my address and phone number?',
          a: 'Before accepting a job, the technician sees only your area (sector). Your full address and phone number are shared once they accept. Your details never appear on a public profile.',
        },
        {
          q: 'Who can leave a review?',
          a: 'Only a customer whose booking was completed, and only once per booking. That is why the reviews here come from people who actually had the work done.',
        },
      ],
    },
    {
      heading: 'For providers',
      items: [
        {
          q: 'How do I become a provider?',
          a: 'Create an account through provider signup, add your services, areas, rates and working hours, and submit an identity document. The team reviews and approves — until you are approved, your profile is not shown to customers.',
        },
        {
          q: 'How long does approval take?',
          a: 'This is a manual review, so the time depends on the team’s workload. You get the status in the app and by notification.',
        },
        {
          q: 'When do I get paid?',
          a: 'On cash bookings you take the money directly from the customer; the platform commission is recorded on your earnings dashboard. Payout records appear there too.',
        },
      ],
    },
  ];

  /* FAQPage structured data, generated from the same content shown above. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: sections.flatMap((section) =>
      section.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <PageHeader
        eyebrow="FAQ"
        title="Common questions"
        description="The questions everyone asks about pricing, verification, the guarantee and payment."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-title text-ink-950">{section.heading}</h2>
              <div className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
                {section.items.map((item) => (
                  <details key={item.q} className="group py-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 text-[0.9375rem] font-medium text-ink-900 marker:content-none">
                      {item.q}
                      <svg
                        viewBox="0 0 20 20"
                        className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M5.2 7.5 10 12.3l4.8-4.8-1.1-1.1L10 10.1 6.3 6.4 5.2 7.5Z" />
                      </svg>
                    </summary>
                    <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-ink-600">
          Did not find your answer?{' '}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Contact support
          </Link>{' '}
          ya{' '}
          <a
            href={`${env.NEXT_PUBLIC_APP_URL}/account/support/new`}
            className="font-medium text-brand-700 hover:underline"
          >
            open a ticket
          </a>
          .
        </p>
      </div>
    </>
  );
}
