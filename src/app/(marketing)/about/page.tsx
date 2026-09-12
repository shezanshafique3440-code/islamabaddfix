import type { Metadata } from 'next';
import { PageHeader } from '@/components/marketing/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { getSetting } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Humare baare mein',
  description:
    'Islamabad Fix ek marketplace hai jo Islamabad ke gharon aur businesses ko verified service providers se milata hai.',
  alternates: { canonical: '/about' },
};

export default async function AboutPage() {
  const city = await getSetting('platform.city');

  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Humare baare mein"
        description={`${city} mein ghar aur business ki services ko qabil-e-bharosa banane ki koshish.`}
        breadcrumbs={[{ href: '/', label: 'Home' }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="space-y-8 text-[0.9375rem] leading-relaxed text-ink-700">
          <section>
            <h2 className="text-title text-ink-950">Masla kya hai</h2>
            <p className="mt-3">
              {city} mein acha technician dhoondna aaj bhi jaan-pehchan ka kaam hai. Kisi se number
              maangna parta hai, qeemat ka koi andaza nahi hota, aur kaam kharab ho jaye to koi
              jawab-deh nahi hota. Doosri taraf mehnati technicians ke paas kaam ki kami rehti hai
              kyunke unhe naye customers tak pohanchne ka koi zariya nahi.
            </p>
          </section>

          <section>
            <h2 className="text-title text-ink-950">Hum kya karte hain</h2>
            <p className="mt-3">
              Islamabad Fix ek marketplace hai. Hum customers aur independent service providers ko
              ek jagah laate hain, aur beech ka nizam chalate hain: booking, likhit quote, status
              tracking, payment record, review aur dispute resolution.
            </p>
            <p className="mt-3">
              Hum har provider ki shanakht aur onboarding maloomat ka jaiza lete hain. Jo check hota
              hai sirf wohi badge profile par dikhta hai — is se zyada ka dawa hum nahi karte.
            </p>
          </section>

          <section>
            <h2 className="text-title text-ink-950">Jo hum nahi hain</h2>
            <ul className="mt-3 space-y-2">
              <li>
                Hum technicians ko mulazim nahi rakhte. Woh khud-mukhtar professionals hain jo apni
                services khud offer karte hain aur apne rate khud tay karte hain.
              </li>
              <li>
                Hum government licensing, insurance ya police background check ka dawa nahi karte.
              </li>
              <li>
                Hum qeemat khud tay nahi karte. Site par jo ranges hain woh sirf andaza hain; asal
                qeemat provider ke quote se tay hoti hai jise aap approve karte hain.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-title text-ink-950">Kahan available hai</h2>
            <p className="mt-3">
              Filhaal {city} mein. Service areas admin panel se manage hote hain, is liye naye
              sectors add karna aasan hai. Aap ka area list mein na ho to humein bata dein.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/book">Service book karein</ButtonLink>
          <ButtonLink href="/contact" variant="outline">
            Rabta karein
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
