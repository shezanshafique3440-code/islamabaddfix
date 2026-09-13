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
    return <span className="text-xs text-ink-500">You</span>;
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
        title={`Change ${fullName}’s role`}
        description="Changing the role ends all of this user’s sessions and they will have to sign in again."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={loading}>
              Close
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
                  toast({ tone: 'success', title: 'Role changed' });
                  setDialog(null);
                  router.refresh();
                } catch (error) {
                  toast({
                    tone: 'error',
                    title: 'Role not changed',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Change role
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="New role"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value)}
          >
            <option value="CUSTOMER">Customer</option>
            <option value="PROVIDER">Provider</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </Select>
          <Textarea
            label="Reason (goes into the audit log)"
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
        title={isActive ? `Disable ${fullName}’s account?` : `Enable ${fullName}’s account?`}
        description={
          isActive
            ? 'Disabling ends their sessions and they will not be able to sign in.'
            : 'Enabling lets them sign in again.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={loading}>
              Close
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
                    title: 'Could not be done',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              {isActive ? 'Disable' : 'Enable'}
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason (goes into the audit log)"
          required
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Dialog>
    </>
  );
}
