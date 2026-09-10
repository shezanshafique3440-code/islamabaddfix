import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Islamabad Fix ke istemal ki shartein.',
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
        description="Saada alfaz mein: hum kya karte hain, aap se kya tawaqqo hai, aur zimmedari kis ki hai."
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="text-sm leading-relaxed text-warn-700">
            Yeh MVP ke liye tayyar kiya gaya saada summary hai. Commercial launch se pehle isay
            Pakistani qanoon ke mutabiq wakeel se review karwana zaroori hai.
          </p>
        </div>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-ink-700">
          {[
            {
              h: '1. Islamabad Fix ka kirdar',
              p: [
                'Islamabad Fix ek marketplace platform hai. Hum customers ko independent service providers se milate hain aur booking, quote, payment record, review aur dispute ka nizam chalate hain.',
                'Hum khud repair ya service ka kaam nahi karte, aur providers humare mulazim nahi hain. Kaam ki quality aur usay mukammal karne ki zimmedari provider ki hai.',
              ],
            },
            {
              h: '2. Account',
              p: [
                'Aap durust maloomat dene ke zimmedar hain, aur apna password mahfooz rakhna aapki zimmedari hai.',
                'Ek shakhs ek hi account rakhe. Ghalat maloomat, dhoka ya doosron ko nuqsan pohanchane ki soorat mein hum account band kar sakte hain.',
              ],
            },
            {
              h: '3. Booking aur qeemat',
              p: [
                'Site par di gayi qeematein sirf andaza hain. Asal qeemat provider ke likhit quote se tay hoti hai jise aap approve karte hain.',
                'Quote approve karne ke baad koi bhi extra charge aapki alag approval ke baghair laagu nahi hoga.',
                'Booking cancel karne ki policy platform settings mein di gayi hai aur cancel karte waqt aap ko dikha di jati hai.',
              ],
            },
            {
              h: '4. Payment aur commission',
              p: [
                'Filhaal payment kaam mukammal hone par cash se hoti hai. Payment record app mein rakha jata hai.',
                `Platform har mukammal booking par ${commissionBp / 100}% commission provider ki earning se leta hai. Customer par is ka alag charge nahi hai.`,
              ],
            },
            {
              h: '5. Service guarantee',
              p: [
                `Eligible services par kaam mukammal hone ke baad ${guaranteeDays} din tak re-visit claim kiya ja sakta hai. Har service is mein shamil nahi — booking par saaf likha hota hai ke guarantee laagu hai ya nahi.`,
                'Har claim ka jaiza ops team karti hai. Guarantee ka matlab har surat mein muft dobara kaam nahi hai.',
              ],
            },
            {
              h: '6. Verification ki hadood',
              p: [
                'Hum providers ki shanakht aur onboarding maloomat ka jaiza lete hain aur profile par sirf wohi badge dikhate hain jo verify hua ho.',
                'Hum government licensing, insurance, professional certification ya police background check ka dawa nahi karte.',
              ],
            },
            {
              h: '7. Zimmedari',
              p: [
                'Provider ke kaam se hone wale nuqsan ki soorat mein aap dispute khol sakte hain. Hum dono taraf se maloomat le kar munasib faisla karne ki koshish karte hain, jismein refund ya dobara visit shamil ho sakta hai.',
                'Platform ki zimmedari us booking ki raqam tak mahdood hai. Hum kisi ghair-mutalliq ya baad mein hone wale nuqsan ke zimmedar nahi.',
              ],
            },
            {
              h: '8. Mana kaam',
              p: [
                'Platform ka istemal ghair-qanooni kaam, dhoke, kisi ko harass karne, ya jhoote reviews ke liye mana hai.',
                'Providers apne kaam mein safety ka khayal rakhne ke paband hain aur khatarnaak kaam ke liye munasib ehtiyat lazim hai.',
              ],
            },
            {
              h: '9. Tabdeeli',
              p: [
                'Hum yeh shartein waqtan fawaqtan update kar sakte hain. Ahem tabdeeli par aap ko notification bhej di jayegi.',
              ],
            },
            {
              h: '10. Rabta',
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
