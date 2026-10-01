import { isFeatureEnabled } from './featureFlags';
import { safeSetItem } from '../utils/storage';

interface SocialCredentials {
  youtubeApiKey?: string;
  tiktokAccessToken?: string;
  instagramAccessToken?: string;
}

function getStoredCredentials(): SocialCredentials {
  try {
    const raw = localStorage.getItem('autotube-social-credentials');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveCredentials(platform: keyof SocialCredentials, key: string): void {
  const creds = getStoredCredentials();
  creds[platform] = key;
  try {
    safeSetItem('autotube-social-credentials', JSON.stringify(creds));
  } catch {
    // ignore
  }
}

function promptForApiKey(platform: string): string | null {
  const key = prompt(`Enter your ${platform} API key:`);
  if (key && key.trim()) {
    const storageKey = platform === 'YouTube' ? 'youtubeApiKey' : platform === 'TikTok' ? 'tiktokAccessToken' : 'instagramAccessToken';
    saveCredentials(storageKey as keyof SocialCredentials, key.trim());
    return key.trim();
  }
  return null;
}

export async function uploadToYouTube(
  _videoBlob: Blob,
  title: string,
  _description: string,
  _tags: string[],
  signal?: AbortSignal,
): Promise<{ url: string }> {
  if (!isFeatureEnabled('socialUpload')) {
    throw new Error('Social upload is coming soon. This feature is not yet available.');
  }
  const creds = getStoredCredentials();
  if (!creds.youtubeApiKey) {
    const key = promptForApiKey('YouTube');
    if (!key) throw new Error('YouTube API key required');
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => resolve(), 2000);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  const mockUrl = `https://youtube.com/watch?v=mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[SocialUpload] Simulated YouTube upload: "${title}"`);
  return { url: mockUrl };
}

export async function uploadToTikTok(
  _videoBlob: Blob,
  description: string,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  if (!isFeatureEnabled('socialUpload')) {
    throw new Error('Social upload is coming soon. This feature is not yet available.');
  }
  const creds = getStoredCredentials();
  if (!creds.tiktokAccessToken) {
    const key = promptForApiKey('TikTok');
    if (!key) throw new Error('TikTok access token required');
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => resolve(), 2000);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  const mockUrl = `https://tiktok.com/@user/video/mock_${Date.now()}`;
  console.log(`[SocialUpload] Simulated TikTok upload: "${description.slice(0, 50)}..."`);
  return { url: mockUrl };
}

export async function uploadToInstagram(
  _videoBlob: Blob,
  caption: string,
  signal?: AbortSignal,
): Promise<{ url: string }> {
  if (!isFeatureEnabled('socialUpload')) {
    throw new Error('Social upload is coming soon. This feature is not yet available.');
  }
  const creds = getStoredCredentials();
  if (!creds.instagramAccessToken) {
    const key = promptForApiKey('Instagram');
    if (!key) throw new Error('Instagram access token required');
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => resolve(), 2000);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  const mockUrl = `https://instagram.com/reel/mock_${Date.now()}`;
  console.log(`[SocialUpload] Simulated Instagram upload: "${caption.slice(0, 50)}..."`);
  return { url: mockUrl };
}
