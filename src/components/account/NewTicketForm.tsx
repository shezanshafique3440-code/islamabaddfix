'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Select, Textarea, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export function NewTicketForm({ bookings }: { bookings: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({ subject: '', description: '', bookingId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setErrors({});
        try {
          const result = await api.post<{ id: string; reference: string }>('/api/support/tickets', {
            subject: form.subject,
            description: form.description,
            bookingId: form.bookingId || undefined,
          });
          toast({ tone: 'success', title: `Ticket khul gaya — ${result.reference}` });
          router.push(`/account/support/${result.id}`);
        } catch (error) {
          if (error instanceof ApiError) {
            setErrors(error.fieldMap);
            toast({ tone: 'error', title: error.message });
          }
          setLoading(false);
        }
      }}
    >
      <TextInput
        label="Subject"
        required
        value={form.subject}
        onChange={(event) => setForm((f) => ({ ...f, subject: event.target.value }))}
        placeholder="Misal: technician time par nahi aaya"
        error={errors.subject}
      />

      {bookings.length > 0 ? (
        <Select
          label="Kis booking se related hai?"
          value={form.bookingId}
          onChange={(event) => setForm((f) => ({ ...f, bookingId: event.target.value }))}
          hint="Optional, lekin madadgar."
          error={errors.bookingId}
        >
          <option value="">Koi booking nahi</option>
          {bookings.map((booking) => (
            <option key={booking.id} value={booking.id}>
              {booking.label}
            </option>
          ))}
        </Select>
      ) : null}

      <Textarea
        label="Tafseel"
        required
        rows={6}
        value={form.description}
        onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
        placeholder="Kya hua, kab hua, aur aap kya chahte hain?"
        hint="Kam az kam 15 characters."
        error={errors.description}
      />

      <Button
        type="submit"
        loading={loading}
        disabled={form.subject.trim().length < 5 || form.description.trim().length < 15}
      >
        Ticket kholein
      </Button>
    </form>
  );
}
