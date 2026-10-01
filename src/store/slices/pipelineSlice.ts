import { useState, useCallback, useEffect, useRef } from 'react';
import type { PipelineStep, StepStatus } from '../../types';
import { logger } from '../../services/logger';

export const PIPELINE_STEPS: PipelineStep[] = [
  'topic', 'script', 'media', 'narration', 'ai_edit', 'assembly', 'preview',
];

export interface PipelineSliceState {
  currentStep: PipelineStep;
  stepStatuses: Record<PipelineStep, StepStatus>;
  processingProgress: number;
  processingMessage: string;
}

export interface PipelineSliceActions {
  setCurrentStep: (step: PipelineStep) => void;
  setStepStatuses: (statuses: Record<PipelineStep, StepStatus> | ((prev: Record<PipelineStep, StepStatus>) => Record<PipelineStep, StepStatus>)) => void;
  updateStepStatus: (step: PipelineStep, status: StepStatus) => void;
  setProcessingProgress: (progress: number) => void;
  setProcessingMessage: (message: string) => void;
}

export interface PipelineSliceRefs {
  renderAbortRef: React.MutableRefObject<AbortController | null>;
  scriptAbortRef: React.MutableRefObject<AbortController | null>;
  mediaAbortRef: React.MutableRefObject<AbortController | null>;
  narrationAbortRef: React.MutableRefObject<AbortController | null>;
  aiEditAbortRef: React.MutableRefObject<AbortController | null>;
}

export function usePipelineSlice(): PipelineSliceState & PipelineSliceActions & PipelineSliceRefs {
  const [currentStep, setCurrentStep] = useState<PipelineStep>('topic');
  const [stepStatuses, setStepStatuses] = useState<Record<PipelineStep, StepStatus>>({
    topic: 'active',
    script: 'idle',
    media: 'idle',
    narration: 'idle',
    ai_edit: 'idle',
    assembly: 'idle',
    preview: 'idle',
  });
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');

  const renderAbortRef = useRef<AbortController | null>(null);
  const scriptAbortRef = useRef<AbortController | null>(null);
  const mediaAbortRef = useRef<AbortController | null>(null);
  const narrationAbortRef = useRef<AbortController | null>(null);
  const aiEditAbortRef = useRef<AbortController | null>(null);

  const updateStepStatus = useCallback((step: PipelineStep, status: StepStatus) => {
    setStepStatuses((prev) => ({ ...prev, [step]: status }));
  }, []);

  // ── Stuck-state watchdog ──
  // If the assembly step is "processing" but progress hasn't changed for 300s,
  // auto-cancel and reset to prevent the UI from being permanently stuck.
  const lastProgressRef = useRef({ value: 0, timestamp: Date.now() });
  useEffect(() => {
    if (stepStatuses.assembly !== 'processing') {
      lastProgressRef.current = { value: 0, timestamp: Date.now() };
      return;
    }
    if (processingProgress !== lastProgressRef.current.value) {
      lastProgressRef.current = { value: processingProgress, timestamp: Date.now() };
    }
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastProgressRef.current.timestamp;
      if (elapsed > 300_000 && stepStatuses.assembly === 'processing') {
        logger.warn('Store', `Render watchdog: no progress for ${Math.round(elapsed / 1000)}s — auto-cancelling`);
        renderAbortRef.current?.abort();
        setStepStatuses(prev => ({ ...prev, assembly: 'error' }));
        setProcessingMessage('Render timed out — no progress detected. Try again or use draft quality.');
        setProcessingProgress(0);
      }
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [stepStatuses.assembly, processingProgress]);

  return {
    currentStep,
    setCurrentStep,
    stepStatuses,
    setStepStatuses,
    updateStepStatus,
    processingProgress,
    processingMessage,
    setProcessingProgress,
    setProcessingMessage,
    renderAbortRef,
    scriptAbortRef,
    mediaAbortRef,
    narrationAbortRef,
    aiEditAbortRef,
  };
}
