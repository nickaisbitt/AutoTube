import React, { ReactNode } from 'react';
import PipelineSidebar from './PipelineSidebar';
import DebugOverlay from './DebugOverlay';
import { useVideoProject } from '../store/StoreContext';
import type { PipelineStep } from '../types';

interface AppShellProps {
  children: ReactNode;
  onOpenSettings: () => void;
}

export default function AppShell({ children, onOpenSettings }: AppShellProps) {
  const { currentStep, stepStatuses, setCurrentStep, logs } = useVideoProject();

  const handleStepClick = React.useCallback((step: PipelineStep) => {
    const status = stepStatuses[step];
    if (status === 'complete' || status === 'active') {
      setCurrentStep(step);
    }
  }, [setCurrentStep, stepStatuses]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      <PipelineSidebar
        currentStep={currentStep}
        stepStatuses={stepStatuses}
        onStepClick={handleStepClick}
        onOpenSettings={onOpenSettings}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <DebugOverlay logs={logs} />
    </div>
  );
}
