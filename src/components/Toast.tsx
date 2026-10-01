import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

const TYPE_COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400', icon: '#34d399' },
  error: { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-400', icon: '#f87171' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-400', icon: '#60a5fa' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-400', icon: '#fbbf24' },
};

const TYPE_ICONS: Record<ToastType, ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-emerald-400">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-red-400">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-blue-400">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-amber-400">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
};

let toastQueue: ToastItem[] = [];
let listeners: Set<(toasts: ToastItem[]) => void> = new Set();

export function resetToastQueue() {
  toastQueue.length = 0;
  listeners.clear();
}

function notify() {
  const visible = toastQueue.slice(0, MAX_VISIBLE);
  listeners.forEach((fn) => fn(visible));
}

export function addToast(message: string, type: ToastType) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toastQueue.push({ id, message, type });
  notify();
  return id;
}

export function removeToast(id: string) {
  toastQueue = toastQueue.filter((t) => t.id !== id);
  notify();
}

export function useToastState() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setToasts);
    notify();
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return toasts;
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setVisible(true);
    } else {
      requestAnimationFrame(() => setVisible(true));
    }

    timerRef.current = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => removeToast(toast.id), 200);
  }, [toast.id]);

  const colors = TYPE_COLORS[toast.type];

  return (
    <div
      className={`toast-card border-l-4 ${colors.border} ${colors.bg} ${visible ? 'toast-enter' : 'toast-exit'}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {TYPE_ICONS[toast.type]}
        <p className={`flex-1 text-sm font-medium ${colors.text}`}>{toast.message}</p>
        <button
          onClick={dismiss}
          className="text-surface-400 hover:text-white"
          aria-label="Dismiss notification"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastState();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[200] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
