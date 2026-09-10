import Link from 'next/link';
import type { ProviderStatus } from '@prisma/client';

/**
 * Status banner.
 *
 * A provider must always know whether customers can see them. Pending is stated
 * plainly rather than glossed over, because a provider who thinks they are live
 * and is not will conclude the platform is broken.
 */
export function ProviderStatusBanner({
  status,
  businessName,
  rejectedReason,
  suspendedReason,
  servicesCount,
  areasCount,
}: {
  status: ProviderStatus;
  businessName: string;
  rejectedReason: string | null;
  suspendedReason: string | null;
  servicesCount: number;
  areasCount: number;
}) {
  if (status === 'VERIFIED') return null;

  if (status === 'PENDING_VERIFICATION') {
    const incomplete = servicesCount === 0 || areasCount === 0;
    return (
      <div className="mb-6 rounded-2xl border border-warn-200 bg-warn-50 p-5">
        <h2 className="text-[0.9375rem] font-semibold text-warn-700">
          Aapki profile review mein hai
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
          {incomplete
            ? 'Profile abhi mukammal nahi hai. Kam az kam ek service aur ek service area zaroori hai, warna review shuru nahi ho sakti.'
            : `${businessName} ki maloomat humari team check kar rahi hai. Approve hone tak aap ki profile customers ko nahi dikhti aur nayi jobs nahi aayengi.`}
        </p>
        <Link
          href="/provider/onboarding"
          className="mt-3 inline-flex h-10 items-center rounded-xl bg-warn-600 px-4 text-sm font-semibold text-white hover:bg-warn-700"
        >
          {incomplete ? 'Profile mukammal karein' : 'Profile dekhein'}
        </Link>
      </div>
    );
  }

  if (status === 'REJECTED') {
    return (
      <div className="mb-6 rounded-2xl border border-alert-200 bg-alert-50 p-5">
        <h2 className="text-[0.9375rem] font-semibold text-alert-700">
          Profile verify nahi ho saki
        </h2>
        {rejectedReason ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
            <strong className="font-semibold">Wajah:</strong> {rejectedReason}
          </p>
        ) : null}
        <p className="mt-1.5 text-sm text-ink-700">
          Aap maloomat theek kar ke dobara submit kar sakte hain.
        </p>
        <Link
          href="/provider/onboarding"
          className="mt-3 inline-flex h-10 items-center rounded-xl bg-alert-600 px-4 text-sm font-semibold text-white hover:bg-alert-700"
        >
          Profile theek karein
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-alert-200 bg-alert-50 p-5">
      <h2 className="text-[0.9375rem] font-semibold text-alert-700">Account suspend hai</h2>
      {suspendedReason ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
          <strong className="font-semibold">Wajah:</strong> {suspendedReason}
        </p>
      ) : null}
      <p className="mt-1.5 text-sm text-ink-700">
        Nayi jobs nahi aayengi. Support se rabta karein.
      </p>
      <Link
        href="/contact"
        className="mt-3 inline-flex h-10 items-center rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-900 hover:bg-ink-50"
      >
        Support se rabta karein
      </Link>
    </div>
  );
}
