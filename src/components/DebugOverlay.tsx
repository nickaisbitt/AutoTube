import { useState } from 'react';
import { Terminal, X, AlertCircle, CheckCircle, Info, Copy, Check } from 'lucide-react';
import type { SystemLog } from '../types';

const levelIcons: Record<string, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-blue-400" />,
  warn: <AlertCircle className="h-3.5 w-3.5 text-amber-400" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
};

const levelColors: Record<string, string> = {
  info: 'text-blue-200 border-2 border-blue-500 bg-surface-900',
  warn: 'text-amber-200 border-2 border-amber-500 bg-surface-900',
  error: 'text-red-200 border-2 border-red-500 bg-surface-900',
  success: 'text-emerald-200 border-2 border-emerald-500 bg-surface-900'
};

interface DebugOverlayProps {
  logs?: SystemLog[];
}

function formatDetails(details: unknown): string {
  if (typeof details === 'string') return details;
  if (details instanceof Error) return details.message;
  try { return JSON.stringify(details, null, 2); } catch { return String(details); }
}

export default function DebugOverlay({ logs = [] }: DebugOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const errorCount = logs?.filter(l => l.level === 'error').length || 0;

  const handleCopyLogs = async () => {
    if (!logs || logs.length === 0) return;
    const text = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false });
      const details = log.details ? `\n  ${formatDetails(log.details)}` : '';
      return `[${time}] [${log.level.toUpperCase()}] ${log.source}: ${log.message}${details}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select all in a textarea
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center border-2 border-surface-700 bg-surface-900 text-surface-400 shadow-hard hover:bg-brand-500 hover:text-black hover:border-brand-500 z-[60]"
        title="Open System Logs"
      >
        <Terminal className="h-5 w-5" />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center bg-red-600 text-[10px] font-bold font-mono text-white animate-pulse">
            {errorCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[65] bg-black/70"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div 
        className={`fixed inset-y-0 right-0 w-96 bg-surface-950 border-l-2 border-surface-700 shadow-hard transform z-[70] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b-2 border-surface-700 p-4">
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-2 hover:opacity-80"
              title="Click to copy all logs"
            >
              <Terminal className="h-4 w-4 text-brand-400" />
              <h3 className="font-bold text-white text-sm uppercase tracking-wider font-mono">System Logs</h3>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-surface-500" />
              )}
            </button>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-surface-500 hover:bg-brand-500 hover:text-black p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[11px]">
            {!logs || logs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-surface-600">
                <Terminal className="h-8 w-8 mb-2 opacity-20" />
                <p>No activity logged yet.</p>
                <p className="mt-1 text-[9px] opacity-50 uppercase tracking-widest">Listening for events...</p>
              </div>
            ) : (
              [...logs].reverse().map((log) => {
                const colorClass = levelColors[log.level] || levelColors.info;
                const icon = levelIcons[log.level] || levelIcons.info;
                
                return (
                  <div 
                    key={log.id} 
                    className={`border p-3 ${colorClass}`}
                  >
                    <div className="flex items-center justify-between mb-1.5 opacity-60">
                      <div className="flex items-center gap-1.5">
                        {icon}
                        <span className="font-bold uppercase tracking-wider">{log.source}</span>
                      </div>
                      <span>{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                    </div>
                    <p className="leading-relaxed break-words">{log.message}</p>
                    {Boolean(log.details) && (
                      <div className="mt-2 text-[10px] bg-black p-2 overflow-x-auto border-2 border-surface-700">
                        <pre className="whitespace-pre-wrap">{formatDetails(log.details)}</pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t-2 border-surface-700 p-4 bg-surface-900">
            <div className="flex justify-between text-[10px] text-surface-500">
              <span className="font-medium font-mono text-surface-400">{logs.length} Operations Traceable</span>
              <span className="flex items-center gap-1.5 font-mono">
                <div className="h-1.5 w-1.5 bg-emerald-500 animate-pulse" /> Live Pipeline
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
