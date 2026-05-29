import { logger } from './logger';
import { safeSetItem, safeGetItem } from '../utils/storage';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompetitorChannel {
  id: string;
  channelId: string;
  channelName: string;
  niche: string;
  addedAt: string;
  lastCheckedAt: string | null;
}

export interface CompetitorSnapshot {
  channelId: string;
  channelName: string;
  fetchedAt: string;
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  recentUploads: CompetitorVideo[];
  averageUploadFrequencyDays: number;
  dominantTopics: string[];
  thumbnailStyle: ThumbnailStyleAnalysis;
  titlePatterns: TitlePatternAnalysis;
}

export interface CompetitorVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  duration: string;
  tags: string[];
}

export interface ThumbnailStyleAnalysis {
  dominantColors: string[];
  textOverlay: boolean;
  faceCount: number;
  averageComplexity: 'simple' | 'moderate' | 'complex';
}

export interface TitlePatternAnalysis {
  averageLength: number;
  usesNumbers: boolean;
  usesEmotionalWords: boolean;
  usesQuestionMarks: boolean;
  commonWords: string[];
  style: 'listicle' | 'question' | 'howto' | 'news' | 'documentary' | 'mixed';
}

export interface CompetitorReport {
  generatedAt: string;
  channels: CompetitorSnapshot[];
  insights: CompetitorInsight[];
}

