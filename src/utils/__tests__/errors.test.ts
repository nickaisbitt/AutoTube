import { describe, it, expect } from 'vitest';
import { isServiceError, createServiceError, type ServiceError } from '../errors';

describe('isServiceError', () => {
  it('should return true for a valid ServiceError object', () => {
    const err: ServiceError = {
      code: 'LLM_TIMEOUT',
      message: 'Request timed out',
      retryable: true,
    };
    expect(isServiceError(err)).toBe(true);
  });

  it('should return true when optional fields are present', () => {
    const err: ServiceError = {
      code: 'MEDIA_FETCH_FAILED',
      message: 'Could not fetch media',
      retryable: false,
      originalError: new Error('network error'),
      attempts: 3,
    };
    expect(isServiceError(err)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isServiceError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isServiceError(undefined)).toBe(false);
  });

  it('should return false for a plain string', () => {
    expect(isServiceError('some error')).toBe(false);
  });

  it('should return false for a number', () => {
    expect(isServiceError(42)).toBe(false);
  });

  it('should return false for a standard Error instance', () => {
    expect(isServiceError(new Error('oops'))).toBe(false);
  });

  it('should return false when code is missing', () => {
    expect(isServiceError({ message: 'hi', retryable: true })).toBe(false);
  });

  it('should return false when message is missing', () => {
    expect(isServiceError({ code: 'X', retryable: true })).toBe(false);
  });

  it('should return false when retryable is missing', () => {
    expect(isServiceError({ code: 'X', message: 'hi' })).toBe(false);
  });

  it('should return false when code is not a string', () => {
    expect(isServiceError({ code: 123, message: 'hi', retryable: true })).toBe(false);
  });

  it('should return false when retryable is not a boolean', () => {
    expect(isServiceError({ code: 'X', message: 'hi', retryable: 'yes' })).toBe(false);
  });
});

describe('createServiceError', () => {
  it('should create a ServiceError with required fields and default retryable=false', () => {
    const err = createServiceError('TTS_ENGINE_FAILED', 'Engine crashed');
    expect(err.code).toBe('TTS_ENGINE_FAILED');
    expect(err.message).toBe('Engine crashed');
    expect(err.retryable).toBe(false);
    expect(err.originalError).toBeUndefined();
    expect(err.attempts).toBeUndefined();
  });

  it('should allow overriding retryable via opts', () => {
    const err = createServiceError('LLM_TIMEOUT', 'Timed out', { retryable: true });
    expect(err.retryable).toBe(true);
  });

  it('should include originalError when provided', () => {
    const original = new Error('network');
    const err = createServiceError('FETCH_FAILED', 'Failed', { originalError: original });
    expect(err.originalError).toBe(original);
  });

  it('should include attempts when provided', () => {
    const err = createServiceError('RETRY_EXHAUSTED', 'All failed', { attempts: 5 });
    expect(err.attempts).toBe(5);
  });

  it('should produce an object that passes isServiceError', () => {
    const err = createServiceError('ANY_CODE', 'Any message', { retryable: true, attempts: 2 });
    expect(isServiceError(err)).toBe(true);
  });
});
