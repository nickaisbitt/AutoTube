import { logger } from './logger';
import { safeSetItem, safeGetItem } from '../utils/storage';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendingTopic {
  title: string;
  viewCount: number;
  publishedAt: string;
  channelTitle: string;
  tags: string[];
  category: string;
}

export interface NicheTrend {
  topic: string;
  relevanceScore: number;
  velocity: 'rising' | 'stable' | 'declining';
  videoCount: number;
  averageViews: number;
  detectedAt: string;
  sources: string[];
}

export interface TrendAlert {
  id: string;
  topic: string;
  niche: string;
  trendStrength: 'strong' | 'moderate' | 'weak';
  description: string;
  suggestedAngle: string;
  detectedAt: string;
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_ALERTS = 50;

// ---------------------------------------------------------------------------
// Task 167: Trend detection
// ---------------------------------------------------------------------------

export async function detectNicheTrends(
  niche: string,
  apiKey: string,
): Promise<NicheTrend[]> {
  try {
    // Search for recent popular videos in the niche
    const searchRes = await fetchWithTimeout(
      `${YT_API_BASE}/search?part=snippet&q=${encodeURIComponent(niche)}&order=viewCount&type=video&publishedAfter=${getWeekAgoISO()}&maxResults=25&key=${apiKey}`,
      {},
      { timeoutMs: 15000, maxRetries: 2 },
    );
    const searchData = await searchRes.json();
    const items = searchData.items ?? [];

    if (items.length === 0) {
      logger.info('TrendDetector', `No recent trending videos found for niche: ${niche}`);
      return [];
    }

    // Fetch video details for view counts
    const videoIds = items.map((v: { id: { videoId: string } }) => v.id.videoId).filter(Boolean);
    let videoStats = new Map<string, { viewCount: number; likeCount: number; tags: string[] }>();

    if (videoIds.length > 0) {
      const statsRes = await fetchWithTimeout(
        `${YT_API_BASE}/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${apiKey}`,
        {},
        { timeoutMs: 15000, maxRetries: 2 },
      );
      const statsData = await statsRes.json();
      for (const v of statsData.items ?? []) {
        videoStats.set(v.id, {
          viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
          likeCount: parseInt(v.statistics?.likeCount ?? '0', 10),
          tags: v.snippet?.tags ?? [],
        });
      }
    }

    // Extract trending topics from titles and tags
    const topicMap = new Map<string, { totalViews: number; count: number; sources: Set<string> }>();

    for (const item of items) {
      const videoId = item.id.videoId;
      const title = item.snippet?.title ?? '';
      const stats = videoStats.get(videoId);
      const viewCount = stats?.viewCount ?? 0;
      const tags = stats?.tags ?? [];

      // Extract key phrases from title
      const phrases = extractKeyPhrases(title);
      for (const phrase of phrases) {
        const existing = topicMap.get(phrase) ?? { totalViews: 0, count: 0, sources: new Set() };
        existing.totalViews += viewCount;
        existing.count++;
        existing.sources.add(item.snippet?.channelTitle ?? 'Unknown');
        topicMap.set(phrase, existing);
      }

      // Also track tags
      for (const tag of tags.slice(0, 5)) {
        const normalized = tag.toLowerCase().trim();
        if (normalized.length > 3 && normalized.includes(niche.toLowerCase().split(' ')[0])) {
          const existing = topicMap.get(normalized) ?? { totalViews: 0, count: 0, sources: new Set() };
          existing.totalViews += viewCount;
          existing.count++;
          existing.sources.add(item.snippet?.channelTitle ?? 'Unknown');
          topicMap.set(normalized, existing);
        }
      }
    }

    // Convert to NicheTrend array
    const trends: NicheTrend[] = [...topicMap.entries()]
      .map(([topic, data]) => ({
        topic,
        relevanceScore: calculateRelevanceScore(topic, niche, data.totalViews, data.count),
        velocity: assessVelocity(data.count, data.totalViews) as NicheTrend['velocity'],
        videoCount: data.count,
        averageViews: Math.round(data.totalViews / data.count),
        detectedAt: new Date().toISOString(),
        sources: [...data.sources].slice(0, 5),
      }))
      .filter(t => t.relevanceScore > 0.3)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 15);

    // Persist trends
    persistTrends(niche, trends);

    logger.success('TrendDetector', `Detected ${trends.length} trends for niche "${niche}"`);
    return trends;
  } catch (err) {
    logger.error('TrendDetector', `Failed to detect trends for niche: ${niche}`, err);
    return [];
  }
}

