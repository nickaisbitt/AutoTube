export interface MimeTypeResult {
  url: string;
  mimeType: string;
  isValid: boolean;
  expectedType: 'image' | 'video' | 'audio';
  reason?: string;
}

export const VALID_IMAGE_TYPES: string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const VALID_VIDEO_TYPES: string[] = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
];

const VALID_AUDIO_TYPES: string[] = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/webm',
];

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
};

function getValidTypes(expectedType: 'image' | 'video' | 'audio'): string[] {
  switch (expectedType) {
    case 'image': return VALID_IMAGE_TYPES;
    case 'video': return VALID_VIDEO_TYPES;
    case 'audio': return VALID_AUDIO_TYPES;
  }
}

export async function validateMimeType(
  url: string,
  expectedType: 'image' | 'video' | 'audio',
  signal?: AbortSignal,
): Promise<MimeTypeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        url,
        mimeType: '',
        isValid: false,
        expectedType,
        reason: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const mimeType = contentType.split(';')[0].trim().toLowerCase();
    const validTypes = getValidTypes(expectedType);
    const isValid = validTypes.includes(mimeType);

    return {
      url,
      mimeType,
      isValid,
      expectedType,
      reason: isValid ? undefined : `Expected ${expectedType} type, got ${mimeType}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (signal?.aborted) throw err;
      return {
        url,
        mimeType: '',
        isValid: false,
        expectedType,
        reason: 'Request timed out',
      };
    }
    return {
      url,
      mimeType: '',
      isValid: false,
      expectedType,
      reason: err instanceof Error ? err.message : 'Unknown error',
    };
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export function validateMimeTypeFromUrl(
  url: string,
  expectedType: 'image' | 'video',
): MimeTypeResult {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return {
      url,
      mimeType: '',
      isValid: false,
      expectedType,
      reason: 'Invalid URL',
    };
  }

  const lastDot = pathname.lastIndexOf('.');
  if (lastDot === -1) {
    return {
      url,
      mimeType: '',
      isValid: false,
      expectedType,
      reason: 'No file extension found in URL',
    };
  }

  const ext = pathname.slice(lastDot).toLowerCase();
  const mimeType = EXTENSION_MIME_MAP[ext] || '';

  if (!mimeType) {
    return {
      url,
      mimeType: '',
      isValid: false,
      expectedType,
      reason: `Unknown extension: ${ext}`,
    };
  }

  const validTypes = getValidTypes(expectedType);
  const isValid = validTypes.includes(mimeType);

  return {
    url,
    mimeType,
    isValid,
    expectedType,
    reason: isValid ? undefined : `Expected ${expectedType} type, inferred ${mimeType} from extension ${ext}`,
  };
}
