import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Islamabad Fix uses your information and keeps it safe.',
  alternates: { canonical: '/privacy' },
};

export default async function PrivacyPage() {
  const email = await getSetting('platform.supportEmail');

  return (
    <>
      <PageHeader
        title="Privacy Policy"
        description="What we hold, who we share it with, and how we keep it safe."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="text-sm leading-relaxed text-warn-700">
            This is a plain summary written for the MVP. It must be reviewed by a lawyer before
            commercial launch.
          </p>
        </div>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-ink-700">
          {[
            {
              h: 'What information we hold',
              p: [
                'Customers: name, email, phone number, addresses, booking details, uploaded photos and videos, payment records and reviews.',
                'Providers: name, business name, phone, email, service areas, rates, working hours, identity document, and payout account details.',
                'Technical: sign-in times, IP address and browser, for security and audit.',
              ],
            },
            {
              h: 'Who we share it with',
              p: [
                'Your full address and phone number are shown to a technician only once they accept your job. Before that they see your area and nothing more.',
                'A provider’s personal details (phone, home address, bank details) never appear on the public profile. The customer gets the technician’s contact number once the booking is assigned.',
                'Verification documents can be seen only by the provider themselves and our ops team. Never by customers.',
                'Only the first name appears on reviews, not the full name.',
              ],
            },
            {
              h: 'Location',
              p: [
                'A provider’s live location is only recorded when they turn sharing on themselves. Turning sharing off also erases the earlier record.',
                'On the ops map a customer’s location is shown on a roughly 1 km grid, not precisely.',
              ],
            },
            {
              h: 'Payment details',
              p: [
                'We do not store card numbers, CVVs or any raw payment credentials.',
                'Only the last 4 digits and a hash of a provider’s bank account are kept — the full IBAN is never shown back to anyone, not even the provider.',
                'The full CNIC number is not stored; only a masked reference is kept.',
              ],
            },
            {
              h: 'Files and photos',
              p: [
                'The photos and videos you send stay in private storage. Only people connected to that booking can see them: you, the assigned technician, and the operations team.',
                'Permission is checked on every file request — there are no public links.',
              ],
            },
            {
              h: 'Security',
              p: [
                'Passwords are stored hashed (bcrypt). Login sessions run on short-lived tokens that rotate on refresh.',
                'Significant admin actions (provider approval, refunds, settings changes) are recorded in the audit log.',
              ],
            },
            {
              h: 'Your rights',
              p: [
                'You can see your information, correct it, and close your account.',
                'Booking and payment records may be retained to meet legal and accounting requirements.',
              ],
            },
            {
              h: 'Contact',
              p: [`Privacy questions: ${email}`],
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
