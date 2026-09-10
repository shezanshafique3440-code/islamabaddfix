import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { getAllSettings, settingsMetadata } from '@/lib/settings';
import { can } from '@/lib/auth/rbac';
import { SettingsEditor } from '@/components/admin/SettingsEditor';

export const metadata: Metadata = {
  title: 'Platform settings',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const ctx = await requirePermission('settings:read');
  const [values, metadata] = await Promise.all([getAllSettings(), settingsMetadata()]);

  return (
    <div>
      <header>
        <h1 className="text-display-sm text-ink-950">Platform settings</h1>
        <p className="mt-1 text-sm text-ink-600">
          Business rules yahan rehte hain, code mein nahi — commission, guarantee, matching weights
          aur booking policy sab yahan se badalte hain.
        </p>
      </header>

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
