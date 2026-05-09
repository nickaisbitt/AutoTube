import { useState, useMemo } from 'react';
import { BarChart3, Clock, Film, Download, Video } from 'lucide-react';
import { getAnalytics, type VideoAnalytics } from '../services/analytics';
import EmptyState from './EmptyState';

interface AnalyticsDashboardProps {
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms === 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSec}s`;
  return `${remainingSec}s`;
}

function formatDurationShort(seconds: number): string {
  if (seconds === 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

interface DayBucket {
  date: string;
  count: number;
}

interface SummaryData {
  totalVideos: number;
  avgRenderTimeSec: number;
  totalDurationSec: number;
  totalFileSize: number;
  avgSegments: number;
  avgMediaCount: number;
  rendersByQuality: Record<string, number>;
  rendersByFormat: Record<string, number>;
  renderTrend: DayBucket[];
}

function computeSummary(renders: VideoAnalytics[]): SummaryData {
  const totalVideos = renders.length;
  const avgRenderTimeSec = totalVideos > 0
    ? renders.reduce((s, r) => s + r.renderTime, 0) / totalVideos
    : 0;
  const totalDurationSec = renders.reduce((s, r) => s + r.duration, 0);
  const totalFileSize = renders.reduce((s, r) => s + r.fileSize, 0);
  const avgSegments = totalVideos > 0
    ? renders.reduce((s, r) => s + r.segments, 0) / totalVideos
    : 0;
  const avgMediaCount = totalVideos > 0
    ? renders.reduce((s, r) => s + r.mediaCount, 0) / totalVideos
    : 0;

  const rendersByQuality: Record<string, number> = {};
  const rendersByFormat: Record<string, number> = {};
  for (const r of renders) {
    rendersByQuality[r.quality] = (rendersByQuality[r.quality] || 0) + 1;
    rendersByFormat[r.exportFormat] = (rendersByFormat[r.exportFormat] || 0) + 1;
  }

  const dayMap = new Map<string, number>();
  for (const r of renders) {
    const day = r.createdAt.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }
  const renderTrend = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, count]) => ({ date, count }));

  return {
    totalVideos,
    avgRenderTimeSec,
    totalDurationSec,
    totalFileSize,
    avgSegments,
    avgMediaCount,
    rendersByQuality,
    rendersByFormat,
    renderTrend,
  };
}

function exportCSV(renders: VideoAnalytics[]): void {
  if (renders.length === 0) return;
  const headers = Object.keys(renders[0]) as (keyof VideoAnalytics)[];
  const rows = renders.map(r => headers.map(h => {
    const val = r[h];
    return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : String(val);
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autotube-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAllAnalytics(): void {
  localStorage.removeItem('autotube_analytics');
}

export default function AnalyticsDashboard({ onClose }: AnalyticsDashboardProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const renders = useMemo(() => getAnalytics(), [refreshKey]);
  const summary = useMemo(() => computeSummary(renders), [renders]);

  const last7Days = summary.renderTrend;
  const maxBarCount = Math.max(...last7Days.map(d => d.count), 1);

  const handleExport = () => exportCSV(renders);
  const handleClear = () => {
    clearAllAnalytics();
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto border-2 border-surface-700 bg-surface-900 p-6 shadow-hard">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-brand-500">
              <BarChart3 className="h-5 w-5 text-black" />
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-wider text-white">Video Analytics</h3>
              <p className="text-xs font-mono text-surface-400">Performance & generation metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 border-2 border-surface-700 px-3 py-1.5 text-xs font-mono text-surface-400 hover:bg-brand-500 hover:text-black"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="border-2 border-surface-700 p-2 text-surface-400 hover:bg-brand-500 hover:text-black"
              aria-label="Close analytics"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Film className="h-4 w-4 text-surface-400" />
              <span className="text-xs font-mono text-surface-500 uppercase">Total Videos</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.totalVideos}</p>
          </div>
          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-surface-400" />
              <span className="text-xs font-mono text-surface-500 uppercase">Avg Render Time</span>
            </div>
            <p className="text-2xl font-bold text-white">{formatDuration(summary.avgRenderTimeSec * 1000)}</p>
          </div>
          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Video className="h-4 w-4 text-brand-400" />
              <span className="text-xs font-mono text-surface-500 uppercase">Total Duration</span>
            </div>
            <p className="text-2xl font-bold text-white">{formatDurationShort(summary.totalDurationSec)}</p>
          </div>
          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Film className="h-4 w-4 text-surface-400" />
              <span className="text-xs font-mono text-surface-500 uppercase">Total Size</span>
            </div>
            <p className="text-2xl font-bold text-white">{formatFileSize(summary.totalFileSize)}</p>
          </div>
        </div>

        {/* Bar Chart: Videos per Day (Last 7 Days) */}
        {last7Days.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-mono font-medium uppercase tracking-wider text-surface-300 mb-3">
              Videos per Day (Last 7 Days)
            </h4>
            <div className="border-2 border-surface-700 bg-surface-800 p-4">
              <div className="flex items-end gap-2 h-32">
                {last7Days.map((day: DayBucket) => {
                  const heightPct = (day.count / maxBarCount) * 100;
                  const dayLabel = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-mono text-surface-400">{day.count || ''}</span>
                      <div
                        className={`w-full rounded-t transition-all ${
                          day.count > 0 ? 'bg-brand-500' : 'bg-surface-700'
                        }`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className="text-[10px] font-mono text-surface-500">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Breakdown by Quality & Format */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h4 className="text-sm font-mono font-medium uppercase tracking-wider text-surface-300 mb-3">
              By Quality
            </h4>
            <div className="space-y-1">
              {Object.entries(summary.rendersByQuality).map(([res, count]) => (
                <div key={res} className="flex justify-between text-xs font-mono">
                  <span className="text-surface-400">{res}</span>
                  <span className="text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-mono font-medium uppercase tracking-wider text-surface-300 mb-3">
              By Format
            </h4>
            <div className="space-y-1">
              {Object.entries(summary.rendersByFormat).map(([fmt, count]) => (
                <div key={fmt} className="flex justify-between text-xs font-mono">
                  <span className="text-surface-400">{fmt.toUpperCase()}</span>
                  <span className="text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Video History */}
        {renders.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-mono font-medium uppercase tracking-wider text-surface-300">
                Video History
              </h4>
              <button
                onClick={handleClear}
                className="text-xs font-mono text-red-400 hover:text-red-300"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-2">
              {renders.slice(0, 20).map((render: VideoAnalytics) => (
                <div key={render.videoId} className="flex items-center gap-3 border border-surface-700 bg-surface-800 px-4 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white truncate">{render.title}</span>
                    </div>
                    <div className="text-[10px] font-mono text-surface-500">
                      {new Date(render.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-surface-300">{formatDuration(render.renderTime * 1000)}</div>
                    <div className="text-[10px] font-mono text-surface-500">{render.quality} • {render.exportFormat.toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {renders.length === 0 && (
          <EmptyState variant="no-analytics" />
        )}
      </div>
    </div>
  );
}