export interface CompetitorInsight {
  type: 'upload_frequency' | 'topic_trend' | 'title_pattern' | 'thumbnail_trend' | 'engagement';
  description: string;
  actionable: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_TRACKED_CHANNELS = 10;

// ---------------------------------------------------------------------------
// Channel management
// ---------------------------------------------------------------------------

export function addCompetitorChannel(channelId: string, channelName: string, niche: string): CompetitorChannel | null {
  const existing = getCompetitorChannels();
  if (existing.length >= MAX_TRACKED_CHANNELS) {
    logger.warn('CompetitorTracker', `Max ${MAX_TRACKED_CHANNELS} channels reached`);
    return null;
  }
  if (existing.some(c => c.channelId === channelId)) {
    logger.warn('CompetitorTracker', `Channel ${channelId} already tracked`);
    return null;
  }

  const channel: CompetitorChannel = {
    id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    channelId,
    channelName,
    niche,
    addedAt: new Date().toISOString(),
    lastCheckedAt: null,
  };

  persistChannel(channel);
  logger.success('CompetitorTracker', `Added competitor: ${channelName}`);
  return channel;
}

export function removeCompetitorChannel(channelId: string): boolean {
  try {
    const stored = safeGetItem('autotube_competitors');
    const all: CompetitorChannel[] = stored ? JSON.parse(stored) : [];
    const filtered = all.filter(c => c.channelId !== channelId);
    if (filtered.length === all.length) return false;
    safeSetItem('autotube_competitors', JSON.stringify(filtered));
    logger.info('CompetitorTracker', `Removed competitor channel ${channelId}`);
    return true;
  } catch {
    return false;
  }
}

export function getCompetitorChannels(): CompetitorChannel[] {
  try {
    const stored = safeGetItem('autotube_competitors');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Task 166: Competitor analysis
// ---------------------------------------------------------------------------

export async function fetchCompetitorSnapshot(
  channelId: string,
  apiKey: string,
): Promise<CompetitorSnapshot | null> {
  try {
    // Fetch channel details and recent videos
    const channelRes = await fetchWithTimeout(
      `${YT_API_BASE}/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`,
      {},
      { timeoutMs: 10000, maxRetries: 2 },
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];
    if (!channel) {
      logger.warn('CompetitorTracker', `Channel ${channelId} not found`);
      return null;
    }

    const stats = channel.statistics;
    const channelName = channel.snippet?.title ?? 'Unknown';

    // Fetch recent videos
    const videosRes = await fetchWithTimeout(
      `${YT_API_BASE}/search?part=snippet&channelId=${channelId}&order=date&maxResults=15&type=video&key=${apiKey}`,
      {},
      { timeoutMs: 10000, maxRetries: 2 },
    );
    const videosData = await videosRes.json();
    const videoItems = videosData.items ?? [];

    // Fetch video statistics for each recent video
    const videoIds = videoItems.map((v: { id: { videoId: string } }) => v.id.videoId).filter(Boolean);
    let videoStatsMap = new Map<string, { viewCount: number; likeCount: number; duration: string; tags: string[] }>();

    if (videoIds.length > 0) {
      const statsRes = await fetchWithTimeout(
        `${YT_API_BASE}/videos?part=statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`,
        {},
        { timeoutMs: 10000, maxRetries: 2 },
      );
      const statsData = await statsRes.json();
      for (const v of statsData.items ?? []) {
        videoStatsMap.set(v.id, {
          viewCount: parseInt(v.statistics?.viewCount ?? '0', 10),
          likeCount: parseInt(v.statistics?.likeCount ?? '0', 10),
          duration: v.contentDetails?.duration ?? 'PT0S',
          tags: v.snippet?.tags ?? [],
        });
      }
    }

    const recentUploads: CompetitorVideo[] = videoItems.map((v: { id: { videoId: string }; snippet: { title: string; publishedAt: string } }) => {
      const vidStats = videoStatsMap.get(v.id.videoId);
      return {
        videoId: v.id.videoId,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        viewCount: vidStats?.viewCount ?? 0,
        likeCount: vidStats?.likeCount ?? 0,
        duration: vidStats?.duration ?? 'PT0S',
        tags: vidStats?.tags ?? [],
      };
    });

    // Calculate upload frequency
    const uploadFrequency = calculateUploadFrequency(recentUploads);

    // Analyze topics from titles
    const dominantTopics = extractDominantTopics(recentUploads);

    // Analyze thumbnail style (from snippet metadata — actual image analysis not possible via API)
    const thumbnailStyle = analyzeThumbnailStyleFromMeta(recentUploads);

    // Analyze title patterns
    const titlePatterns = analyzeTitlePatterns(recentUploads);

    const snapshot: CompetitorSnapshot = {
      channelId,
      channelName,
      fetchedAt: new Date().toISOString(),
      subscriberCount: parseInt(stats.subscriberCount ?? '0', 10),
      videoCount: parseInt(stats.videoCount ?? '0', 10),
      totalViews: parseInt(stats.viewCount ?? '0', 10),
      recentUploads,
      averageUploadFrequencyDays: uploadFrequency,
      dominantTopics,
      thumbnailStyle,
      titlePatterns,
    };

    persistSnapshot(snapshot);

    // Update lastCheckedAt on the channel
    updateChannelCheckTime(channelId);

    logger.success('CompetitorTracker', `Fetched snapshot for ${channelName}: ${stats.subscriberCount} subscribers, ${recentUploads.length} recent videos`);
    return snapshot;
  } catch (err) {
    logger.error('CompetitorTracker', `Failed to fetch snapshot for ${channelId}`, err);
    return null;
  }
}

export async function fetchAllCompetitorSnapshots(apiKey: string): Promise<CompetitorSnapshot[]> {
  const channels = getCompetitorChannels();
  const snapshots: CompetitorSnapshot[] = [];
  for (const ch of channels) {
    const snapshot = await fetchCompetitorSnapshot(ch.channelId, apiKey);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

function calculateUploadFrequency(videos: CompetitorVideo[]): number {
  if (videos.length < 2) return 0;
  const dates = videos.map(v => new Date(v.publishedAt).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
  }
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
}

function extractDominantTopics(videos: CompetitorVideo[]): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'how', 'why', 'what', 'when', 'where', 'who', 'which', 'does', 'do', 'you', 'your', 'my', 'our', 'their', 'its', 'his', 'her']);
  const wordCount = new Map<string, number>();

  for (const video of videos) {
    const words = video.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length > 3 && !stopWords.has(w)) {
        wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
      }
    }
  }

  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function analyzeThumbnailStyleFromMeta(_videos: CompetitorVideo[]): ThumbnailStyleAnalysis {
  // Without image analysis, provide structural defaults
  return {
    dominantColors: [],
    textOverlay: true,
    faceCount: 0,
    averageComplexity: 'moderate',
  };
}

function analyzeTitlePatterns(videos: CompetitorVideo[]): TitlePatternAnalysis {
  const titles = videos.map(v => v.title);
  const lengths = titles.map(t => t.length);
  const averageLength = lengths.reduce((s, l) => s + l, 0) / lengths.length;

  const numbersUsed = titles.filter(t => /\d+/.test(t)).length;
  const emotionalWords = ['amazing', 'incredible', 'shocking', 'secret', 'truth', 'never', 'always', 'best', 'worst', 'crazy', 'insane', 'unbelievable'];
  const emotionalUsed = titles.filter(t => emotionalWords.some(w => t.toLowerCase().includes(w))).length;
  const questionsUsed = titles.filter(t => t.includes('?')).length;

  const allWords = titles.flatMap(t => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/));
  const wordFreq = new Map<string, number>();
  for (const w of allWords) {
    if (w.length > 3) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  const commonWords = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);

