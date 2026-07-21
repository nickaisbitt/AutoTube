/**
 * Normalize OpenRouter chat message text (mjs copy for scripts/server-render).
 * Prefer message.content; fall back to reasoning (mimo / reasoning models).
 */
export function openRouterMessageText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string' && message.content.trim()) return message.content.trim();
  if (typeof message.reasoning === 'string' && message.reasoning.trim()) return message.reasoning.trim();
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}
