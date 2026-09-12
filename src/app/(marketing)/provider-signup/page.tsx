import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { getSetting } from '@/lib/settings';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Provider banein — apna service business grow karein',
  description:
    'Islamabad mein apna service business grow karein. Naye customers, digital profile, booking management aur earnings dashboard — mehngi marketing ke baghair.',
  alternates: { canonical: '/provider-signup' },
};

export default async function ProviderSignupPage() {
  const [city, commissionBp, categories] = await Promise.all([
    getSetting('platform.city'),
    getSetting('platform.commissionRateBp'),
    prisma.serviceCategory.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { name: true },
    }),
  ]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-200">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(55%_55%_at_85%_0%,theme(colors.brand.50)_0%,transparent_100%)]"
        />
        <div className="relative mx-auto max-w-content px-4 py-14 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-eyebrow uppercase text-brand-700">Providers ke liye</p>
            <h1 className="mt-2.5 text-display-sm text-ink-950 sm:text-display">
              {city} mein apna service business grow karein.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-600 sm:text-lg">
              Aap ka kaam acha hai — bas customers tak pohanchne ka zariya chahiye. Islamabad Fix
              par apni profile banayein, jobs receive karein aur apni earnings track karein.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/register?role=provider" size="lg">
                Join Islamabad Fix
              </ButtonLink>
              <ButtonLink href="#kaise" variant="outline" size="lg">
                Kaise kaam karta hai
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-500">
              Pehle se account hai?{' '}
              <Link href="/login" className="font-medium text-brand-700 hover:underline">
                Login karein
              </Link>
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
        <section aria-labelledby="benefits">
          <h2 id="benefits" className="text-display-sm text-ink-950">
            Aap ko kya milta hai
          </h2>
          <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Zyada customers',
                body: 'Log Islamabad mein service dhoondte waqt aapki profile dekhte hain — jaan-pehchan ki zaroorat nahi.',
              },
              {
                title: 'Digital profile',
                body: 'Aapki rating, mukammal jobs, tajurba aur verification badges ek jagah — aapka online sarmaya.',
              },
              {
                title: 'Booking management',
                body: 'Aaj ki jobs, address, masla, tasveerein aur time — sab ek dashboard par.',
              },
              {
                title: 'Likhit quotes',
                body: 'Inspection, labour aur parts alag likh kar quote bhejein. Approve hone par hi kaam shuru.',
              },
              {
                title: 'Earnings dashboard',
                body: 'Aaj, is hafte aur is mahine ki kamai, commission aur pending payout saaf dikhte hain.',
              },
              {
                title: 'Reviews',
                body: 'Acha kaam reviews banata hai, aur reviews aap ko matching mein oopar laate hain.',
              },
            ].map((benefit) => (
              <li key={benefit.title}>
                <h3 className="text-[0.9375rem] font-semibold text-ink-900">{benefit.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{benefit.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="kaise" className="mt-16 scroll-mt-20">
          <h2 className="text-display-sm text-ink-950">Shuru kaise karein</h2>
          <ol className="mt-7 space-y-6">
            {[
              {
                title: 'Account banayein',
                body: 'Naam, phone aur email se provider account banayein.',
              },
              {
                title: 'Profile mukammal karein',
                body: 'Apni services aur starting rates, service areas, working hours aur tajurba daalein. Shanakhti document bhi attach karein.',
              },
              {
                title: 'Review ka intezar karein',
                body: 'Humari team aapki maloomat check karti hai. Approve hone tak aapki profile customers ko nahi dikhti — is se badge ka matlab barqarar rehta hai.',
              },
              {
                title: 'Jobs receive karein',
                body: 'Approve hone ke baad aap ko matching jobs offer hoti hain. Accept karein, muaina karein, quote bhejein aur kaam mukammal karein.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <h2 className="text-title text-ink-950">Kharcha kitna hai</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Profile banane ya listing ki koi fee nahi. Platform sirf mukammal booking par{' '}
              <strong className="font-semibold text-ink-900">
                {commissionBp / 100}% commission
              </strong>{' '}
              leta hai, jo aapki earning se katta hai. Kaam na ho to kuch bhi nahi.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Commission rate platform settings mein rakha jata hai aur har booking par mukammal
              hone ke waqt ka rate freeze ho jata hai — baad mein rate badle to purani bookings par
              asar nahi hota.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <h2 className="text-title text-ink-950">Kaunsi services?</h2>
            <p className="mt-3 text-sm text-ink-700">
              In categories mein providers ki zaroorat hai:
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <span
                  key={category.name}
                  className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700"
                >
                  {category.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-14 rounded-2xl bg-ink-950 p-8 text-center text-white">
          <h2 className="text-display-sm">Shuru karne ke liye tayyar hain?</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-300">
            Account banane mein do minute lagte hain. Profile mukammal karne ke baad review shuru ho
            jati hai.
          </p>
          <ButtonLink
            href="/register?role=provider"
            size="lg"
            className="mt-6 bg-white text-ink-950 hover:bg-ink-100"
          >
            Join Islamabad Fix
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
