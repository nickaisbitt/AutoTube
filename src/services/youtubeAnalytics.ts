import { logger } from './logger';
import { safeSetItem, safeGetItem } from '../utils/storage';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YouTubeAnalyticsData {
  videoId: string;
  fetchedAt: string;
  views: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  averagePercentViewed: number;
  ctr: number;
  subscriberGain: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  retentionCurve: RetentionDataPoint[];
}

export interface RetentionDataPoint {
  timestampPercent: number;
  audienceRetentionPercent: number;
}

export interface RetentionAnalysis {
  overallRetention: number;
  dropOffPoints: DropOffPoint[];
  strongSegments: StrongSegment[];
  correlationWithScript: SegmentCorrelation[];
}

export interface DropOffPoint {
  timestampPercent: number;
  retentionPercent: number;
  severity: 'minor' | 'moderate' | 'severe';
  likelyCause: string;
}

export interface StrongSegment {
  startPercent: number;
  endPercent: number;
  peakRetention: number;
}

export interface SegmentCorrelation {
  segmentIndex: number;
  segmentTitle: string;
  scriptTimePercent: number;
  retentionAtSegment: number;
  retentionDelta: number;
  assessment: 'strong' | 'adequate' | 'weak';
}

export interface CTRRecord {
  id: string;
  videoId: string;
  title: string;
  thumbnailHash: string;
  ctr: number;
  impressions: number;
  date: string;
}

export interface CommentSentiment {
  videoId: string;
  overallScore: number;
  label: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  topComments: AnalyzedComment[];
  flaggedNegative: AnalyzedComment[];
  analyzedAt: string;
}

export interface AnalyzedComment {
  text: string;
  author: string;
  likeCount: number;
  sentiment: number;
  sentimentLabel: 'positive' | 'neutral' | 'negative';
  isFlagged: boolean;
}

export interface ROITracking {
  videoId: string;
  title: string;
  createdAt: string;
  costs: CostBreakdown;
  revenue: RevenueBreakdown;
  roiRatio: number;
  netProfit: number;
}

export interface CostBreakdown {
  apiTokens: number;
  apiCostUSD: number;
  computeTimeMinutes: number;
  computeCostUSD: number;
  stockMediaCostUSD: number;
  totalCostUSD: number;
}

export interface RevenueBreakdown {
  adRevenueUSD: number;
  sponsorRevenueUSD: number;
  affiliateRevenueUSD: number;
  totalRevenueUSD: number;
}

