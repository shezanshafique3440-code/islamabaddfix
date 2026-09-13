'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  body: string;
  createdAt: string;
  systemAuthor: string | null;
  sender: { id: string; fullName: string; isYou: boolean } | null;
  attachment: { id: string; url: string; mimeType: string; originalName: string } | null;
}

/**
 * The conversation between a customer and their technician.
 *
 * Polled rather than pushed: a websocket needs a stateful server this product
 * does not otherwise require, and a fifteen-second poll is indistinguishable
 * from live for arranging a visit. The interval backs off when the tab is
 * hidden, because a phone in someone's pocket should not be talking to us.
 */
export function BookingChat({
  bookingId,
  closed,
  audience,
}: {
  bookingId: string;
  /** Cancelled bookings are read-only. */
  closed?: boolean;
  audience: 'customer' | 'provider';
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const load = useCallback(async () => {
    try {
      const rows = await api.get<Message[]>(`/api/bookings/${bookingId}/messages`);
      setMessages(rows);
    } catch (caught) {
      if (caught instanceof ApiError) setError(caught.message);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setInterval>;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => void load(), document.hidden ? 60_000 : 15_000);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, [load]);

  // Follow new messages only when the reader is already at the bottom —
  // yanking the view while somebody is reading back is worse than not scrolling.
  useEffect(() => {
    const node = listRef.current;
    if (node && pinnedToBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);
    try {
      const message = await api.post<Message>(`/api/bookings/${bookingId}/messages`, { body });
      setMessages((current) => [...(current ?? []), message]);
      setDraft('');
      pinnedToBottom.current = true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not send the message.');
    } finally {
      setSending(false);
    }
  }

  const other = audience === 'customer' ? 'technician' : 'customer';

  return (
    <div className="rounded-2xl border border-ink-200 bg-surface">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <h3 className="text-[0.9375rem] font-semibold text-ink-900">Messages</h3>
        <span className="text-xs text-ink-500">Only you and {other} — plus the support team.</span>
      </div>

      <div
        ref={listRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          pinnedToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
        }}
        className="max-h-80 min-h-[8rem] space-y-3 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Booking messages"
      >
        {messages === null ? (
          <>
            <Skeleton className="h-10 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-xl" />
          </>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">
            No messages yet. Ask anything here.
          </p>
        ) : (
          messages.map((message) => <Bubble key={message.id} message={message} />)
        )}
      </div>

      {closed ? (
        <p className="border-t border-ink-100 px-4 py-3 text-sm text-ink-500">
          This booking is closed — no new messages can be sent.
        </p>
      ) : (
        <form onSubmit={send} className="border-t border-ink-100 p-3">
          {error ? (
            <p role="alert" className="mb-2 text-sm text-alert-600">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <label htmlFor={`chat-${bookingId}`} className="sr-only">
              Write a message
            </label>
            <textarea
              id={`chat-${bookingId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter makes a new line — what people expect.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              placeholder="Write a message…"
              className="min-h-[2.75rem] flex-1 resize-y rounded-xl border border-ink-300 bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-600"
            />
            <Button type="submit" loading={sending} disabled={draft.trim().length === 0}>
              Send
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            Do not send payment or personal details in a message. Every message is recorded and
            support can read it if there is a dispute.
          </p>
        </form>
      )}
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const mine = message.sender?.isYou ?? false;
  const system = message.sender === null;

  if (system) {
    return (
      <p className="text-center text-xs text-ink-500">
        {message.systemAuthor ? `${message.systemAuthor}: ` : ''}
        {message.body}
      </p>
    );
  }

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2',
          mine ? 'bg-brand-700 text-white dark:text-brand-50' : 'bg-ink-100 text-ink-900',
        )}
      >
        {!mine ? (
          <p className="mb-0.5 text-xs font-semibold text-ink-600">{message.sender?.fullName}</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        {message.attachment ? (
          <a
            href={message.attachment.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'mt-1 block text-xs underline',
              mine ? 'text-white/90' : 'text-brand-700',
            )}
          >
            {message.attachment.originalName}
          </a>
        ) : null}
        <time
          dateTime={message.createdAt}
          className={cn('mt-0.5 block text-[0.6875rem]', mine ? 'text-white/70' : 'text-ink-500')}
        >
          {new Intl.DateTimeFormat('en-PK', { hour: 'numeric', minute: '2-digit' }).format(
            new Date(message.createdAt),
          )}
        </time>
      </div>
    </div>
  );
}