export async function checkAndAlertTrends(
  niche: string,
  apiKey: string,
): Promise<TrendAlert[]> {
  const trends = await detectNicheTrends(niche, apiKey);
  const alerts: TrendAlert[] = [];

  for (const trend of trends) {
    if (trend.relevanceScore > 0.7 && trend.velocity === 'rising') {
      const alert: TrendAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        topic: trend.topic,
        niche,
        trendStrength: trend.relevanceScore > 0.85 ? 'strong' : trend.relevanceScore > 0.7 ? 'moderate' : 'weak',
        description: `Rising trend detected: "${trend.topic}" with ${trend.videoCount} videos averaging ${trend.averageViews.toLocaleString()} views`,
        suggestedAngle: generateSuggestedAngle(trend.topic, niche),
        detectedAt: new Date().toISOString(),
        acknowledged: false,
      };
      alerts.push(alert);
    }
  }

  // Persist alerts
  if (alerts.length > 0) {
    persistAlerts(alerts);
    for (const alert of alerts) {
      logger.success('TrendDetector', `TREND ALERT: ${alert.description}`);
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Alert management
// ---------------------------------------------------------------------------

export function getAlerts(niche?: string): TrendAlert[] {
  try {
    const stored = safeGetItem('autotube_trend_alerts');
    const all: TrendAlert[] = stored ? JSON.parse(stored) : [];
    return niche ? all.filter(a => a.niche === niche) : all;
  } catch {
    return [];
  }
}

export function acknowledgeAlert(alertId: string): boolean {
  try {
    const stored = safeGetItem('autotube_trend_alerts');
    const all: TrendAlert[] = stored ? JSON.parse(stored) : [];
    const alert = all.find(a => a.id === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    safeSetItem('autotube_trend_alerts', JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function getUnacknowledgedAlerts(): TrendAlert[] {
  return getAlerts().filter(a => !a.acknowledged);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function extractKeyPhrases(title: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'how', 'why', 'what', 'when', 'where', 'who', 'which']);
  const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

  const phrases: string[] = [];
  // Single important words
  for (const w of words) {
    if (w.length > 5) phrases.push(w);
  }
  // Bigrams
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].length > 3 && words[i + 1].length > 3) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }
  }
  return phrases;
}

function calculateRelevanceScore(topic: string, niche: string, totalViews: number, videoCount: number): number {
  const nicheWords = niche.toLowerCase().split(/\s+/);
  const topicWords = topic.toLowerCase().split(/\s+/);
  const wordOverlap = topicWords.filter(w => nicheWords.includes(w)).length;
  const semanticRelevance = nicheWords.length > 0 ? wordOverlap / nicheWords.length : 0;

  // Popularity factor (log scale)
  const popularityFactor = Math.min(1, Math.log10(totalViews + 1) / 8);

  // Volume factor
  const volumeFactor = Math.min(1, videoCount / 10);

  return semanticRelevance * 0.4 + popularityFactor * 0.35 + volumeFactor * 0.25;
}

function assessVelocity(videoCount: number, totalViews: number): string {
  if (videoCount >= 10 && totalViews > 1000000) return 'rising';
  if (videoCount >= 5 && totalViews > 100000) return 'stable';
  return 'declining';
}

function generateSuggestedAngle(topic: string, niche: string): string {
  return `Create a deep-dive video on "${topic}" within the ${niche} niche. ` +
    `Focus on providing unique insights, data, or perspectives that current videos lack. ` +
    `Consider a "truth about ${topic}" or "${topic} explained" angle for maximum engagement.`;
}

function persistTrends(niche: string, trends: NicheTrend[]): void {
  try {
    const stored = safeGetItem('autotube_niche_trends');
    const all: Record<string, NicheTrend[]> = stored ? JSON.parse(stored) : {};
    all[niche] = trends;
    safeSetItem('autotube_niche_trends', JSON.stringify(all));
  } catch (err) {
    logger.error('TrendDetector', 'Failed to persist trends', err);
  }
}

function persistAlerts(alerts: TrendAlert[]): void {
  try {
    const stored = safeGetItem('autotube_trend_alerts');
    const all: TrendAlert[] = stored ? JSON.parse(stored) : [];
    all.push(...alerts);
    // Keep only the most recent alerts
    safeSetItem('autotube_trend_alerts', JSON.stringify(all.slice(-MAX_ALERTS)));
  } catch (err) {
    logger.error('TrendDetector', 'Failed to persist alerts', err);
  }
}

export function getStoredTrends(niche: string): NicheTrend[] {
  try {
    const stored = safeGetItem('autotube_niche_trends');
    const all: Record<string, NicheTrend[]> = stored ? JSON.parse(stored) : {};
    return all[niche] ?? [];
  } catch {
    return [];
  }
}
