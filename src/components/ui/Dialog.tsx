'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

/**
 * Modal dialog.
 *
 * Built on the native <dialog> element so focus trapping, Escape handling and
 * the top layer come from the platform rather than from hand-rolled JavaScript.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape fires `cancel`; route it through onClose so state stays in step.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      onClose();
    },
    [onClose],
  );

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return (
    <dialog
      ref={ref}
      onCancel={handleCancel}
      onClick={(event) => {
        // Backdrop clicks land on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'w-[calc(100%-2rem)] rounded-2xl border border-ink-200 bg-surface p-0 shadow-pop',
        'backdrop:bg-scrim/40 backdrop:backdrop-blur-sm',
        'open:animate-slide-up',
        widths,
      )}
      aria-labelledby="dialog-title"
    >
      <div className="px-5 pb-4 pt-5">
        <h2 id="dialog-title" className="text-title text-ink-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{description}</p>
        ) : null}
      </div>
      {children ? <div className="px-5 pb-5">{children}</div> : null}
      <div className="flex flex-col-reverse gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3 sm:flex-row sm:justify-end">
        {footer ?? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </dialog>
  );
}

/** Confirmation prompt for anything irreversible. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Leave it',
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
