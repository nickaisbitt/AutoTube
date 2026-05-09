import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, MemoryStick, Wifi, Clock, Copy, X } from 'lucide-react';

interface PerfMetrics {
  memoryUsedMB: number | null;
  memoryTotalMB: number | null;
  fps: number;
  networkRequests: number;
  networkTransferKB: number;
  tti: number | null;
  timestamp: number;
}

function getMemoryInfo(): { usedMB: number | null; totalMB: number | null } {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
  if (perf.memory) {
    return {
      usedMB: Math.round(perf.memory.usedJSHeapSize / (1024 * 1024) * 100) / 100,
      totalMB: Math.round(perf.memory.totalJSHeapSize / (1024 * 1024) * 100) / 100,
    };
  }
  return { usedMB: null, totalMB: null };
}

function getNetworkInfo(): { requests: number; transferKB: number } {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const requests = entries.length;
  let transferKB = 0;
  for (const entry of entries) {
    transferKB += (entry.transferSize || 0) / 1024;
  }
  return { requests, transferKB: Math.round(transferKB * 100) / 100 };
}

function getTTI(): number | null {
  const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (entries.length > 0) {
    const nav = entries[0];
    return Math.round(nav.domInteractive - nav.startTime);
  }
  return null;
}

function generatePerfReport(metrics: PerfMetrics): string {
  const lines = [
    '=== AutoTube Performance Report ===',
    `Generated: ${new Date().toISOString()}`,
    '',
    '--- Memory ---',
    `JS Heap Used: ${metrics.memoryUsedMB !== null ? `${metrics.memoryUsedMB} MB` : 'N/A'}`,
    `JS Heap Total: ${metrics.memoryTotalMB !== null ? `${metrics.memoryTotalMB} MB` : 'N/A'}`,
    '',
    '--- Rendering ---',
    `FPS: ${metrics.fps}`,
    '',
    '--- Network ---',
    `Requests: ${metrics.networkRequests}`,
    `Transfer: ${metrics.networkTransferKB.toFixed(2)} KB`,
    '',
    '--- Timing ---',
    `Time to Interactive: ${metrics.tti !== null ? `${metrics.tti}ms` : 'N/A'}`,
    '',
    '=== End Report ===',
  ];
  return lines.join('\n');
}

interface PerfDashboardProps {
  onClose?: () => void;
}

