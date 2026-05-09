import { useState, useCallback, useRef } from 'react';
import { toast } from './useToast';

interface UseCopyToClipboardReturn {
  copy: (text: string, label?: string) => Promise<void>;
  copiedText: string | null;
  isCopying: boolean;
}

export function useCopyToClipboard(): UseCopyToClipboardReturn {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string, label?: string) => {
    if (!text) return;
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      toast(label ? `${label} copied to clipboard!` : 'Copied to clipboard!', 'success');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedText(null), 2000);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    } finally {
      setIsCopying(false);
    }
  }, []);

  return { copy, copiedText, isCopying };
}
