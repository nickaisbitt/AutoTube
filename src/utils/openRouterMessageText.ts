/**
 * Normalize OpenRouter chat message text.
 * Mimo / reasoning models often put JSON in `reasoning` with empty `content`.
 */
export function openRouterMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const m = message as {
    content?: unknown;
    reasoning?: unknown;
  };
  if (typeof m.content === 'string' && m.content.trim()) return m.content.trim();
  if (typeof m.reasoning === 'string' && m.reasoning.trim()) return m.reasoning.trim();
  if (Array.isArray(m.content)) {
    return m.content
      .map((part) => (typeof part === 'string' ? part : (part as { text?: string })?.text || ''))
      .join('')
      .trim();
  }
  return '';
}
