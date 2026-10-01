import { describe, it, expect } from 'vitest';
import { getAudiencePromptModifier } from '../scriptGenerator';

describe('getAudiencePromptModifier', () => {
  it('returns small business owner modifier for "small business" audience', () => {
    const result = getAudiencePromptModifier('small business owners');
    expect(result).toContain('SMALL BUSINESS OWNERS');
    expect(result).toContain('downtime');
    expect(result).toContain('money loss');
    expect(result).toContain('customer trust');
    expect(result).toContain('frozen POS');
    expect(result).toContain('your payroll');
    expect(result).toContain('realistic for a 5-50 person company');
  });

  it('returns small business owner modifier for "SMB" audience', () => {
    const result = getAudiencePromptModifier('SMB decision makers');
    expect(result).toContain('SMALL BUSINESS OWNERS');
  });

  it('returns freelancer modifier for "freelancer" audience', () => {
    const result = getAudiencePromptModifier('freelancers and creators');
    expect(result).toContain('FREELANCERS');
    expect(result).toContain('identity theft');
    expect(result).toContain('account lockout');
    expect(result).toContain('invoice fraud');
    expect(result).toContain('lost client data');
    expect(result).toContain('your client list');
    expect(result).toContain('your invoices');
  });

  it('returns freelancer modifier for "self-employed" audience', () => {
    const result = getAudiencePromptModifier('self-employed professionals');
    expect(result).toContain('FREELANCERS');
  });

  it('returns consumer modifier for general audience', () => {
    const result = getAudiencePromptModifier('general audience');
    expect(result).toContain('CONSUMERS');
    expect(result).toContain('your photos');
    expect(result).toContain('your bank account');
    expect(result).toContain('your passwords');
    expect(result).toContain('realistic for everyday people');
  });

  it('returns consumer modifier for empty string', () => {
    const result = getAudiencePromptModifier('');
    expect(result).toContain('CONSUMERS');
  });

  it('enforces simple language guidance in all modifiers', () => {
    const audiences = ['small business owners', 'freelancers', 'general audience'];
    for (const audience of audiences) {
      const result = getAudiencePromptModifier(audience);
      // All modifiers should discourage jargon
      expect(result.toLowerCase()).toContain('jargon');
    }
  });

  it('includes survival path / agency guidance in all modifiers', () => {
    const audiences = ['small business owners', 'freelancers', 'general audience'];
    for (const audience of audiences) {
      const result = getAudiencePromptModifier(audience);
      // All modifiers should balance fear with actionable steps
      expect(result.toLowerCase()).toMatch(/fear|agency|survival|concerned but not helpless/);
    }
  });

  it('uses audience-facing language ("your ...") in all modifiers', () => {
    const audiences = ['small business owners', 'freelancers', 'general audience'];
    for (const audience of audiences) {
      const result = getAudiencePromptModifier(audience);
      expect(result).toMatch(/your \w+/i);
    }
  });
});
