import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { Logo } from './Logo';

/**
 * Site footer.
 *
 * The service links are generated from the live catalogue, so a category added
 * in the admin panel appears here — and in the sitemap — without a code change.
 */
export async function SiteFooter() {
  const [categories, supportPhone, supportEmail, city] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, slug: true },
      take: 8,
    }),
    getSetting('platform.supportPhone'),
    getSetting('platform.supportEmail'),
    getSetting('platform.city'),
  ]);

  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-ink-200 bg-ink-50/60">
      <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo showTagline />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-600">
              Home and business services in {city} — verified professionals, transparent quotes aur
              asaan booking.
            </p>
          </div>

          <nav aria-label="Services">
            <h2 className="text-eyebrow uppercase text-ink-500">Services</h2>
            <ul className="mt-3 space-y-2">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/services/${category.slug}`}
                    className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="text-eyebrow uppercase text-ink-500">Company</h2>
            <ul className="mt-3 space-y-2">
              {[
                { href: '/about', label: 'About us' },
                { href: '/how-it-works', label: 'How it works' },
                { href: '/membership', label: 'Membership' },
                { href: '/provider-signup', label: 'Become a provider' },
                { href: '/providers', label: 'Technicians' },
                { href: '/contact', label: 'Contact us' },
                { href: '/faq', label: 'FAQ' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-600 hover:text-brand-700 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-eyebrow uppercase text-ink-500">Support</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li>
                <a
                  href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                  className="hover:text-brand-700"
                >
                  {supportPhone}
                </a>
              </li>
              <li>
                <a href={`mailto:${supportEmail}`} className="hover:text-brand-700">
                  {supportEmail}
                </a>
              </li>
              <li className="pt-1">
                <Link href="/emergency" className="font-medium text-alert-600 hover:underline">
                  Emergency service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/*
          Marketplace disclosure. Section 60 of the brief is explicit: providers
          are independent, and the platform must not imply employment,
          licensing or insurance it does not provide.
        */}
        <div className="mt-10 border-t border-ink-200 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-ink-500">
            Islamabad Fix is a marketplace. The service providers listed here are independent
            professionals, not employees of Islamabad Fix. We review providers’ identity and
            onboarding details; we do not claim government licensing, insurance or background
            checks. The price of every job is set by the provider’s quote.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-500">© {year} Islamabad Fix. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-ink-500">
              <Link href="/terms" className="hover:text-brand-700 hover:underline">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-brand-700 hover:underline">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
