'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  senderName: string;
  isStaff: boolean;
  isMine: boolean;
}

/** Support conversation. Replies post to the ticket API and refresh from server. */
export function TicketThread({
  ticketId,
  messages,
  closed,
}: {
  ticketId: string;
  currentUserId: string;
  messages: ThreadMessage[];
  closed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="rounded-2xl border border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-5 py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink-900">Baat cheet</h2>
      </div>

      {messages.length > 0 ? (
        <ul className="space-y-3 p-5">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn('flex', message.isMine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5',
                  message.isMine ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-900',
                )}
              >
                <p className="text-xs font-semibold opacity-80">
                  {message.isMine ? 'Aap' : message.isStaff ? 'Support team' : message.senderName}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{message.body}</p>
                <p className="mt-1 text-[0.6875rem] opacity-70">
                  {formatDateTime(message.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-center text-sm text-ink-500">
          Abhi koi jawab nahi aaya. Support team jald rabta karegi.
        </p>
      )}

      {closed ? (
        <p className="border-t border-ink-200 bg-ink-50 px-5 py-3 text-sm text-ink-600">
          Yeh ticket band hai. Naya masla ho to naya ticket kholein.
        </p>
      ) : (
        <form
          className="border-t border-ink-200 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            try {
              await api.post(`/api/support/tickets/${ticketId}`, { body: body.trim() });
              setBody('');
              router.refresh();
            } catch (error) {
              toast({
                tone: 'error',
                title: 'Message nahi gaya',
                description: error instanceof ApiError ? error.message : undefined,
              });
            } finally {
              setLoading(false);
            }
          }}
        >
          <label htmlFor="reply" className="sr-only">
            Jawab likhein
          </label>
          <textarea
            id="reply"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="Apna message likhein..."
            className="w-full rounded-xl border border-ink-300 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-600"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" loading={loading} disabled={body.trim().length === 0}>
              Bhejein
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
