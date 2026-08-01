/**
 * Normalize OpenRouter chat message text (mjs copy for scripts/server-render).
 *
 * Returns the message content string, or '' when content is absent or empty.
 * Does NOT fall back to the `reasoning` field: reasoning models emit
 * chain-of-thought in that field, which is prose—not JSON—and must not be
 * fed into JSON parsers. Callers should throw/retry on empty content.
 */
export function openRouterMessageText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string' && message.content.trim()) return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}