  let style: TitlePatternAnalysis['style'] = 'mixed';
  const listiclePattern = titles.filter(t => /^\d+[\s.:]/.test(t) || /\d+\s+(best|worst|top|ways|reasons|things)/i.test(t)).length;
  const questionPattern = questionsUsed;
  const howtoPattern = titles.filter(t => /^how\s+(to|i)/i.test(t)).length;
  const newsPattern = titles.filter(t => /\b(breaking|just|now|update|announces?)\b/i.test(t)).length;

  const maxPattern = Math.max(listiclePattern, questionPattern, howtoPattern, newsPattern);
  if (maxPattern === listiclePattern && listiclePattern >= 2) style = 'listicle';
  else if (maxPattern === questionPattern && questionPattern >= 2) style = 'question';
  else if (maxPattern === howtoPattern && howtoPattern >= 2) style = 'howto';
  else if (maxPattern === newsPattern && newsPattern >= 2) style = 'news';

  return {
    averageLength,
    usesNumbers: numbersUsed / titles.length > 0.3,
    usesEmotionalWords: emotionalUsed / titles.length > 0.3,
    usesQuestionMarks: questionsUsed / titles.length > 0.2,
    commonWords,
    style,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function generateCompetitorReport(): CompetitorReport {
  const snapshots = getStoredSnapshots();
  const insights: CompetitorInsight[] = [];

  // Generate insights from snapshots
  for (const snap of snapshots) {
    if (snap.averageUploadFrequencyDays > 0) {
      insights.push({
        type: 'upload_frequency',
        description: `${snap.channelName} uploads every ${snap.averageUploadFrequencyDays.toFixed(1)} days`,
        actionable: snap.averageUploadFrequencyDays < 3
          ? 'High-frequency channel — focus on quality over quantity to differentiate'
          : 'Moderate frequency — you can match pace while focusing on production value',
      });
    }

    if (snap.titlePatterns.usesEmotionalWords) {
      insights.push({
        type: 'title_pattern',
        description: `${snap.channelName} uses emotional/curiosity-driven titles`,
        actionable: 'Consider testing emotional hooks in your titles while maintaining authenticity',
      });
    }

    if (snap.dominantTopics.length > 0) {
      insights.push({
        type: 'topic_trend',
        description: `${snap.channelName} focuses on: ${snap.dominantTopics.slice(0, 5).join(', ')}`,
        actionable: 'Identify underserved sub-topics within these themes for differentiation',
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    channels: snapshots,
    insights,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persistChannel(channel: CompetitorChannel): void {
  try {
    const stored = safeGetItem('autotube_competitors');
    const all: CompetitorChannel[] = stored ? JSON.parse(stored) : [];
    all.push(channel);
    safeSetItem('autotube_competitors', JSON.stringify(all));
  } catch (err) {
    logger.error('CompetitorTracker', 'Failed to persist channel', err);
  }
}

function persistSnapshot(snapshot: CompetitorSnapshot): void {
  try {
    const stored = safeGetItem('autotube_competitor_snapshots');
    const all: CompetitorSnapshot[] = stored ? JSON.parse(stored) : [];
    // Replace existing snapshot for same channel
    const idx = all.findIndex(s => s.channelId === snapshot.channelId);
    if (idx >= 0) all[idx] = snapshot;
    else all.push(snapshot);
    safeSetItem('autotube_competitor_snapshots', JSON.stringify(all.slice(-100)));
  } catch (err) {
    logger.error('CompetitorTracker', 'Failed to persist snapshot', err);
  }
}

function updateChannelCheckTime(channelId: string): void {
  try {
    const stored = safeGetItem('autotube_competitors');
    const all: CompetitorChannel[] = stored ? JSON.parse(stored) : [];
    const ch = all.find(c => c.channelId === channelId);
    if (ch) {
      ch.lastCheckedAt = new Date().toISOString();
      safeSetItem('autotube_competitors', JSON.stringify(all));
    }
  } catch { /* ignore */ }
}

function getStoredSnapshots(): CompetitorSnapshot[] {
  try {
    const stored = safeGetItem('autotube_competitor_snapshots');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
