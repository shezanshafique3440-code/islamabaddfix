'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';

export function MarkAllRead() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await api.post('/api/notifications/read');
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
    >
      Sab read mark karein
    </Button>
  );
}
