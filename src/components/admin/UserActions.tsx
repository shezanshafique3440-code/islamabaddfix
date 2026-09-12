'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

/**
 * Per-user admin actions.
 *
 * Self-targeting is blocked in the UI and in the API: an operator demoting or
 * disabling their own account is how a platform loses its last administrator.
 * Both actions revoke the user's sessions, which the copy states.
 */
export function UserActions({
  userId,
  fullName,
  role,
  isActive,
  isSelf,
  canChangeRole,
}: {
  userId: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isSelf: boolean;
  canChangeRole: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<null | 'role' | 'active'>(null);
  const [newRole, setNewRole] = useState(role);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (isSelf) {
    return <span className="text-xs text-ink-400">Aap khud</span>;
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        {canChangeRole ? (
          <Button variant="ghost" size="sm" onClick={() => setDialog('role')}>
            Role
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setDialog('active')}>
          {isActive ? 'Disable' : 'Enable'}
        </Button>
      </div>

      <Dialog
        open={dialog === 'role'}
        onClose={() => setDialog(null)}
        title={`${fullName} ka role badlein`}
        description="Role badalne par is user ke tamam sessions khatam ho jayenge aur unhe dobara login karna hoga."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={loading}>
              Band karein
            </Button>
            <Button
              loading={loading}
              disabled={newRole === role || reason.trim().length < 4}
              onClick={async () => {
                setLoading(true);
                try {
                  await api.patch(`/api/admin/users/${userId}`, {
                    role: newRole,
                    reason: reason.trim(),
                  });
                  toast({ tone: 'success', title: 'Role badal gaya' });
                  setDialog(null);
                  router.refresh();
                } catch (error) {
                  toast({
                    tone: 'error',
                    title: 'Role nahi badla',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Role badlein
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Naya role"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value)}
          >
            <option value="CUSTOMER">Customer</option>
            <option value="PROVIDER">Provider</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </Select>
          <Textarea
            label="Wajah (audit log mein jayegi)"
            required
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'active'}
        onClose={() => setDialog(null)}
        title={
          isActive
            ? `${fullName} ka account disable karein?`
            : `${fullName} ka account enable karein?`
        }
        description={
          isActive
            ? 'Disable karne par sessions khatam ho jayenge aur woh login nahi kar sakenge.'
            : 'Enable karne par woh dobara login kar sakenge.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={loading}>
              Band karein
            </Button>
            <Button
              variant={isActive ? 'danger' : 'primary'}
              loading={loading}
              disabled={reason.trim().length < 4}
              onClick={async () => {
                setLoading(true);
                try {
                  await api.post(`/api/admin/users/${userId}`, {
                    isActive: !isActive,
                    reason: reason.trim(),
                  });
                  toast({
                    tone: 'success',
                    title: isActive ? 'Account disabled' : 'Account enabled',
                  });
                  setDialog(null);
                  router.refresh();
                } catch (error) {
                  toast({
                    tone: 'error',
                    title: 'Nahi ho saka',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              {isActive ? 'Disable karein' : 'Enable karein'}
            </Button>
          </>
        }
      >
        <Textarea
          label="Wajah (audit log mein jayegi)"
          required
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Dialog>
    </>
  );
}
