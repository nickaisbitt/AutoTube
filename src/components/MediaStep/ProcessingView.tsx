import { Search, Brain, Target } from 'lucide-react';
import type { NarrativeBeat } from '../../types';
import { parseMediaMessage, MEDIA_STATUS_MESSAGES } from './constants';

const BEAT_COLORS: Record<NarrativeBeat, string> = {
  hook: 'bg-surface-800 text-fuchsia-300 border-fuchsia-500',
  context: 'bg-surface-800 text-sky-300 border-sky-500',
  data: 'bg-surface-800 text-emerald-300 border-emerald-500',
  quote: 'bg-surface-800 text-amber-300 border-amber-500',
  event: 'bg-surface-800 text-rose-300 border-rose-500',
  analysis: 'bg-surface-800 text-violet-300 border-violet-500',
  conclusion: 'bg-surface-800 text-blue-300 border-blue-500',
  transition: 'bg-surface-800 text-slate-300 border-slate-500',
};

interface ProcessingViewProps {
  progress: number;
  message: string;
  statusMessageIndex: number;
  onCancel?: () => void;
  'data-testid'?: string;
}

export default function ProcessingView({ progress, message, statusMessageIndex, onCancel, 'data-testid': testId }: ProcessingViewProps) {
  return (
    <div className="flex h-full items-center justify-center px-6" data-testid={testId}>
      <div className="w-full max-w-xl space-y-6 text-center">
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 bg-brand-500/20 animate-ping" />
          <div className="relative flex h-20 w-20 items-center justify-center bg-brand-500 text-black shadow-hard">
            <Brain className="h-8 w-8" />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">AI Visual Director at Work</h3>
          {(() => {
            const parsed = parseMediaMessage(message);
            if (parsed) {
              const beatKey = parsed.beatLabel.toLowerCase() as NarrativeBeat;
              const colorClass = BEAT_COLORS[beatKey] || 'bg-surface-700/30 text-surface-300 border-surface-600/30';
              return (
                <div data-testid="dynamic-message" className="mt-3 flex flex-col items-center gap-2 min-h-[2.5rem]">
                  <span className={`inline-flex border-2 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider ${colorClass}`}>
                    {parsed.beatLabel}
                  </span>
                  <p className="text-sm font-medium text-white">{parsed.segment}</p>
                  <p className="text-xs text-surface-400 italic">{parsed.action}</p>
                </div>
              );
            }
            return (
              <p data-testid="dynamic-message" className="mt-2 text-sm text-surface-400 min-h-[2.5rem]">
                {message || 'Planning visual concepts and harvesting matching imagery...'}
              </p>
            );
          })()}
        </div>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden bg-surface-800">
            <div className="h-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
          </div>
          <p className="text-xs font-mono text-surface-500">{progress}% complete</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-surface-600 px-4 py-2 text-xs font-mono uppercase text-surface-300 hover:border-red-500 hover:text-red-400"
            data-testid="cancel-media-button"
          >
            Cancel
          </button>
        )}

        <p
          data-testid="rotating-status"
          className="text-sm font-mono italic text-brand-400"
        >
          {MEDIA_STATUS_MESSAGES[statusMessageIndex]}
        </p>

        <div className="grid gap-3 pt-2 text-left text-xs">
          <div className="flex items-start gap-3 border-2 border-surface-700 bg-surface-900 p-3">
            <Search className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div>
              <p className="font-bold font-mono text-white">1. Research</p>
              <p className="text-surface-400">Resolve topic on Wikipedia → identify entity kind & related entities.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 border-2 border-surface-700 bg-surface-900 p-3">
            <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
            <div>
              <p className="font-bold font-mono text-white">2. Plan</p>
              <p className="text-surface-400">For each segment, detect the narrative beat and generate concrete visual concepts.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 border-2 border-surface-700 bg-surface-900 p-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="font-bold font-mono text-white">3. Harvest &amp; score</p>
              <p className="text-surface-400">Pull from Wikipedia, Wikidata, Openverse &amp; Commons; rank against the plan.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
