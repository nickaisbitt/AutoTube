import { 
  Lightbulb, FileText, Image, Mic2, Film, Play,
  Check, Loader2, Circle, ChevronRight, Settings
} from 'lucide-react';
import type { PipelineStep, StepStatus } from '../types';

interface PipelineSidebarProps {
  currentStep: PipelineStep;
  stepStatuses: Record<PipelineStep, StepStatus>;
  onStepClick: (step: PipelineStep) => void;
  onOpenSettings: () => void;
}

const STEPS: { key: PipelineStep; label: string; icon: React.ElementType; description: string }[] = [
  { key: 'topic', label: 'Topic & Config', icon: Lightbulb, description: 'Choose your video topic' },
  { key: 'script', label: 'Script Generation', icon: FileText, description: 'AI-powered scriptwriting' },
  { key: 'media', label: 'Media Sourcing', icon: Image, description: 'Stock images & clips' },
  { key: 'narration', label: 'TTS Narration', icon: Mic2, description: 'Text-to-speech audio' },
  { key: 'assembly', label: 'Video Assembly', icon: Film, description: 'Compile final video' },
  { key: 'preview', label: 'Preview & Export', icon: Play, description: 'Review and download' },
];

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'complete':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <Check className="h-3.5 w-3.5" />
        </div>
      );
    case 'processing':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      );
    case 'active':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
          <Circle className="h-3 w-3 fill-current" />
        </div>
      );
    case 'error':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <Circle className="h-3 w-3 fill-current" />
        </div>
      );
    default:
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-700/50 text-surface-500">
          <Circle className="h-3 w-3" />
        </div>
      );
  }
}

export default function PipelineSidebar({ currentStep, stepStatuses, onStepClick, onOpenSettings }: PipelineSidebarProps) {
  return (
    <div className="flex h-full w-72 flex-col border-r border-surface-800 bg-surface-950/80 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-surface-800 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20">
          <Film className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white">AutoTube</h1>
          <p className="text-[11px] text-surface-400">AI Video Generator</p>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
          Pipeline
        </p>
        <nav className="space-y-1">
          {STEPS.map((step) => {
            const status = stepStatuses[step.key];
            const isActive = currentStep === step.key;
            const isClickable = status !== 'idle';

            return (
              <button
                key={step.key}
                onClick={() => isClickable && onStepClick(step.key)}
                disabled={!isClickable}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${
                  isActive
                    ? 'bg-brand-500/10 text-white ring-1 ring-brand-500/30'
                    : isClickable
                    ? 'text-surface-300 hover:bg-surface-800/60 hover:text-white'
                    : 'cursor-not-allowed text-surface-600'
                }`}
              >
                <StatusIcon status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <step.icon className={`h-3.5 w-3.5 flex-shrink-0 ${
                      isActive ? 'text-brand-400' : status === 'complete' ? 'text-emerald-400' : ''
                    }`} />
                    <span className="text-sm font-medium truncate">{step.label}</span>
                  </div>
                  <p className={`mt-0.5 text-[11px] truncate ${
                    isActive ? 'text-brand-300/70' : 'text-surface-500'
                  }`}>
                    {step.description}
                  </p>
                </div>
                {isActive && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-brand-400" />
                )}
              </button>
            );
          })}
        </nav>
        
        {/* Settings Button */}
        <div className="mt-8 px-2">
          <button
            onClick={onOpenSettings}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-surface-400 transition-all duration-200 hover:bg-surface-800/60 hover:text-white"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-700/50 text-surface-500 group-hover:bg-brand-500/20 group-hover:text-brand-400">
              <Settings className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">Settings</span>
            </div>
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="border-t border-surface-800 px-5 py-4">
        {(() => {
          const completed = Object.values(stepStatuses).filter(s => s === 'complete').length;
          const pct = (completed / STEPS.length) * 100;
          return (
            <>
              <div className="flex items-center justify-between text-xs text-surface-400 mb-2">
                <span>Overall Progress</span>
                <span>{Math.round(pct)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
