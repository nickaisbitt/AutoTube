import { safeGetItem } from '../utils/storage';
import type { YouTubeAnalyticsData, ROITracking, CTRRecord, CommentSentiment } from './youtubeAnalytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardData {
  generatedAt: string;
  overview: {
    totalVideos: number;
    totalViews: number;
    totalWatchTimeHours: number;
    averageCTR: number;
    averageRetention: number;
    totalSubscribersGained: number;
  };
  viewsOverTime: Array<{ date: string; views: number; videoId: string }>;
  retentionCurves: Array<{ videoId: string; title: string; curve: Array<{ percent: number; retention: number }> }>;
  ctrTrends: Array<{ date: string; ctr: number; title: string }>;
  bestTopics: Array<{ topic: string; averageViews: number; videoCount: number }>;
  roi: {
    totalCosts: number;
    totalRevenue: number;
    averageROI: number;
    netProfit: number;
  };
  sentimentOverview: {
    averageSentiment: number;
    label: string;
    flaggedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

function getAnalyticsData(): YouTubeAnalyticsData[] {
  try {
    const stored = safeGetItem('autotube_yt_analytics');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function getROIData(): ROITracking[] {
  try {
    const stored = safeGetItem('autotube_roi_tracking');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function getCTRData(): CTRRecord[] {
  try {
    const stored = safeGetItem('autotube_ctr_records');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function getSentimentData(): CommentSentiment[] {
  try {
    const stored = safeGetItem('autotube_comment_sentiment');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Dashboard generation
// ---------------------------------------------------------------------------

export function generateDashboardData(): DashboardData {
  const analytics = getAnalyticsData();
  const roi = getROIData();
  const ctrRecords = getCTRData();
  const sentiment = getSentimentData();

  // Overview
  const totalVideos = analytics.length;
  const totalViews = analytics.reduce((s, a) => s + a.views, 0);
  const totalWatchTimeHours = analytics.reduce((s, a) => s + a.watchTimeMinutes, 0) / 60;
  const averageCTR = analytics.length > 0
    ? analytics.reduce((s, a) => s + a.ctr, 0) / analytics.length
    : 0;
  const averageRetention = analytics.length > 0
    ? analytics.reduce((s, a) => s + a.averagePercentViewed, 0) / analytics.length
    : 0;
  const totalSubscribersGained = analytics.reduce((s, a) => s + a.subscriberGain, 0);

  // Views over time
  const viewsOverTime = analytics
    .map(a => ({ date: a.fetchedAt.split('T')[0], views: a.views, videoId: a.videoId }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Retention curves
  const retentionCurves = analytics
    .filter(a => a.retentionCurve.length > 0)
    .map(a => ({
      videoId: a.videoId,
      title: a.videoId,
      curve: a.retentionCurve.map(p => ({ percent: p.timestampPercent, retention: p.audienceRetentionPercent })),
    }));

  // CTR trends
  const ctrTrends = ctrRecords
    .map(r => ({ date: r.date.split('T')[0], ctr: r.ctr, title: r.title }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Best topics (aggregate by topic-like grouping from titles)
  const topicMap = new Map<string, { totalViews: number; count: number }>();
  for (const a of analytics) {
    const topic = extractTopic(a.videoId);
    const existing = topicMap.get(topic) ?? { totalViews: 0, count: 0 };
    existing.totalViews += a.views;
    existing.count++;
    topicMap.set(topic, existing);
  }
  const bestTopics = [...topicMap.entries()]
    .map(([topic, data]) => ({
      topic,
      averageViews: Math.round(data.totalViews / data.count),
      videoCount: data.count,
    }))
    .sort((a, b) => b.averageViews - a.averageViews)
    .slice(0, 10);

  // ROI
  const totalCosts = roi.reduce((s, r) => s + r.costs.totalCostUSD, 0);
  const totalRevenue = roi.reduce((s, r) => s + r.revenue.totalRevenueUSD, 0);
  const averageROI = totalCosts > 0 ? totalRevenue / totalCosts : 0;

  // Sentiment
  const avgSentiment = sentiment.length > 0
    ? sentiment.reduce((s, c) => s + c.overallScore, 0) / sentiment.length
    : 0;
  const flaggedCount = sentiment.reduce((s, c) => s + c.flaggedNegative.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalVideos,
      totalViews,
      totalWatchTimeHours,
      averageCTR,
      averageRetention,
      totalSubscribersGained,
    },
    viewsOverTime,
    retentionCurves,
    ctrTrends,
    bestTopics,
    roi: {
      totalCosts,
      totalRevenue,
      averageROI,
      netProfit: totalRevenue - totalCosts,
    },
    sentimentOverview: {
      averageSentiment: avgSentiment,
      label: avgSentiment > 0.6 ? 'very_positive' : avgSentiment > 0.2 ? 'positive' : avgSentiment > -0.2 ? 'neutral' : avgSentiment > -0.6 ? 'negative' : 'very_negative',
      flaggedCount,
    },
  };
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

export function generateDashboardHTML(data: DashboardData): string {
  const { overview, viewsOverTime, ctrTrends, bestTopics, roi, sentimentOverview } = data;

  const viewsChartData = viewsOverTime.map(v => `["${v.date}", ${v.views}]`).join(',');
  const ctrChartData = ctrTrends.map(c => `["${c.date}", ${c.ctr.toFixed(1)}]`).join(',');
  const topicsTable = bestTopics.map(t =>
    `<tr><td>${escapeHtml(t.topic)}</td><td>${t.averageViews.toLocaleString()}</td><td>${t.videoCount}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AutoTube Performance Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 24px; }
  .header { text-align: center; margin-bottom: 32px; }
  .header h1 { font-size: 28px; color: #fff; margin-bottom: 8px; }
  .header .subtitle { color: #888; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: #1a1a1a; border-radius: 12px; padding: 20px; border: 1px solid #2a2a2a; }
  .card .label { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .card .value { font-size: 32px; font-weight: 700; color: #fff; }
  .card .detail { color: #666; font-size: 12px; margin-top: 4px; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 20px; color: #fff; margin-bottom: 16px; border-bottom: 1px solid #2a2a2a; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #2a2a2a; }
  th { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
  td { font-size: 14px; }
  .chart-placeholder { background: #1a1a1a; border-radius: 12px; padding: 20px; border: 1px solid #2a2a2a; min-height: 200px; display: flex; align-items: center; justify-content: center; color: #666; }
  .sentiment-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .sentiment-positive { background: #1a3a1a; color: #4ade80; }
  .sentiment-neutral { background: #2a2a1a; color: #facc15; }
  .sentiment-negative { background: #3a1a1a; color: #f87171; }
  .roi-positive { color: #4ade80; }
  .roi-negative { color: #f87171; }
</style>
</head>
<body>
<div class="header">
  <h1>AutoTube Performance Dashboard</h1>
  <div class="subtitle">Generated: ${new Date(data.generatedAt).toLocaleString()}</div>
</div>

<div class="grid">
  <div class="card">
    <div class="label">Total Videos</div>
    <div class="value">${overview.totalVideos}</div>
  </div>
  <div class="card">
    <div class="label">Total Views</div>
    <div class="value">${overview.totalViews.toLocaleString()}</div>
  </div>
  <div class="card">
    <div class="label">Watch Time</div>
    <div class="value">${overview.totalWatchTimeHours.toFixed(0)}h</div>
  </div>
  <div class="card">
    <div class="label">Average CTR</div>
    <div class="value">${overview.averageCTR.toFixed(1)}%</div>
  </div>
  <div class="card">
    <div class="label">Avg Retention</div>
    <div class="value">${overview.averageRetention.toFixed(0)}%</div>
  </div>
  <div class="card">
    <div class="label">Subscribers Gained</div>
    <div class="value">+${overview.totalSubscribersGained}</div>
  </div>
</div>

<div class="section">
  <h2>Revenue & ROI</h2>
  <div class="grid">
    <div class="card">
      <div class="label">Total Costs</div>
      <div class="value">$${roi.totalCosts.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">Total Revenue</div>
      <div class="value">$${roi.totalRevenue.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">Net Profit</div>
      <div class="value ${roi.netProfit >= 0 ? 'roi-positive' : 'roi-negative'}">$${roi.netProfit.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">ROI Ratio</div>
      <div class="value ${roi.averageROI >= 1 ? 'roi-positive' : 'roi-negative'}">${roi.averageROI.toFixed(2)}x</div>
    </div>
  </div>
</div>

<div class="section">
  <h2>Comment Sentiment</h2>
  <div class="grid">
    <div class="card">
      <div class="label">Average Sentiment</div>
      <div class="value">${sentimentOverview.averageSentiment.toFixed(2)}</div>
      <div class="detail"><span class="sentiment-badge sentiment-${sentimentOverview.label.includes('positive') ? 'positive' : sentimentOverview.label.includes('negative') ? 'negative' : 'neutral'}">${sentimentOverview.label}</span></div>
    </div>
    <div class="card">
      <div class="label">Flagged Comments</div>
      <div class="value">${sentimentOverview.flaggedCount}</div>
    </div>
  </div>
</div>

<div class="section">
  <h2>Views Over Time</h2>
  <div class="chart-placeholder">
    ${viewsChartData.length > 0
      ? `<pre style="text-align:left;width:100%;overflow-x:auto;font-size:12px;">Date,Views\n${viewsOverTime.map(v => `${v.date},${v.views}`).join('\n')}</pre>`
      : 'No data yet'}
  </div>
</div>

<div class="section">
  <h2>CTR Trends</h2>
  <div class="chart-placeholder">
    ${ctrChartData.length > 0
      ? `<pre style="text-align:left;width:100%;overflow-x:auto;font-size:12px;">Date,CTR%\n${ctrTrends.map(c => `${c.date},${c.ctr.toFixed(1)}`).join('\n')}</pre>`
      : 'No CTR data yet'}
  </div>
</div>

<div class="section">
  <h2>Best Performing Topics</h2>
  <table>
    <thead><tr><th>Topic</th><th>Avg Views</th><th>Videos</th></tr></thead>
    <tbody>${topicsTable || '<tr><td colspan="3" style="color:#666">No data yet</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <h2>Retention Curves</h2>
  ${data.retentionCurves.length > 0
    ? data.retentionCurves.map(rc => `
      <div class="card" style="margin-bottom:12px">
        <div class="label">${escapeHtml(rc.videoId)}</div>
        <pre style="font-size:11px;color:#aaa;overflow-x:auto">Percent,Retention%\n${rc.curve.map(p => `${p.percent},${p.retention}`).join('\n')}</pre>
      </div>
    `).join('')
    : '<div class="chart-placeholder">No retention data yet</div>'
  }
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTopic(title: string): string {
  const words = title.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 3).join(' ') || title;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
