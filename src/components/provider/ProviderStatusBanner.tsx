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
          Your profile is under review
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
          {incomplete
            ? 'Your profile is not complete yet. At least one service and one service area are required before review can start.'
            : `Our team is reviewing ${businessName}. Until you are approved, your profile is not shown to customers and no new jobs will come through.`}
        </p>
        <Link
          href="/provider/onboarding"
          className="mt-3 inline-flex h-10 items-center rounded-xl bg-warn-600 px-4 text-sm font-semibold text-white hover:bg-warn-700 dark:text-warn-50"
        >
          {incomplete ? 'Complete your profile' : 'View profile'}
        </Link>
      </div>
    );
  }

  if (status === 'REJECTED') {
    return (
      <div className="mb-6 rounded-2xl border border-alert-200 bg-alert-50 p-5">
        <h2 className="text-[0.9375rem] font-semibold text-alert-700">
          Profile could not be verified
        </h2>
        {rejectedReason ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
            <strong className="font-semibold">Reason:</strong> {rejectedReason}
          </p>
        ) : null}
        <p className="mt-1.5 text-sm text-ink-700">
          You can correct your details and submit again.
        </p>
        <Link
          href="/provider/onboarding"
          className="mt-3 inline-flex h-10 items-center rounded-xl bg-alert-600 px-4 text-sm font-semibold text-white hover:bg-alert-700"
        >
          Fix your profile
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-alert-200 bg-alert-50 p-5">
      <h2 className="text-[0.9375rem] font-semibold text-alert-700">Account suspended</h2>
      {suspendedReason ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
          <strong className="font-semibold">Reason:</strong> {suspendedReason}
        </p>
      ) : null}
      <p className="mt-1.5 text-sm text-ink-700">
        No new jobs will come in. Please contact support.
      </p>
      <Link
        href="/contact"
        className="mt-3 inline-flex h-10 items-center rounded-xl border border-ink-300 bg-surface px-4 text-sm font-semibold text-ink-900 hover:bg-ink-50"
      >
        Contact support
      </Link>
    </div>
  );
}
