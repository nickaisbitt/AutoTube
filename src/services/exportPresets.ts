export interface ExportSettings {
  quality: 'draft' | 'standard' | 'high';
  format: 'webm' | 'mp4';
  resolution?: '720p' | '1080p' | '4K';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
  backgroundMusic?: boolean;
  musicPreset?: string;
  isStreaming?: boolean;
  channelName?: string;
  watermarkLogoUrl?: string;
  ttsVoice?: string;
  edgeTtsVoice?: string;
  removeWatermark?: boolean;
  fontFamily?: string;
}

export interface ExportPreset {
  id: string;
  name: string;
  settings: ExportSettings;
  createdAt: string;
  isDefault?: boolean;
}

const STORAGE_KEY = 'autotube_export_presets';

const DEFAULT_PRESETS: ExportPreset[] = [
  {
    id: 'preset-youtube-standard',
    name: 'YouTube Standard',
    isDefault: true,
    createdAt: new Date().toISOString(),
    settings: {
      quality: 'standard',
      format: 'mp4',
      resolution: '1080p',
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      mimeType: 'video/mp4',
      fileName: 'video.mp4',
      backgroundMusic: true,
      musicPreset: 'ambient',
      ttsVoice: 'af_heart',
      edgeTtsVoice: 'en-US-GuyNeural',
      removeWatermark: false,
      fontFamily: 'Inter',
    },
  },
  {
    id: 'preset-tiktok-vertical',
    name: 'TikTok Vertical',
    isDefault: true,
    createdAt: new Date().toISOString(),
    settings: {
      quality: 'standard',
      format: 'mp4',
      resolution: '1080p',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
      fileName: 'video.mp4',
      backgroundMusic: true,
      musicPreset: 'uplifting',
      ttsVoice: 'af_heart',
      edgeTtsVoice: 'en-US-JennyNeural',
      removeWatermark: false,
      fontFamily: 'Inter',
    },
  },
  {
    id: 'preset-high-quality-master',
    name: 'High Quality Master',
    isDefault: true,
    createdAt: new Date().toISOString(),
    settings: {
      quality: 'high',
      format: 'mp4',
      resolution: '4K',
      aspectRatio: '16:9',
      width: 3840,
      height: 2160,
      mimeType: 'video/mp4',
      fileName: 'video.mp4',
      backgroundMusic: true,
      musicPreset: 'ambient',
      ttsVoice: 'af_heart',
      edgeTtsVoice: 'en-US-GuyNeural',
      removeWatermark: true,
      fontFamily: 'Inter',
    },
  },
];

function getPresets(): ExportPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const userPresets: ExportPreset[] = JSON.parse(stored);
      return [...DEFAULT_PRESETS, ...userPresets];
    }
  } catch {
    // Ignore
  }
  return DEFAULT_PRESETS;
}

function getUserPresets(): ExportPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveExportPreset(name: string, settings: ExportSettings): ExportPreset {
  const userPresets = getUserPresets();
  const newPreset: ExportPreset = {
    id: `preset-custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    settings,
    createdAt: new Date().toISOString(),
  };
  userPresets.push(newPreset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
  return newPreset;
}

export function loadExportPreset(presetId: string): ExportPreset | null {
  const allPresets = getPresets();
  return allPresets.find(p => p.id === presetId) ?? null;
}

export function getExportPresets(): ExportPreset[] {
  return getPresets();
}

export function deleteExportPreset(presetId: string): boolean {
  const userPresets = getUserPresets();
  const filtered = userPresets.filter(p => p.id !== presetId);
  if (filtered.length === userPresets.length) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}