export default function PerfDashboard({ onClose }: PerfDashboardProps) {
  const [metrics, setMetrics] = useState<PerfMetrics>({
    memoryUsedMB: null,
    memoryTotalMB: null,
    fps: 0,
    networkRequests: 0,
    networkTransferKB: 0,
    tti: null,
    timestamp: Date.now(),
  });
  const [isLive, setIsLive] = useState(true);
  const [copied, setCopied] = useState(false);
  const fpsRef = useRef<number>(60);
  const fpsAnimRef = useRef<number>(0);

  const updateMetrics = useCallback(() => {
    const mem = getMemoryInfo();
    const net = getNetworkInfo();
    const tti = getTTI();

    setMetrics({
      memoryUsedMB: mem.usedMB,
      memoryTotalMB: mem.totalMB,
      fps: fpsRef.current,
      networkRequests: net.requests,
      networkTransferKB: net.transferKB,
      tti,
      timestamp: Date.now(),
    });
  }, []);

  useEffect(() => {
    const measureFPS = () => {
      let frames = 0;
      let lastTime = performance.now();

      const loop = (now: number) => {
        frames++;
        if (now - lastTime >= 1000) {
          fpsRef.current = Math.round((frames * 1000) / (now - lastTime));
          frames = 0;
          lastTime = now;
        }
        fpsAnimRef.current = requestAnimationFrame(loop);
      };

      fpsAnimRef.current = requestAnimationFrame(loop);
    };

    measureFPS();
    updateMetrics();

    const interval = setInterval(updateMetrics, 2000);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(fpsAnimRef.current);
    };
  }, [updateMetrics]);

  const handleCopyReport = () => {
    const report = generatePerfReport(metrics);
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getFPSColor = (fps: number): string => {
    if (fps >= 50) return 'text-emerald-400';
    if (fps >= 30) return 'text-amber-400';
    return 'text-red-400';
  };

  const getMemoryColor = (usedMB: number | null, totalMB: number | null): string => {
    if (usedMB === null || totalMB === null) return 'text-surface-400';
    const pct = usedMB / totalMB;
    if (pct < 0.6) return 'text-emerald-400';
    if (pct < 0.85) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto border-2 border-surface-700 bg-surface-900 p-6 shadow-hard">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-brand-500">
              <Activity className="h-5 w-5 text-black" />
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-wider text-white">Performance Dashboard</h3>
              <p className="text-xs font-mono text-surface-400">Real-time app metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 border-2 border-surface-700 px-3 py-1.5 text-xs font-mono text-surface-400 hover:bg-brand-500 hover:text-black"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy Report'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="border-2 border-surface-700 p-2 text-surface-400 hover:bg-brand-500 hover:text-black"
                aria-label="Close performance dashboard"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-surface-600'}`} />
          <span className="text-xs font-mono text-surface-400">
            {isLive ? 'Live monitoring' : 'Paused'}
          </span>
          <button
            onClick={() => setIsLive(!isLive)}
            className="ml-auto text-xs font-mono text-brand-400 hover:text-brand-300"
          >
            {isLive ? 'Pause' : 'Resume'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MemoryStick className="h-4 w-4 text-surface-400" />
              <span className="text-[10px] font-mono text-surface-500 uppercase">Memory Used</span>
            </div>
            <p className={`text-xl font-bold ${getMemoryColor(metrics.memoryUsedMB, metrics.memoryTotalMB)}`}>
              {metrics.memoryUsedMB !== null ? `${metrics.memoryUsedMB} MB` : 'N/A'}
            </p>
            {metrics.memoryTotalMB !== null && (
              <p className="text-[10px] font-mono text-surface-500">
                of {metrics.memoryTotalMB} MB total
              </p>
            )}
          </div>

          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-surface-400" />
              <span className="text-[10px] font-mono text-surface-500 uppercase">FPS</span>
            </div>
            <p className={`text-xl font-bold ${getFPSColor(metrics.fps)}`}>
              {metrics.fps}
            </p>
            <p className="text-[10px] font-mono text-surface-500">
              {metrics.fps >= 50 ? 'Smooth' : metrics.fps >= 30 ? 'Moderate' : 'Low'}
            </p>
          </div>

          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="h-4 w-4 text-surface-400" />
              <span className="text-[10px] font-mono text-surface-500 uppercase">Network</span>
            </div>
            <p className="text-xl font-bold text-white">
              {metrics.networkRequests}
            </p>
            <p className="text-[10px] font-mono text-surface-500">
              {metrics.networkTransferKB.toFixed(1)} KB transferred
            </p>
          </div>

          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-surface-400" />
              <span className="text-[10px] font-mono text-surface-500 uppercase">TTI</span>
            </div>
            <p className="text-xl font-bold text-white">
              {metrics.tti !== null ? `${metrics.tti}ms` : 'N/A'}
            </p>
            <p className="text-[10px] font-mono text-surface-500">
              Time to Interactive
            </p>
          </div>
        </div>

        {metrics.memoryUsedMB !== null && metrics.memoryTotalMB !== null && (
          <div className="mb-6">
            <h4 className="text-sm font-mono font-medium uppercase tracking-wider text-surface-300 mb-3">
              Memory Usage
            </h4>
            <div className="border-2 border-surface-700 bg-surface-800 p-4">
              <div className="w-full h-4 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (metrics.memoryUsedMB / metrics.memoryTotalMB) < 0.6
                      ? 'bg-emerald-500'
                      : (metrics.memoryUsedMB / metrics.memoryTotalMB) < 0.85
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${(metrics.memoryUsedMB / metrics.memoryTotalMB) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-mono text-surface-400">
                {((metrics.memoryUsedMB / metrics.memoryTotalMB) * 100).toFixed(1)}% heap used
              </p>
            </div>
          </div>
        )}

        <div className="mb-6">
          <h4 className="text-sm font-mono font-medium uppercase tracking-wider text-surface-300 mb-3">
            Resource Timing Breakdown
          </h4>
          <div className="border-2 border-surface-700 bg-surface-800 p-4">
            <div className="space-y-2">
              {(() => {
                const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
                const byType: Record<string, { count: number; totalKB: number }> = {};
                for (const entry of entries) {
                  const ext = entry.name.split('.').pop()?.split('?')[0] || 'other';
                  if (!byType[ext]) byType[ext] = { count: 0, totalKB: 0 };
                  byType[ext].count++;
                  byType[ext].totalKB += (entry.transferSize || 0) / 1024;
                }
                return Object.entries(byType)
                  .sort((a, b) => b[1].totalKB - a[1].totalKB)
                  .slice(0, 8)
                  .map(([ext, data]) => (
                    <div key={ext} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-surface-400">.{ext}</span>
                      <span className="text-white">{data.count} requests</span>
                      <span className="text-surface-500">{data.totalKB.toFixed(1)} KB</span>
                    </div>
                  ));
              })()}
            </div>
          </div>
        </div>

        <div className="text-[10px] font-mono text-surface-600 text-center">
          Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
