import { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';
import { SHORTCUT_DEFINITIONS } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevFocus = document.activeElement as HTMLElement;
    const modal = modalRef.current;
    modal?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      prevFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="keyboard-shortcuts-modal">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div ref={modalRef} id="keyboard-shortcuts-modal-inner" tabIndex={-1} className="relative w-full max-w-md overflow-hidden border-2 border-surface-700 bg-surface-900 shadow-hard outline-none">
        <div className="flex items-center justify-between border-b-2 border-surface-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-brand-500" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-surface-700 p-1 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {SHORTCUT_DEFINITIONS.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm font-mono text-surface-300">{s.description}</span>
              <kbd className="border-2 border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-brand-400">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div className="border-t-2 border-surface-700 px-6 py-4">
          <p className="text-[10px] font-mono text-surface-500">
            Press <kbd className="border border-surface-600 px-1">?</kbd> anytime to open this panel.
          </p>
        </div>
      </div>
    </div>
  );
}
