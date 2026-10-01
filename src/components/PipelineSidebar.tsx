import { 
  Lightbulb, FileText, Image, Mic2, Sparkles, Film, Play,
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
  { key: 'ai_edit', label: 'AI Edit', icon: Sparkles, description: 'AI-powered editing pass' },
  { key: 'assembly', label: 'Video Assembly', icon: Film, description: 'Compile final video' },
  { key: 'preview', label: 'Preview & Export', icon: Play, description: 'Review and download' },
];

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'complete':
      return (
        <div className="flex h-6 w-6 items-center justify-center bg-emerald-500 text-black">
          <Check className="h-3.5 w-3.5" />
        </div>
      );
    case 'processing':
      return (
        <div className="flex h-6 w-6 items-center justify-center bg-brand-500 text-black">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      );
    case 'active':
      return (
        <div className="flex h-6 w-6 items-center justify-center border-2 border-brand-500 text-brand-500">
          <Circle className="h-3 w-3 fill-current" />
        </div>
      );
    case 'error':
      return (
        <div className="flex h-6 w-6 items-center justify-center bg-red-500 text-black">
          <Circle className="h-3 w-3 fill-current" />
        </div>
      );
    default:
      return (
        <div className="flex h-6 w-6 items-center justify-center border border-surface-600 text-surface-500">
          <Circle className="h-3 w-3" />
        </div>
      );
  }
}

export default function PipelineSidebar({ currentStep, stepStatuses, onStepClick, onOpenSettings }: PipelineSidebarProps) {
  return (
    <div className="flex h-full w-72 flex-col border-r-2 border-surface-700 bg-surface-950" data-testid="pipeline-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b-2 border-surface-700 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center bg-brand-500 shadow-hard-sm">
          <Film className="h-5 w-5 text-black" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white uppercase">AutoTube</h1>
          <p className="text-[11px] font-mono text-surface-400">AI Video Generator</p>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-3 px-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-surface-500">
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
                className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                  isActive
                    ? 'bg-brand-500 text-black border-l-4 border-brand-400'
                    : isClickable
                    ? 'text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
                    : 'cursor-not-allowed text-surface-600'
                }`}
                data-testid={`sidebar-step-${step.key}`}
              >
                <StatusIcon status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <step.icon className={`h-3.5 w-3.5 flex-shrink-0 ${
                      isActive ? 'text-black' : status === 'complete' ? 'text-emerald-400' : ''
                    }`} />
                    <span className="text-sm font-semibold truncate">{step.label}</span>
                  </div>
                  <p className={`mt-0.5 text-[11px] font-mono truncate ${
                    isActive ? 'text-black/70' : 'text-surface-500'
                  }`}>
                    {step.description}
                  </p>
                </div>
                {isActive && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-black" />
                )}
              </button>
            );
          })}
        </nav>
        
        {/* Settings Button */}
        <div className="mt-8 px-2">
          <button
            onClick={onOpenSettings}
            className="group flex w-full items-center gap-3 px-3 py-2.5 text-left text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            data-testid="sidebar-settings-button"
          >
            <div className="flex h-6 w-6 items-center justify-center border border-surface-600 text-surface-500 group-hover:border-black group-hover:text-black">
              <Settings className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">Settings</span>
            </div>
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="border-t-2 border-surface-700 px-5 py-4">
        {(() => {
          const completed = Object.values(stepStatuses).filter(s => s === 'complete').length;
          const pct = (completed / STEPS.length) * 100;
          return (
            <>
              <div className="flex items-center justify-between text-xs font-mono text-surface-400 mb-2">
                <span>PROGRESS</span>
                <span>{Math.round(pct)}%</span>
              </div>
              <div className="h-2 overflow-hidden bg-surface-800">
                <div
                  className="h-full bg-brand-500"
                  style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
                />
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
