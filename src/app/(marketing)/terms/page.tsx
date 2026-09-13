import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using Islamabad Fix.',
  alternates: { canonical: '/terms' },
};

/**
 * Plain-language terms.
 *
 * Written to state exactly what the platform does and does not do. This is a
 * good-faith summary for an MVP, not a substitute for legal review before
 * commercial launch — the page says so.
 */
export default async function TermsPage() {
  const [commissionBp, guaranteeDays, email] = await Promise.all([
    getSetting('platform.commissionRateBp'),
    getSetting('guarantee.days'),
    getSetting('platform.supportEmail'),
  ]);

  return (
    <>
      <PageHeader
        title="Terms of Service"
        description="In plain words: what we do, what is expected of you, and who is responsible for what."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="text-sm leading-relaxed text-warn-700">
            This is a plain summary written for the MVP. It must be reviewed by a lawyer under
            Pakistani law before commercial launch.
          </p>
        </div>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-ink-700">
          {[
            {
              h: '1. The role of Islamabad Fix',
              p: [
                'Islamabad Fix is a marketplace platform. We connect customers with independent service providers and run the booking, quote, payment record, review and dispute system.',
                'We do not carry out repair or service work ourselves, and providers are not our employees. The quality and completion of the work are the provider’s responsibility.',
              ],
            },
            {
              h: '2. Account',
              p: [
                'You are responsible for giving accurate information, and for keeping your password safe.',
                'One person, one account. We may close an account for false information, fraud or harm to others.',
              ],
            },
            {
              h: '3. Bookings and pricing',
              p: [
                'The prices shown on the site are estimates only. The actual price is set by the provider’s written quote, which you approve.',
                'After you approve the quote, no extra charge applies without your separate approval.',
                'The cancellation policy is set in platform settings and is shown to you when you cancel.',
              ],
            },
            {
              h: '4. Payment and commission',
              p: [
                'For now payment is in cash when the work is complete. The payment record is kept in the app.',
                `The platform takes ${commissionBp / 100}% commission from the provider’s earnings on every completed booking. There is no separate charge to the customer.`,
              ],
            },
            {
              h: '5. Service guarantee',
              p: [
                `On eligible services you can claim a re-visit for ${guaranteeDays} days after the work is completed. Not every service is covered — each booking states clearly whether the guarantee applies.`,
                'Every claim is reviewed by the ops team. The guarantee does not mean free repeat work in every case.',
              ],
            },
            {
              h: '6. The limits of verification',
              p: [
                'We review providers’ identity and onboarding details, and show only the badges on a profile that have actually been verified.',
                'We do not claim government licensing, insurance, professional certification or police background checks.',
              ],
            },
            {
              h: '7. Liability',
              p: [
                'If a provider’s work causes damage, you can open a dispute. We hear both sides and try to reach a fair decision, which may include a refund or a repeat visit.',
                'The platform’s liability is limited to the amount of that booking. We are not liable for any indirect or consequential loss.',
              ],
            },
            {
              h: '8. Prohibited use',
              p: [
                'Using the platform for anything illegal, for fraud, to harass anyone, or to post fake reviews is prohibited.',
                'Providers are required to work safely and to take proper precautions on hazardous work.',
              ],
            },
            {
              h: '9. Changes',
              p: [
                'We may update these terms from time to time. You will be notified of any significant change.',
              ],
            },
            {
              h: '10. Contact',
              p: [`Sawalat ke liye: ${email}`],
            },
          ].map((section) => (
            <section key={section.h}>
              <h2 className="text-[0.9375rem] font-semibold text-ink-950">{section.h}</h2>
              {section.p.map((paragraph, index) => (
                <p key={index} className="mt-2">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
