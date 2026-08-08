/**
 * Normalize OpenRouter chat message text (scripts/server-render copy).
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
