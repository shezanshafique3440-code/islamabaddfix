import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { getAllSettings, settingsMetadata } from '@/lib/settings';
import { can } from '@/lib/auth/rbac';
import { SettingsEditor } from '@/components/admin/SettingsEditor';
import { TwoFactorPanel } from '@/components/admin/TwoFactorPanel';
import { twoFactorStatus } from '@/lib/auth/two-factor';

export const metadata: Metadata = {
  title: 'Platform settings',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const ctx = await requirePermission('settings:read');
  const [values, metadata, twoFactor] = await Promise.all([
    getAllSettings(),
    settingsMetadata(),
    twoFactorStatus(ctx.user.id),
  ]);

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Platform settings</h1>
        <p className="mt-1 text-sm text-ink-600">
          Business rules live here, not in code — commission, guarantee, matching weights and
          booking policy are all changed from here.
        </p>
      </header>

      {/* An account that can issue refunds and approve providers deserves more
          than a password. */}
      <section className="mt-6 rounded-2xl border border-ink-200 bg-surface p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Protecting your account</h2>
        <div className="mt-4">
          <TwoFactorPanel initial={twoFactor} email={ctx.user.email} />
        </div>
      </section>

      <div className="mt-6">
        <SettingsEditor
          values={values as Record<string, unknown>}
          metadata={metadata}
          canWrite={can(ctx.role, 'settings:write')}
          canWriteFinancial={can(ctx.role, 'settings:write:financial')}
        />
      </div>
    </div>
  );
}
