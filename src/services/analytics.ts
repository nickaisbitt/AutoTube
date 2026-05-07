import { logger } from './logger';

export interface VideoAnalytics {
  videoId: string;
  title: string;
  topic: string;
  createdAt: string;
  renderTime: number; // seconds
  fileSize: number; // bytes
  duration: number; // seconds
  segments: number;
  mediaCount: number;
  narrationClips: number;
  quality: string;
  exportFormat: string;
}

/**
 * Tracks video generation analytics.
 */
export function trackVideoGeneration(analytics: VideoAnalytics): void {
  try {
    const stored = localStorage.getItem('autotube_analytics');
    const allAnalytics: VideoAnalytics[] = stored ? JSON.parse(stored) : [];
    allAnalytics.push(analytics);
    // Keep last 50 entries
    const trimmed = allAnalytics.slice(-50);
    localStorage.setItem('autotube_analytics', JSON.stringify(trimmed));
    logger.success('Analytics', `Tracked video: ${analytics.title}`);
  } catch (err) {
    logger.error('Analytics', 'Failed to track video', err);
  }
}

/**
 * Gets all tracked analytics.
 */
export function getAnalytics(): VideoAnalytics[] {
  try {
    const stored = localStorage.getItem('autotube_analytics');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}


