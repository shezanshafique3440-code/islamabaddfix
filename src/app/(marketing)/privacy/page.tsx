import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Islamabad Fix aapki maloomat kaise istemal karta hai aur kaise mahfooz rakhta hai.',
  alternates: { canonical: '/privacy' },
};

export default async function PrivacyPage() {
  const email = await getSetting('platform.supportEmail');

  return (
    <>
      <PageHeader
        title="Privacy Policy"
        description="Hum kya maloomat rakhte hain, kis ko dikhate hain, aur kaise mahfooz rakhte hain."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="text-sm leading-relaxed text-warn-700">
            Yeh MVP ke liye tayyar kiya gaya saada summary hai. Commercial launch se pehle isay
            wakeel se review karwana zaroori hai.
          </p>
        </div>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-ink-700">
          {[
            {
              h: 'Kya maloomat hum rakhte hain',
              p: [
                'Customers: naam, email, phone number, addresses, booking ki tafseelat, upload ki gayi tasveerein/videos, payment record aur reviews.',
                'Providers: naam, business naam, phone, email, service areas, rates, working hours, shanakhti document, aur payout account ki maloomat.',
                'Technical: login ka waqt, IP address aur browser, security aur audit ke liye.',
              ],
            },
            {
              h: 'Hum kis ko dikhate hain',
              p: [
                'Aapka poora address aur phone number technician ko sirf us waqt dikhta hai jab woh aapki job qubool kar leta hai. Us se pehle sirf aapka area dikhta hai.',
                'Provider ki personal maloomat (phone, ghar ka address, bank details) public profile par kabhi nahi aati. Customer ko technician ka contact number booking assign hone ke baad milta hai.',
                'Verification documents sirf provider khud aur humari ops team dekh sakti hai. Customers kabhi nahi.',
                'Reviews par sirf pehla naam dikhta hai, poora naam nahi.',
              ],
            },
            {
              h: 'Location',
              p: [
                'Provider ki live location tab hi record hoti hai jab woh khud sharing on kare. Sharing off karne par purana record bhi mita diya jata hai.',
                'Ops map par customer ki location tafseel se nahi, taqreeban 1 km ke grid par dikhayi jati hai.',
              ],
            },
            {
              h: 'Payment maloomat',
              p: [
                'Hum card number, CVV ya koi raw payment credential store nahi karte.',
                'Provider ke bank account ka sirf aakhri 4 hindse aur ek hash rakha jata hai — poora IBAN kisi ko, provider ko bhi, wapis nahi dikhaya jata.',
                'CNIC ka poora number store nahi hota; sirf ek masked reference rakha jata hai.',
              ],
            },
            {
              h: 'Files aur tasveerein',
              p: [
                'Aap ki bheji hui tasveerein aur videos private storage mein rehti hain. Unhe sirf woh log dekh sakte hain jo us booking se mutalliq hain: aap, assigned technician, aur ops team.',
                'Har file request par ijazat check hoti hai — koi public link mojood nahi.',
              ],
            },
            {
              h: 'Security',
              p: [
                'Passwords hash form mein rakhe jate hain (bcrypt). Login sessions short-lived tokens se chalte hain jo refresh par rotate hote hain.',
                'Ahem admin karwai (provider approval, refund, settings ki tabdeeli) audit log mein darj hoti hai.',
              ],
            },
            {
              h: 'Aap ke haqooq',
              p: [
                'Aap apni maloomat dekh, theek kar aur account band karwa sakte hain.',
                'Booking aur payment ka record qanooni aur accounting zaroorat ke tehat mehfooz rakha ja sakta hai.',
              ],
            },
            {
              h: 'Rabta',
              p: [`Privacy se mutalliq sawalat: ${email}`],
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
