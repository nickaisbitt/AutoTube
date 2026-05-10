import { Check, Loader2, Circle } from 'lucide-react';

export interface ProgressStep {
  id: string;
  label: string;
  description?: string;
  estimatedSeconds?: number;
}

export interface StepProgressState {
  currentStepId: string | null;
  completedSteps: string[];
  failedSteps: string[];
  currentProgress: number;
  message: string;
  elapsedSeconds: number;
}

interface StepProgressIndicatorProps {
  steps: ProgressStep[];
  state: StepProgressState;
  title: string;
}

function getStepStatus(
  step: ProgressStep,
  state: StepProgressState,
): 'completed' | 'active' | 'upcoming' | 'failed' {
  if (state.failedSteps.includes(step.id)) return 'failed';
  if (state.completedSteps.includes(step.id)) return 'completed';
  if (state.currentStepId === step.id) return 'active';
  return 'upcoming';
}

function getEstimatedTimeRemaining(
  steps: ProgressStep[],
  state: StepProgressState,
): string {
  const currentIndex = steps.findIndex((s) => s.id === state.currentStepId);
  if (currentIndex === -1) return '';
  let remaining = 0;
  for (let i = currentIndex; i < steps.length; i++) {
    remaining += steps[i].estimatedSeconds ?? 5;
  }
  if (remaining < 60) return `~${remaining}s remaining`;
  return `~${Math.ceil(remaining / 60)}m remaining`;
}

export default function StepProgressIndicator({
  steps,
  state,
  title,
}: StepProgressIndicatorProps) {
  const timeRemaining = getEstimatedTimeRemaining(steps, state);
  const totalSteps = steps.length;
  const completedCount = state.completedSteps.length;
  const overallPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Title and overall progress */}
      <div className="text-center">
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center bg-brand-500 text-black shadow-[4px_4px_0px_#ff5500]">
          {state.currentStepId ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Check className="h-7 w-7" />
          )}
        </div>
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">{title}</h3>
        {state.message && (
          <p className="mt-1 text-sm font-mono text-surface-400 min-h-[1.25rem]">{state.message}</p>
        )}
        {timeRemaining && (
          <p className="mt-1 text-xs font-mono text-brand-400">{timeRemaining}</p>
        )}
      </div>

      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-surface-500 uppercase tracking-wider">Overall</span>
          <span className="text-brand-400 font-bold">{overallPct}%</span>
        </div>
        <div
          className="h-3 overflow-hidden bg-surface-800 border-2 border-surface-700"
          role="progressbar"
          aria-valuenow={overallPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-brand-500 relative"
            style={{ width: `${overallPct}%` }}
          >
            <div className="absolute inset-0 shimmer" />
          </div>
        </div>
      </div>

      {/* Step-by-step wizard */}
      <div className="space-y-2">
        {steps.map((step, index) => {
          const status = getStepStatus(step, state);
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex items-start gap-3">
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center border-2 text-xs ${
                    status === 'completed'
                      ? 'border-emerald-500 bg-emerald-500 text-black'
                      : status === 'active'
                      ? 'border-brand-500 bg-brand-500 text-black'
                      : status === 'failed'
                      ? 'border-red-500 bg-red-500 text-black'
                      : 'border-surface-600 text-surface-600'
                  }`}
                >
                  {status === 'completed' && <Check className="h-3.5 w-3.5" />}
                  {status === 'active' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {status === 'failed' && <span className="text-[10px] font-bold">!</span>}
                  {status === 'upcoming' && (
                    <Circle className="h-2.5 w-2.5 fill-current" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={`h-4 w-0.5 ${
                      status === 'completed' ? 'bg-emerald-500' : 'bg-surface-700'
                    }`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-3">
                <p
                  className={`text-sm font-semibold ${
                    status === 'completed'
                      ? 'text-emerald-400'
                      : status === 'active'
                      ? 'text-brand-400'
                      : status === 'failed'
                      ? 'text-red-400'
                      : 'text-surface-500'
                  }`}
                >
                  {step.label}
                </p>
                {step.description && status === 'active' && (
                  <p className="text-[11px] font-mono text-surface-400 mt-0.5">
                    {step.description}
                  </p>
                )}
                {status === 'active' && state.currentProgress > 0 && (
                  <div className="mt-1 h-1.5 bg-surface-800 overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${state.currentProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Elapsed time */}
      {state.elapsedSeconds > 0 && (
        <p className="text-center text-[11px] font-mono text-surface-500">
          Elapsed: {state.elapsedSeconds}s
        </p>
      )}
    </div>
  );
}
