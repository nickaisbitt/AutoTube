import { useState, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, Info, Eye, Volume2, Sun, Loader2 } from 'lucide-react';

export interface QualityReport {
  score: number;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    category: 'audio' | 'visual';
    message: string;
  }>;
  metadata: {
    duration: number | null;
    size_mb: number | null;
    resolution: string | null;
    video_bitrate_kbps: number | null;
    audio_bitrate_kbps: number | null;
  };
  loudness: {
    integrated_loudness_lufs: number;
    true_peak_dbtp: number;
    loudness_range_lu: number;
    target_lufs: number;
    needs_normalization: boolean;
  } | null;
  silence: {
    gaps: Array<{ start: number; end: number; duration: number }>;
    gap_count: number;
    total_gap_duration: number;
  } | null;
  brightness: {
    average_brightness: number;
    min_brightness: number;
    dark_frame_count: number;
    total_sampled: number;
    too_dark: boolean;
  } | null;
  vision: {
    transcript: string;
    frame_count: number;
    frames: Array<{ index: number; description: string }>;
    video_description: string;
  } | null;
  vision_error: string | null;
}

interface QualityCheckProps {
  videoUrl: string | null;
  existingReport?: QualityReport | null;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500/10 border-green-500/30';
  if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function severityIcon(severity: string) {
  if (severity === 'critical') return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
  if (severity === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />;
  return <Info className="h-3.5 w-3.5 text-blue-400" />;
}

export default function QualityCheck({ videoUrl, existingReport }: QualityCheckProps) {
  const [report, setReport] = useState<QualityReport | null>(existingReport ?? null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [includeVision, setIncludeVision] = useState(false);

  const runCheck = useCallback(async (withVision: boolean = false) => {
    if (!videoUrl) return;
    setIsRunning(true);
    setIncludeVision(withVision);
    setProgress(0);
    setStatusMsg('Starting quality check...');
    setReport(null);

    try {
      const res = await fetch('/api/quality-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, includeVision: withVision }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setStatusMsg(`Error: ${err.error}`);
        setIsRunning(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'progress') {
                  setProgress(event.pct || 0);
                  setStatusMsg(event.message || '');
                } else if (event.type === 'complete' && event.report) {
                  setReport(event.report);
                  setStatusMsg(`Quality: ${event.report.score}/100`);
                  setProgress(100);
                } else if (event.type === 'error') {
                  setStatusMsg(`Error: ${event.message}`);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunning(false);
    }
  }, [videoUrl]);

  if (!videoUrl && !report) {
    return null;
  }

  return (
    <div className="border-2 border-surface-700 bg-surface-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-400" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-brand-400">
            Video Quality
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runCheck(false)}
            disabled={isRunning || !videoUrl}
            className="flex items-center gap-1.5 border-2 border-surface-700 bg-surface-800 px-3 py-1.5 text-xs font-mono font-medium text-surface-300 transition-colors hover:bg-brand-500 hover:text-black disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="run-quality-check"
          >
            {isRunning && !includeVision ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            {isRunning && !includeVision ? 'Analyzing...' : 'Quick Check'}
          </button>
          <button
            onClick={() => { setIncludeVision(true); runCheck(true); }}
            disabled={isRunning || !videoUrl}
            className="flex items-center gap-1.5 border-2 border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-mono font-medium text-brand-400 transition-colors hover:bg-brand-500 hover:text-black disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="run-quality-check-vision"
          >
            {isRunning && includeVision ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            {isRunning && includeVision ? 'Analyzing...' : 'Full Analysis'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="mb-3">
          <div className="h-1.5 w-full bg-surface-800">
            <div
              className="h-full bg-brand-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-mono text-surface-500">{statusMsg}</p>
        </div>
      )}

      {/* Score */}
      {report && (
        <div className="space-y-3">
          {/* Score ring */}
          <div className={`flex items-center gap-4 border-2 p-3 ${scoreBg(report.score)}`}>
            <div className={`text-4xl font-black font-mono ${scoreColor(report.score)}`}>
              {report.score}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Quality Score</div>
              <div className="text-[10px] text-surface-400">
                {report.score >= 80 ? 'Great quality — ready to publish' :
                 report.score >= 60 ? 'Acceptable — some issues to fix' :
                 'Needs improvement — see issues below'}
              </div>
            </div>
            {report.score >= 80 ? (
              <CheckCircle className="h-6 w-6 text-green-400" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-yellow-400" />
            )}
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* Loudness */}
            {report.loudness && (
              <div className="border border-surface-700 bg-surface-800 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Volume2 className="h-3 w-3 text-surface-500" />
                  <span className="text-[10px] font-mono text-surface-500 uppercase">Audio</span>
                </div>
                <div className={`text-lg font-bold font-mono ${report.loudness.needs_normalization ? 'text-yellow-400' : 'text-green-400'}`}>
                  {report.loudness.integrated_loudness_lufs.toFixed(1)}
                </div>
                <div className="text-[10px] text-surface-500">LUFS (target -14)</div>
              </div>
            )}

            {/* Silence */}
            {report.silence && (
              <div className="border border-surface-700 bg-surface-800 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] font-mono text-surface-500 uppercase">Silence</span>
                </div>
                <div className={`text-lg font-bold font-mono ${report.silence.gap_count > 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {report.silence.gap_count}
                </div>
                <div className="text-[10px] text-surface-500">gaps ({report.silence.total_gap_duration.toFixed(1)}s)</div>
              </div>
            )}

            {/* Brightness */}
            {report.brightness && (
              <div className="border border-surface-700 bg-surface-800 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Sun className="h-3 w-3 text-surface-500" />
                  <span className="text-[10px] font-mono text-surface-500 uppercase">Brightness</span>
                </div>
                <div className={`text-lg font-bold font-mono ${report.brightness.too_dark ? 'text-yellow-400' : 'text-green-400'}`}>
                  {(report.brightness.average_brightness * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-surface-500">{report.brightness.dark_frame_count} dark frames</div>
              </div>
            )}
          </div>

          {/* Issues */}
          {report.issues.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-surface-500">Issues</span>
              {report.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 border border-surface-700 bg-surface-800 px-2 py-1.5">
                  {severityIcon(issue.severity)}
                  <span className="text-xs text-surface-300">{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Vision analysis */}
          {report.vision && (
            <div className="border border-surface-700 bg-surface-800 p-3">
              <div className="flex items-center gap-1 mb-2">
                <Eye className="h-3 w-3 text-brand-400" />
                <span className="text-[10px] font-mono font-semibold uppercase text-brand-400">Vision Analysis</span>
                <span className="text-[10px] text-surface-500 ml-1">({report.vision.frame_count} frames)</span>
              </div>
              {report.vision.video_description && (
                <p className="text-xs text-surface-300 leading-relaxed line-clamp-6">
                  {report.vision.video_description}
                </p>
              )}
            </div>
          )}

          {/* Metadata */}
          {report.metadata && (
            <div className="flex gap-3 text-[10px] font-mono text-surface-500">
              {report.metadata.resolution && <span>Res: {report.metadata.resolution}</span>}
              {report.metadata.video_bitrate_kbps && <span>Video: {report.metadata.video_bitrate_kbps}kbps</span>}
              {report.metadata.audio_bitrate_kbps && <span>Audio: {report.metadata.audio_bitrate_kbps}kbps</span>}
              {report.metadata.duration && <span>Duration: {report.metadata.duration.toFixed(1)}s</span>}
              {report.metadata.size_mb && <span>Size: {report.metadata.size_mb}MB</span>}
            </div>
          )}
        </div>
      )}

      {/* Not run yet */}
      {!report && !isRunning && (
        <p className="text-xs text-surface-500">
          Run a quality check to see audio loudness, visual brightness, and AI frame analysis.
        </p>
      )}
    </div>
  );
}
