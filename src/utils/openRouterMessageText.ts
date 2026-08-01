/**
 * Normalize OpenRouter chat message text.
 *
 * Returns the message content string, or '' when content is absent or empty.
 * Does NOT fall back to the `reasoning` field: reasoning models emit
 * chain-of-thought in that field, which is prose—not JSON—and must not be
 * fed into JSON parsers. Callers should throw/retry on empty content.
 */
export function openRouterMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const m = message as {
    content?: unknown;
  };
  if (typeof m.content === 'string' && m.content.trim()) return m.content.trim();
  if (Array.isArray(m.content)) {
    return m.content
      .map((part) => (typeof part === 'string' ? part : (part as { text?: string })?.text || ''))
      .join('')
      .trim();
  }
  return '';
}
