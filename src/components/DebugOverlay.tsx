import { useState } from 'react';
import { Terminal, X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import type { SystemLog } from '../types';

const levelIcons: Record<string, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-blue-400" />,
  warn: <AlertCircle className="h-3.5 w-3.5 text-amber-400" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
};

const levelColors: Record<string, string> = {
  info: 'text-blue-200 border-blue-500/20 bg-blue-500/5',
  warn: 'text-amber-200 border-amber-500/20 bg-amber-500/5',
  error: 'text-red-200 border-red-500/20 bg-red-500/5',
  success: 'text-emerald-200 border-emerald-500/20 bg-emerald-500/5'
};

interface DebugOverlayProps {
  logs?: SystemLog[];
}

export default function DebugOverlay({ logs = [] }: DebugOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const errorCount = logs?.filter(l => l.level === 'error').length || 0;

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-surface-900 border border-surface-700 text-surface-400 shadow-xl transition-all hover:scale-110 hover:border-brand-500 hover:text-white z-[60]"
        title="Open System Logs"
      >
        <Terminal className="h-5 w-5" />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white animate-pulse">
            {errorCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[65] bg-black/30"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div 
        className={`fixed inset-y-0 right-0 w-96 bg-surface-950 border-l border-surface-800 shadow-2xl transition-transform duration-300 transform z-[70] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-surface-800 p-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-brand-400" />
              <h3 className="font-bold text-white text-sm uppercase tracking-tight">System Logs</h3>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-surface-500 hover:text-white transition-colors"
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
                    className={`rounded-lg border p-3 ${colorClass}`}
                  >
                    <div className="flex items-center justify-between mb-1.5 opacity-60">
                      <div className="flex items-center gap-1.5">
                        {icon}
                        <span className="font-bold uppercase tracking-wider">{log.source}</span>
                      </div>
                      <span>{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                    </div>
                    <p className="leading-relaxed break-words">{log.message}</p>
                    {log.details && (
                      <div className="mt-2 text-[10px] bg-black/40 rounded p-2 overflow-x-auto border border-white/5">
                        <pre className="whitespace-pre-wrap">{typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-surface-800 p-4 bg-surface-900/50">
            <div className="flex justify-between text-[10px] text-surface-500">
              <span className="font-medium text-surface-400">{logs.length} Operations Traceable</span>
              <span className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Pipeline
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