// ---------------------------------------------------------------------------
// YouTube Data API helpers
// ---------------------------------------------------------------------------

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytFetch(path: string, apiKey: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${YT_API_BASE}${path}${sep}key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Task 159: YouTube Analytics integration
// ---------------------------------------------------------------------------

export async function fetchYouTubeAnalytics(
  videoId: string,
  apiKey: string,
): Promise<YouTubeAnalyticsData | null> {
  try {
    // Fetch video statistics
    const statsRes = await ytFetch(
      `/videos?part=statistics,contentDetails&id=${videoId}`,
      apiKey,
    ) as { items?: Array<{ statistics: Record<string, string>; contentDetails: { duration: string } }> };

    const stats = statsRes.items?.[0]?.statistics;
    if (!stats) {
      logger.warn('YouTubeAnalytics', `No stats found for video ${videoId}`);
      return null;
    }

    const views = parseInt(stats.viewCount ?? '0', 10);
    const likeCount = parseInt(stats.likeCount ?? '0', 10);
    const commentCount = parseInt(stats.commentCount ?? '0', 10);

    // Parse ISO 8601 duration
    const durationStr = statsRes.items?.[0]?.contentDetails?.duration ?? 'PT0M';
    const durationSeconds = parseISO8601Duration(durationStr);
    const averageViewDurationSeconds = parseFloat(stats.averageViewDuration ?? '0');
    const averagePercentViewed = durationSeconds > 0
      ? Math.min(100, (averageViewDurationSeconds / durationSeconds) * 100)
      : 0;

    // Watch time in minutes
    const watchTimeMinutes = Math.round((averageViewDurationSeconds * views) / 60);

    // Estimate CTR from engagement (actual CTR requires YouTube Analytics API OAuth)
    const engagementRate = views > 0 ? ((likeCount + commentCount) / views) * 100 : 0;
    const ctr = Math.min(30, engagementRate * 2.5); // Heuristic approximation

    // Subscriber gain not available without OAuth — estimate from engagement
    const subscriberGain = Math.round(views * 0.001 * (engagementRate / 10));

    const data: YouTubeAnalyticsData = {
      videoId,
      fetchedAt: new Date().toISOString(),
      views,
      watchTimeMinutes,
      averageViewDurationSeconds,
      averagePercentViewed,
      ctr,
      subscriberGain,
      likeCount,
      commentCount,
      shareCount: parseInt(stats.shareCount ?? '0', 10),
      retentionCurve: [],
    };

    // Persist
    storeAnalyticsData(data);
    logger.success('YouTubeAnalytics', `Fetched analytics for ${videoId}: ${views} views, ${ctr.toFixed(1)}% CTR`);
    return data;
  } catch (err) {
    logger.error('YouTubeAnalytics', `Failed to fetch analytics for ${videoId}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Task 160: Retention curve analysis
// ---------------------------------------------------------------------------

export function analyzeRetentionCurve(
  retentionData: RetentionDataPoint[],
  scriptSegments: Array<{ title: string; startPercent: number; endPercent: number }>,
): RetentionAnalysis {
  if (retentionData.length === 0) {
    return {
      overallRetention: 0,
      dropOffPoints: [],
      strongSegments: [],
      correlationWithScript: [],
    };
  }

  // Overall average retention
  const overallRetention = retentionData.reduce((s, p) => s + p.audienceRetentionPercent, 0) / retentionData.length;

  // Detect drop-off points (>5% drop between consecutive points)
  const dropOffPoints: DropOffPoint[] = [];
  for (let i = 1; i < retentionData.length; i++) {
    const prev = retentionData[i - 1];
    const curr = retentionData[i];
    const drop = prev.audienceRetentionPercent - curr.audienceRetentionPercent;
    if (drop > 5) {
      const severity: DropOffPoint['severity'] = drop > 15 ? 'severe' : drop > 10 ? 'moderate' : 'minor';
      const likelyCause = inferDropOffCause(curr.timestampPercent, scriptSegments);
      dropOffPoints.push({
        timestampPercent: curr.timestampPercent,
        retentionPercent: curr.audienceRetentionPercent,
        severity,
        likelyCause,
      });
    }
  }

  // Detect strong segments (retention above average for 3+ consecutive points)
  const strongSegments: StrongSegment[] = [];
  let segStart = -1;
  for (let i = 0; i < retentionData.length; i++) {
    if (retentionData[i].audienceRetentionPercent > overallRetention) {
      if (segStart === -1) segStart = i;
    } else {
      if (segStart !== -1 && i - segStart >= 3) {
        strongSegments.push({
          startPercent: retentionData[segStart].timestampPercent,
          endPercent: retentionData[i - 1].timestampPercent,
          peakRetention: Math.max(...retentionData.slice(segStart, i).map(p => p.audienceRetentionPercent)),
        });
      }
      segStart = -1;
    }
  }
  if (segStart !== -1 && retentionData.length - segStart >= 3) {
    strongSegments.push({
      startPercent: retentionData[segStart].timestampPercent,
      endPercent: retentionData[retentionData.length - 1].timestampPercent,
      peakRetention: Math.max(...retentionData.slice(segStart).map(p => p.audienceRetentionPercent)),
    });
  }

  // Correlate with script segments
  const correlationWithScript: SegmentCorrelation[] = scriptSegments.map((seg, idx) => {
    const retentionAtSegment = interpolateRetention(retentionData, seg.startPercent);
    const retentionAtEnd = interpolateRetention(retentionData, seg.endPercent);
    const retentionDelta = retentionAtEnd - retentionAtSegment;
    const assessment: SegmentCorrelation['assessment'] =
      retentionDelta > 2 ? 'strong' : retentionDelta > -5 ? 'adequate' : 'weak';
    return {
      segmentIndex: idx,
      segmentTitle: seg.title,
      scriptTimePercent: seg.startPercent,
      retentionAtSegment,
      retentionDelta,
      assessment,
    };
  });

  return { overallRetention, dropOffPoints, strongSegments, correlationWithScript };
}

function interpolateRetention(curve: RetentionDataPoint[], targetPercent: number): number {
  if (curve.length === 0) return 0;
  if (targetPercent <= curve[0].timestampPercent) return curve[0].audienceRetentionPercent;
  if (targetPercent >= curve[curve.length - 1].timestampPercent) return curve[curve.length - 1].audienceRetentionPercent;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].timestampPercent >= targetPercent) {
      const prev = curve[i - 1];
      const curr = curve[i];
      const t = (targetPercent - prev.timestampPercent) / (curr.timestampPercent - prev.timestampPercent);
      return prev.audienceRetentionPercent + t * (curr.audienceRetentionPercent - prev.audienceRetentionPercent);
    }
  }
  return curve[curve.length - 1].audienceRetentionPercent;
}

function inferDropOffCause(
  timestampPercent: number,
  segments: Array<{ title: string; startPercent: number; endPercent: number }>,
): string {
  const segment = segments.find(s => timestampPercent >= s.startPercent && timestampPercent <= s.endPercent);
  if (segment) {
    return `Drop-off during segment "${segment.title}" — likely pacing or topic engagement issue`;
  }
  return 'Drop-off at transition point between segments';
}

// ---------------------------------------------------------------------------
// Task 161: CTR tracking
// ---------------------------------------------------------------------------

export function trackCTR(
  videoId: string,
  title: string,
  thumbnailHash: string,
  ctr: number,
  impressions: number,
): CTRRecord {
  const record: CTRRecord = {
    id: `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    videoId,
    title,
    thumbnailHash,
    ctr,
    impressions,
    date: new Date().toISOString(),
  };

  try {
    const stored = safeGetItem('autotube_ctr_records');
    const all: CTRRecord[] = stored ? JSON.parse(stored) : [];
    all.push(record);
    safeSetItem('autotube_ctr_records', JSON.stringify(all.slice(-200)));
    logger.success('CTRTracker', `Tracked CTR: ${ctr.toFixed(1)}% for "${title}"`);
  } catch (err) {
    logger.error('CTRTracker', 'Failed to track CTR', err);
  }

  return record;
}

export function getCTRRecords(videoId?: string): CTRRecord[] {
  try {
    const stored = safeGetItem('autotube_ctr_records');
    const all: CTRRecord[] = stored ? JSON.parse(stored) : [];
    return videoId ? all.filter(r => r.videoId === videoId) : all;
  } catch {
    return [];
  }
}

export function getCTRSummary(): { averageCTR: number; bestPerformers: CTRRecord[]; worstPerformers: CTRRecord[] } {
  const records = getCTRRecords();
  if (records.length === 0) {
    return { averageCTR: 0, bestPerformers: [], worstPerformers: [] };
  }
  const averageCTR = records.reduce((s, r) => s + r.ctr, 0) / records.length;
  const sorted = [...records].sort((a, b) => b.ctr - a.ctr);
  return {
    averageCTR,
    bestPerformers: sorted.slice(0, 5),
    worstPerformers: sorted.slice(-5).reverse(),
  };
}

// ---------------------------------------------------------------------------
// Task 162: Comment sentiment analysis
// ---------------------------------------------------------------------------

export async function analyzeCommentSentiment(
  videoId: string,
  apiKey: string,
  llmApiKey: string,
): Promise<CommentSentiment | null> {
  try {
    // Fetch top comments via YouTube Data API
    const commentsRes = await ytFetch(
      `/commentThreads?part=snippet&videoId=${videoId}&order=relevance&maxResults=20`,
      apiKey,
    ) as { items?: Array<{ snippet: { topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string; likeCount: number } } } }> };

    const items = commentsRes.items ?? [];
    if (items.length === 0) {
      logger.warn('CommentSentiment', `No comments found for video ${videoId}`);
      return null;
    }

    const comments = items.map(item => {
      const s = item.snippet.topLevelComment.snippet;
      return { text: s.textDisplay, author: s.authorDisplayName, likeCount: s.likeCount };
    });

    // Use LLM to analyze sentiment
    const prompt = [
      'Analyze the sentiment of these YouTube comments. For each comment, return:',
      '- sentiment: a number from -1 (very negative) to 1 (very positive)',
      '- label: "positive", "neutral", or "negative"',
      '- isFlagged: true if the comment is toxic, hateful, spam, or harassing',
      '',
      'Comments:',
      ...comments.map((c, i) => `${i + 1}. [${c.author}] (likes: ${c.likeCount}) "${c.text}"`),
      '',
      'Return JSON: { "results": [{ "index": N, "sentiment": N, "label": "...", "isFlagged": bool }] }',
    ].join('\n');

    const body = JSON.stringify({
      model: 'openai/gpt-5.4-nano',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const res = await fetchWithTimeout('/api/llm', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llmApiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    }, { timeoutMs: 30_000, maxRetries: 1 });

    if (!res.ok) {
      logger.error('CommentSentiment', `LLM API failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: { results: Array<{ index: number; sentiment: number; label: string; isFlagged: boolean }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { results: [] };
    }

    const analyzedComments: AnalyzedComment[] = comments.map((c, i) => {
      const result = parsed.results.find((r: { index: number }) => r.index === i + 1);
      return {
        text: c.text,
        author: c.author,
        likeCount: c.likeCount,
        sentiment: result?.sentiment ?? 0,
        sentimentLabel: (result?.label as AnalyzedComment['sentimentLabel']) ?? 'neutral',
        isFlagged: result?.isFlagged ?? false,
      };
    });

    const overallScore = analyzedComments.reduce((s, c) => s + c.sentiment, 0) / analyzedComments.length;
    const label: CommentSentiment['label'] =
      overallScore > 0.6 ? 'very_positive' :
      overallScore > 0.2 ? 'positive' :
      overallScore > -0.2 ? 'neutral' :
      overallScore > -0.6 ? 'negative' : 'very_negative';

    const sentiment: CommentSentiment = {
      videoId,
      overallScore,
      label,
      topComments: analyzedComments.sort((a, b) => b.likeCount - a.likeCount).slice(0, 10),
      flaggedNegative: analyzedComments.filter(c => c.isFlagged),
      analyzedAt: new Date().toISOString(),
    };

    // Persist
    storeCommentSentiment(sentiment);
    logger.success('CommentSentiment', `Sentiment: ${label} (${overallScore.toFixed(2)}) for video ${videoId}`);
    return sentiment;
  } catch (err) {
    logger.error('CommentSentiment', `Failed to analyze comments for ${videoId}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Task 168: ROI tracking
// ---------------------------------------------------------------------------

export function trackROI(videoId: string, title: string, costs: CostBreakdown, revenue: RevenueBreakdown): ROITracking {
  const roiRatio = costs.totalCostUSD > 0 ? revenue.totalRevenueUSD / costs.totalCostUSD : 0;
  const netProfit = revenue.totalRevenueUSD - costs.totalCostUSD;

  const tracking: ROITracking = {
    videoId,
    title,
    createdAt: new Date().toISOString(),
    costs,
    revenue,
    roiRatio,
    netProfit,
  };

  try {
    const stored = safeGetItem('autotube_roi_tracking');
    const all: ROITracking[] = stored ? JSON.parse(stored) : [];
    all.push(tracking);
    safeSetItem('autotube_roi_tracking', JSON.stringify(all.slice(-100)));
    logger.success('ROI', `Tracked ROI for "${title}": ${roiRatio.toFixed(2)}x ($${netProfit.toFixed(2)} net)`);
  } catch (err) {
    logger.error('ROI', 'Failed to track ROI', err);
  }

  return tracking;
}

export function getROITracking(): ROITracking[] {
  try {
    const stored = safeGetItem('autotube_roi_tracking');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function getROISummary(): {
  totalVideos: number;
  totalCosts: number;
  totalRevenue: number;
  averageROI: number;
  totalNetProfit: number;
} {
  const all = getROITracking();
  if (all.length === 0) return { totalVideos: 0, totalCosts: 0, totalRevenue: 0, averageROI: 0, totalNetProfit: 0 };

  const totalCosts = all.reduce((s, r) => s + r.costs.totalCostUSD, 0);
  const totalRevenue = all.reduce((s, r) => s + r.revenue.totalRevenueUSD, 0);
  const totalNetProfit = totalRevenue - totalCosts;
  const averageROI = totalCosts > 0 ? totalRevenue / totalCosts : 0;

  return {
    totalVideos: all.length,
    totalCosts,
    totalRevenue,
    averageROI,
    totalNetProfit,
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function storeAnalyticsData(data: YouTubeAnalyticsData): void {
  try {
    const stored = safeGetItem('autotube_yt_analytics');
    const all: YouTubeAnalyticsData[] = stored ? JSON.parse(stored) : [];
    const idx = all.findIndex(d => d.videoId === data.videoId);
    if (idx >= 0) all[idx] = data;
    else all.push(data);
    safeSetItem('autotube_yt_analytics', JSON.stringify(all.slice(-100)));
  } catch (err) {
    logger.error('YouTubeAnalytics', 'Failed to store analytics', err);
  }
}

function storeCommentSentiment(data: CommentSentiment): void {
  try {
    const stored = safeGetItem('autotube_comment_sentiment');
    const all: CommentSentiment[] = stored ? JSON.parse(stored) : [];
    const idx = all.findIndex(d => d.videoId === data.videoId);
    if (idx >= 0) all[idx] = data;
    else all.push(data);
    safeSetItem('autotube_comment_sentiment', JSON.stringify(all.slice(-100)));
  } catch (err) {
    logger.error('CommentSentiment', 'Failed to store sentiment', err);
  }
}

export function getStoredAnalytics(): YouTubeAnalyticsData[] {
  try {
    const stored = safeGetItem('autotube_yt_analytics');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function getStoredSentiment(): CommentSentiment[] {
  try {
    const stored = safeGetItem('autotube_comment_sentiment');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
