'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const STATUSES = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'WAITING_ON_CUSTOMER', label: 'Waiting on customer' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
] as const;

/** Assign and re-status a ticket without leaving the thread. */
export function AdminTicketControls({
  ticketId,
  status,
  assigneeId,
  currentUserId,
  staff,
}: {
  ticketId: string;
  status: string;
  assigneeId: string | null;
  currentUserId: string;
  staff: Array<{ id: string; fullName: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function update(body: Record<string, unknown>) {
    setLoading(true);
    try {
      await api.patch(`/api/support/tickets/${ticketId}`, body);
      toast({ tone: 'success', title: 'Updated' });
      router.refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Not updated',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-ink-200 bg-surface p-5">
      <div>
        <label htmlFor="ticket-status" className="mb-1.5 block text-sm font-medium text-ink-800">
          Status
        </label>
        <select
          id="ticket-status"
          value={status}
          disabled={loading}
          onChange={(event) => update({ status: event.target.value })}
          className="h-10 rounded-xl border border-ink-300 px-3 text-sm"
        >
          {STATUSES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="ticket-assignee" className="mb-1.5 block text-sm font-medium text-ink-800">
          Assignee
        </label>
        <select
          id="ticket-assignee"
          value={assigneeId ?? ''}
          disabled={loading}
          onChange={(event) => update({ assigneeId: event.target.value || null })}
          className="h-10 rounded-xl border border-ink-300 px-3 text-sm"
        >
          <option value="">Unassigned</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName}
            </option>
          ))}
        </select>
      </div>

      {assigneeId !== currentUserId ? (
        <Button
          variant="outline"
          loading={loading}
          onClick={() => update({ assigneeId: currentUserId })}
        >
          Assign to me
        </Button>
      ) : null}
    </section>
  );
}
