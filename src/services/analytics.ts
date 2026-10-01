import { safeSetItem } from '../utils/storage';
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
    safeSetItem('autotube_analytics', JSON.stringify(trimmed));
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

export function startRender(duration: number, resolution: string, format: string): string {
  const renderId = Math.random().toString(36).substring(2, 9);
  const startObj = {
    id: renderId,
    duration,
    resolution,
    format,
    startTime: Date.now(),
    status: 'pending'
  };
  try {
    const stored = localStorage.getItem('autotube_renders') || '[]';
    const list = JSON.parse(stored);
    list.push(startObj);
    localStorage.setItem('autotube_renders', JSON.stringify(list));
  } catch (err) {
    logger.error('Analytics', 'Failed to start render tracking', err);
  }
  return renderId;
}

export function completeRender(renderId: string, status: 'success' | 'failure' | 'cancelled', errorType?: string): void {
  try {
    const stored = localStorage.getItem('autotube_renders') || '[]';
    const list = JSON.parse(stored);
    const item = list.find((d: any) => d.id === renderId);
    if (item) {
      item.status = status;
      item.endTime = Date.now();
      item.errorType = errorType;
      localStorage.setItem('autotube_renders', JSON.stringify(list));
    }
  } catch (err) {
    logger.error('Analytics', 'Failed to complete render tracking', err);
  }
}

export function getAnalyticsSummary() {
  try {
    const stored = localStorage.getItem('autotube_renders') || '[]';
    const list = JSON.parse(stored);
    const successful = list.filter((d: any) => d.status === 'success' && d.endTime);
    const totalRenders = successful.length;
    let totalRenderTimeMs = 0;
    successful.forEach((d: any) => {
      totalRenderTimeMs += (d.endTime - d.startTime);
    });
    const averageRenderTimeMs = totalRenders > 0 ? totalRenderTimeMs / totalRenders : 0;

    const renderTrend = [
      { count: totalRenders, date: new Date().toLocaleDateString() }
    ];

    return {
      renderTrend,
      averageRenderTimeMs,
      totalRenderTimeMs,
      totalRenders
    };
  } catch {
    return {
      renderTrend: [],
      averageRenderTimeMs: 0,
      totalRenderTimeMs: 0,
      totalRenders: 0
    };
  }
}


