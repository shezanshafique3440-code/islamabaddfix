import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/marketing/PageHeader';
import { getSetting } from '@/lib/settings';
import { env } from '@/lib/env';
import { jsonLdScript } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Aam sawalat (FAQ)',
  description:
    'Islamabad Fix ke baare mein aam sawalat — qeemat, verification, guarantee, payment aur dispute ka nizam.',
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
          q: 'Booking kaise karun?',
          a: 'Home page par apna masla likhein ya category chunein. Phir address aur time select karein, available verified technicians dekhein aur ek chunein. Poora process do minute se kam mein ho jata hai.',
        },
        {
          q: 'Kya mujhe account banana zaroori hai?',
          a: 'Haan. Booking aapke account se juri hoti hai taake aap status track kar sakein, quote approve kar sakein aur zaroorat parne par dispute khol sakein.',
        },
        {
          q: 'Booking cancel kar sakta hoon?',
          a: `Ji haan. Scheduled waqt se ${Math.round(freeCancelMinutes / 60)} ghante pehle tak cancel karna free hai. Uske baad late cancellation fee laagu ho sakti hai — cancel karte waqt aap ko saaf dikh jayegi.`,
        },
        {
          q: 'Technician na aaye to?',
          a: 'Booking par dispute khol dein aur wajah mein "Technician nahi aaya" chunein. Ops team dono taraf se baat kar ke faisla karti hai aur zaroorat ho to refund ya dobara visit ka intezam karti hai.',
        },
      ],
    },
    {
      heading: 'Qeemat aur payment',
      items: [
        {
          q: 'Site par jo qeemat likhi hai wohi lagegi?',
          a: 'Nahi. Site par di gayi ranges sirf andaza hain. Asal qeemat technician muaina ke baad likhit quote mein deta hai, jise aap approve ya reject karte hain.',
        },
        {
          q: 'Kaam ke beech mein qeemat barh sakti hai?',
          a: 'Aapki ijazat ke baghair nahi. Agar technician ko koi extra kaam ya part chahiye to woh alag "additional charges" quote bhejta hai. Jab tak aap approve nahi karte, kaam complete mark nahi ho sakta.',
        },
        {
          q: 'Payment kaise hoti hai?',
          a: 'Filhaal Cash on Service available hai — kaam mukammal hone par technician ko cash dein aur app mein payment record karein. Online payment aur bank transfer ka nizam bana hua hai aur baad mein enable hoga.',
        },
        {
          q: 'Platform kitna commission leta hai?',
          a: `Har mukammal booking par ${commissionBp / 100}% commission provider ki earning se katta hai. Aap se is ka koi alag charge nahi hota.`,
        },
      ],
    },
    {
      heading: 'Trust aur guarantee',
      items: [
        {
          q: '"Verified" ka theek theek kya matlab hai?',
          a: 'Iska matlab hai ke humari team ne provider ka shanakhti document aur onboarding maloomat check ki hain, aur unka phone aur email confirm hua hai. Profile par sirf wohi badge dikhta hai jo waqai verify hua ho. Hum government licensing, insurance ya police background check ka dawa nahi karte.',
        },
        {
          q: guaranteeEnabled
            ? `${guaranteeDays}-din guarantee kaise kaam karti hai?`
            : 'Guarantee available hai?',
          a: guaranteeEnabled
            ? `Eligible services par kaam mukammal hone ke baad ${guaranteeDays} din tak, agar wohi masla wapis aa jaye to aap re-visit claim kar sakte hain. Har service cover nahi hoti — booking par saaf likha hota hai ke guarantee laagu hai ya nahi. Har claim ka jaiza ops team karti hai.`
            : 'Guarantee program is waqt band hai. Kaam se mutmain na hon to aap booking par dispute khol sakte hain.',
        },
        {
          q: 'Mera address aur phone number kis ko dikhta hai?',
          a: 'Job qubool karne se pehle technician ko sirf aapka area (sector) dikhta hai. Poora address aur phone number tab share hota hai jab woh job accept kar leta hai. Aapki maloomat kabhi public profile par nahi aati.',
        },
        {
          q: 'Review kaun de sakta hai?',
          a: 'Sirf woh customer jiski booking mukammal hui ho, aur har booking par ek hi baar. Is liye yahan reviews un logon ke hain jinhone waqai kaam karwaya.',
        },
      ],
    },
    {
      heading: 'Providers ke liye',
      items: [
        {
          q: 'Provider kaise banun?',
          a: 'Provider signup se account banayein, apni services, areas, rates aur working hours daalein, aur shanakhti document submit karein. Team review kar ke approve karti hai — approve hone tak aapki profile customers ko nahi dikhti.',
        },
        {
          q: 'Approval mein kitna waqt lagta hai?',
          a: 'Yeh manual review hai, is liye waqt team ke workload par hai. Status aap ko app mein aur notification par mil jata hai.',
        },
        {
          q: 'Paise kab milte hain?',
          a: 'Cash bookings mein paise seedhe aap ko customer se milte hain; platform commission aapke earnings dashboard par record hota hai. Payout records bhi wahin dikhte hain.',
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
        title="Aam sawalat"
        description="Qeemat, verification, guarantee aur payment ke baare mein woh sawal jo sab poochte hain."
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
                        className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
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
          Jawab nahi mila?{' '}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Support se rabta karein
          </Link>{' '}
          ya{' '}
          <a
            href={`${env.NEXT_PUBLIC_APP_URL}/account/support/new`}
            className="font-medium text-brand-700 hover:underline"
          >
            ticket kholein
          </a>
          .
        </p>
      </div>
    </>
  );
}
