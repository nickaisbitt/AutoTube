/**
 * Standardized service error type and helpers.
 *
 * All services use ServiceError for consistent error handling.
 * Codes follow the pattern: DOMAIN_FAILURE_TYPE (e.g., 'LLM_TIMEOUT',
 * 'TTS_ENGINE_FAILED', 'MEDIA_FETCH_FAILED').
 */

export interface ServiceError {
  /** Machine-readable error code, e.g. 'LLM_TIMEOUT' */
  code: string;
  /** Human-readable description of what went wrong */
  message: string;
  /** The underlying error that caused this failure */
  originalError?: unknown;
  /** Whether the caller should retry the operation */
  retryable: boolean;
  /** How many attempts were made before giving up */
  attempts?: number;
}

/**
 * Type guard that checks whether an unknown value is a ServiceError.
 */
export function isServiceError(err: unknown): err is ServiceError {
  if (err == null || typeof err !== 'object') return false;
  const candidate = err as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean'
  );
}

/**
 * Factory function to create a ServiceError with sensible defaults.
 */
export function createServiceError(
  code: string,
  message: string,
  opts?: Partial<ServiceError>,
): ServiceError {
  return {
    code,
    message,
    retryable: false,
    ...opts,
  };
}
