/**
 * Unit tests for openRouterMessageText.
 *
 * Verifies that the utility extracts content correctly and does NOT fall back
 * to the `reasoning` field (chain-of-thought must not be fed into JSON parsers).
 */
import { describe, it, expect } from 'vitest';
import { openRouterMessageText } from '../../utils/openRouterMessageText';

describe('openRouterMessageText', () => {
  it('returns content string when present and non-empty', () => {
    expect(openRouterMessageText({ content: '{ "segments": [] }' })).toBe('{ "segments": [] }');
  });

  it('trims whitespace from content', () => {
    expect(openRouterMessageText({ content: '  hello  ' })).toBe('hello');
  });

  it('returns empty string when content is empty string', () => {
    expect(openRouterMessageText({ content: '' })).toBe('');
  });

  it('returns empty string when content is only whitespace', () => {
    expect(openRouterMessageText({ content: '   ' })).toBe('');
  });

  it('does NOT fall back to reasoning when content is empty — reasoning is chain-of-thought', () => {
    const msg = { content: '', reasoning: '{"segments":[{"type":"intro"}]}' };
    expect(openRouterMessageText(msg)).toBe('');
  });

  it('does NOT use reasoning even when content field is absent', () => {
    const msg = { reasoning: 'Let me think about this... The answer is {"segments":[]}' };
    expect(openRouterMessageText(msg)).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    expect(openRouterMessageText(null)).toBe('');
    expect(openRouterMessageText(undefined)).toBe('');
  });

  it('returns empty string for non-object input', () => {
    expect(openRouterMessageText('string')).toBe('');
    expect(openRouterMessageText(42)).toBe('');
  });

  it('joins array content parts', () => {
    const msg = { content: [{ text: 'hello ' }, { text: 'world' }] };
    expect(openRouterMessageText(msg)).toBe('hello world');
  });

  it('handles mixed array content (string and object parts)', () => {
    const msg = { content: ['foo ', { text: 'bar' }] };
    expect(openRouterMessageText(msg)).toBe('foo bar');
  });

  it('returns empty string for empty array content', () => {
    expect(openRouterMessageText({ content: [] })).toBe('');
  });
});
