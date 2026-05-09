import { useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type ConfirmDialogVariant = 'default' | 'danger';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  onConfirm: () => void;
  onCancel: () => void;
  dontShowAgainKey?: string;
}

const DONT_SHOW_STORAGE_PREFIX = 'autotube_dont_show_';

function shouldSkipDialog(key?: string): boolean {
  if (!key) return false;
  return localStorage.getItem(`${DONT_SHOW_STORAGE_PREFIX}${key}`) === 'true';
}

function setSkipDialog(key: string, skip: boolean) {
  localStorage.setItem(`${DONT_SHOW_STORAGE_PREFIX}${key}`, String(skip));
}

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  dontShowAgainKey,
}: ConfirmDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [],
  );

  const handleCancel = useCallback(() => {
    if (dontShowAgainKey && dontShowAgain) {
      setSkipDialog(dontShowAgainKey, true);
    }
    onCancel();
  }, [onCancel, dontShowAgain, dontShowAgainKey]);

  const handleConfirm = useCallback(() => {
    if (dontShowAgainKey && dontShowAgain) {
      setSkipDialog(dontShowAgainKey, true);
    }
    onConfirm();
  }, [onConfirm, dontShowAgain, dontShowAgainKey]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div className="absolute inset-0 bg-black/90" />
      <div
        ref={dialogRef}
        className={`relative w-full max-w-md border-2 bg-surface-900 shadow-hard ${
          isDanger ? 'border-red-500' : 'border-surface-700'
        }`}
      >
        <div className="flex items-center justify-between border-b-2 border-surface-700 px-6 py-4">
          <h2
            id="confirm-dialog-title"
            className={`text-lg font-bold uppercase tracking-wider ${
              isDanger ? 'text-red-400' : 'text-white'
            }`}
          >
            {title}
          </h2>
          <button
            onClick={handleCancel}
            className="border-2 border-surface-700 p-1 text-surface-400 hover:bg-brand-500 hover:text-black"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          <p id="confirm-dialog-description" className="text-sm text-surface-300">
            {description}
          </p>
        </div>

        {dontShowAgainKey && (
          <div className="px-6 pb-3">
            <label className="flex items-center gap-2 text-xs font-mono text-surface-400">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 border-2 border-surface-600 bg-surface-800 accent-brand-500"
              />
              Don&apos;t show again
            </label>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t-2 border-surface-700 bg-surface-950 px-6 py-4">
          <button
            onClick={handleCancel}
            className="border-2 border-surface-700 px-4 py-2 text-xs font-mono font-semibold text-surface-400 hover:bg-brand-500 hover:text-black"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-xs font-bold uppercase text-black shadow-hard-sm ${
              isDanger
                ? 'bg-red-500 hover:bg-red-400'
                : 'bg-brand-500 hover:bg-brand-400'
            }`}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog(dontShowAgainKey?: string) {
  const [state, setState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    title: '',
    description: '',
    resolve: null,
  });

  const confirm = useCallback(
    (options: {
      title: string;
      description: string;
      confirmLabel?: string;
      cancelLabel?: string;
      variant?: ConfirmDialogVariant;
    }): Promise<boolean> => {
      if (dontShowAgainKey && shouldSkipDialog(dontShowAgainKey)) {
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          title: options.title,
          description: options.description,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          variant: options.variant,
          resolve,
        });
      });
    },
    [dontShowAgainKey],
  );

  const handleConfirm = useCallback(() => {
    setState((prev) => {
      prev.resolve?.(true);
      return { ...prev, isOpen: false, resolve: null };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => {
      prev.resolve?.(false);
      return { ...prev, isOpen: false, resolve: null };
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      dontShowAgainKey={dontShowAgainKey}
    />
  );

  return { confirm, dialog };
}
