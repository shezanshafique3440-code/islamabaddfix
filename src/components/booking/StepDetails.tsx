'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { api, ApiError } from '@/lib/client/api';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { StepFooter, StepShell } from './WizardProgress';
import type { BookingDraft, FlatService } from './types';

interface UploadedMedia {
  id: string;
  url: string;
  mimeType: string;
  originalName: string;
}

const MAX_FILES = 6;

/**
 * Step 3 — detail and evidence.
 *
 * Uploads go straight to the API as the customer picks them, so the final
 * booking POST carries only file ids and stays small. Uploading needs a signed-
 * in session (files are owned by a user), so signed-out visitors see a clear
 * explanation rather than a control that fails.
 */
export function StepDetails({
  draft,
  patch,
  service,
  isSignedIn,
  onNext,
  onBack,
}: {
  draft: BookingDraft;
  patch: (updates: Partial<BookingDraft>) => void;
  service: FlatService | null;
  isSignedIn: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_FILES - media.length;
    if (remaining <= 0) {
      toast({ tone: 'error', title: `Zyada se zyada ${MAX_FILES} files.` });
      return;
    }

    setUploading(true);
    const uploaded: UploadedMedia[] = [];

    for (const file of Array.from(fileList).slice(0, remaining)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', 'BOOKING_EVIDENCE');
      try {
        const result = await api.upload<UploadedMedia>('/api/files', formData);
        uploaded.push(result);
      } catch (error) {
        toast({
          tone: 'error',
          title: `"${file.name}" upload nahi hui`,
          description: error instanceof ApiError ? error.message : undefined,
        });
      }
    }

    if (uploaded.length > 0) {
      const next = [...media, ...uploaded];
      setMedia(next);
      patch({ fileIds: next.map((entry) => entry.id) });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(id: string) {
    const next = media.filter((entry) => entry.id !== id);
    setMedia(next);
    patch({ fileIds: next.map((entry) => entry.id) });
  }

  return (
    <StepShell
      title="Thori si tafseel"
      description="Jitna tafseel se batayenge, technician utna hi tayyar aayega."
    >
      <div className="space-y-5">
        {service ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
            <span className="text-sm font-medium text-ink-900">{service.name}</span>
            <span className="text-xs text-ink-500">{service.categoryName}</span>
            {service.requiresInspection ? <Badge tone="neutral">Muaina ke baad quote</Badge> : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="problem-detail" className="mb-1.5 block text-sm font-medium text-ink-800">
            Masla tafseel se
          </label>
          <textarea
            id="problem-detail"
            value={draft.problem}
            onChange={(event) => patch({ problem: event.target.value })}
            rows={4}
            placeholder="Kab se masla hai? Kya awaz aati hai? Pehle kabhi repair hui?"
            className="w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-ink-900 placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-600"
          />
          <p className="mt-1 text-xs text-ink-500">
            {draft.problem.trim().length < 10
              ? 'Kam az kam 10 characters likhein.'
              : `${draft.problem.trim().length} characters`}
          </p>
        </div>

        <div>
          <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-ink-800">
            Technician ke liye koi hidayat? <span className="text-ink-400">(optional)</span>
          </label>
          <input
            id="notes"
            value={draft.customerNotes}
            onChange={(event) => patch({ customerNotes: event.target.value })}
            placeholder="Misal: gate par ghanti kharab hai, phone kar lein."
            className="h-11 w-full rounded-xl border border-ink-300 bg-white px-3.5 text-[0.9375rem] text-ink-900 placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-600"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-800">
            Tasveer ya chhoti video <span className="text-ink-400">(optional)</span>
          </p>

          {isSignedIn ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
                disabled={uploading || media.length >= MAX_FILES}
                className="block w-full text-sm text-ink-600 file:mr-3 file:h-10 file:cursor-pointer file:rounded-xl file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 disabled:opacity-50"
              />
              <p className="mt-1.5 text-xs text-ink-500">
                Tasveer 8 MB tak, video 40 MB tak. Zyada se zyada {MAX_FILES} files. Sirf aap,
                assigned technician aur support team inhe dekh sakte hain.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-info-100 bg-info-50 px-4 py-3">
              <p className="text-sm text-info-700">
                Tasveer bhejne ke liye login zaroori hai — files aapke account se juri hoti hain.
                Aap login ke baad wapis is step par aa sakte hain.
              </p>
            </div>
          )}

          {uploading ? (
            <p className="mt-2 text-sm text-ink-600" aria-live="polite">
              Upload ho rahi hai...
            </p>
          ) : null}

          {media.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((file) => (
                <li key={file.id} className="group relative">
                  <div className="aspect-square overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                    {file.mimeType.startsWith('image/') ? (
                      <Image
                        src={file.url}
                        alt={file.originalName}
                        width={160}
                        height={160}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-ink-500">
                        🎬 Video
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(file.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-white shadow-sm hover:bg-alert-600"
                    aria-label={`${file.originalName} hatayein`}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7 6.3 5z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        nextDisabled={draft.problem.trim().length < 10}
        loading={uploading}
      />
    </StepShell>
  );
}
