import { useEffect, useRef, useCallback } from 'react';

export interface ShortcutHandlers {
  onStartRender?: () => void;
  onSaveProject?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPlayPause?: () => void;
  onCancelOperation?: () => void;
  onShowShortcuts?: () => void;
  onStepSwitch?: (stepIndex: number) => void;
}

const PIPELINE_STEPS = ['topic', 'script', 'media', 'narration', 'ai_edit', 'assembly', 'preview'] as const;

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.contentEditable === 'true';

    const h = handlersRef.current;

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      h.onStartRender?.();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      h.onSaveProject?.();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
      if (!isInput) {
        e.preventDefault();
        h.onUndo?.();
      }
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Z') {
      e.preventDefault();
      h.onRedo?.();
      return;
    }

    if (e.key === ' ' && !isInput) {
      e.preventDefault();
      h.onPlayPause?.();
      return;
    }

    if (e.key === 'Escape') {
      h.onCancelOperation?.();
      return;
    }

    if (e.key === '?' && !isInput) {
      e.preventDefault();
      h.onShowShortcuts?.();
      return;
    }

    if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= PIPELINE_STEPS.length) {
        e.preventDefault();
        h.onStepSwitch?.(num - 1);
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export interface ShortcutDefinition {
  keys: string;
  description: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { keys: 'Cmd/Ctrl + Enter', description: 'Start render' },
  { keys: 'Cmd/Ctrl + S', description: 'Save project' },
  { keys: 'Cmd/Ctrl + Z', description: 'Undo' },
  { keys: 'Cmd/Ctrl + Shift + Z', description: 'Redo' },
  { keys: 'Space', description: 'Play/pause preview' },
  { keys: 'Escape', description: 'Cancel current operation' },
  { keys: '?', description: 'Show keyboard shortcuts' },
  { keys: '1-7', description: 'Switch to pipeline step' },
];
