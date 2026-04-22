import { useCallback } from 'react';
import PipelineSidebar from './components/PipelineSidebar';
import TopicStep from './components/TopicStep';
import ScriptStep from './components/ScriptStep';
import MediaStep from './components/MediaStep';
import NarrationStep from './components/NarrationStep';
import AssemblyStep from './components/AssemblyStep';
import PreviewStep from './components/PreviewStep';
import DebugOverlay from './components/DebugOverlay';
import SettingsModal from './components/SettingsModal';
import { useVideoProject } from './store';
import type { PipelineStep, TopicConfig } from './types';
import { useState } from 'react';

export default function App() {
  const {
    currentStep,
    setCurrentStep,
    stepStatuses,
    project,
    topicConfig,
    setTopicConfig,
    processingProgress,
    processingMessage,
    generateScript,
    sourceMedia,
    replaceMediaAsset,
    generateNarration,
    assembleVideo,
    cancelRender,
    resetProject,
    logs,
    updateNarrationText,
  } = useVideoProject();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleStepClick = useCallback((step: PipelineStep) => {
    const status = stepStatuses[step];
    if (status === 'complete' || status === 'active') {
      setCurrentStep(step);
    }
  }, [setCurrentStep, stepStatuses]);

  const handleGenerate = useCallback(async (config: TopicConfig) => {
    await generateScript(config);
  }, [generateScript]);

  const handleSourceMedia = useCallback(async () => {
    setCurrentStep('media');
    await sourceMedia();
  }, [setCurrentStep, sourceMedia]);

  const handleReplaceMedia = useCallback(async (assetId: string) => {
    await replaceMediaAsset(assetId);
  }, [replaceMediaAsset]);

  const handleGenerateNarration = useCallback(async () => {
    setCurrentStep('narration');
    await generateNarration();
  }, [generateNarration, setCurrentStep]);

  const handleAssembleVideo = useCallback(async () => {
    setCurrentStep('assembly');
    await assembleVideo();
  }, [assembleVideo, setCurrentStep]);

  const renderStep = () => {
    switch (currentStep) {
      case 'topic':
        return (
          <TopicStep
            config={topicConfig}
            onConfigChange={setTopicConfig}
            onGenerate={handleGenerate}
          />
        );
      case 'script':
        return (
          <ScriptStep
            project={project}
            status={stepStatuses.script}
            progress={processingProgress}
            message={processingMessage}
            onNext={handleSourceMedia}
            onUpdateNarration={updateNarrationText}
          />
        );
      case 'media':
        return (
          <MediaStep
            project={project}
            status={stepStatuses.media}
            progress={processingProgress}
            message={processingMessage}
            onNext={handleGenerateNarration}
            onReplace={handleReplaceMedia}
            onRetry={handleSourceMedia}
          />
        );
      case 'narration':
        return (
          <NarrationStep
            project={project}
            status={stepStatuses.narration}
            progress={processingProgress}
            message={processingMessage}
            onNext={handleAssembleVideo}
          />
        );
      case 'assembly':
        return (
          <AssemblyStep
            project={project}
            status={stepStatuses.assembly}
            progress={processingProgress}
            message={processingMessage}
            onNext={() => setCurrentStep('preview')}
            onCancel={cancelRender}
          />
        );
      case 'preview':
        return (
          <PreviewStep
            project={project}
            onReset={resetProject}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      <PipelineSidebar
        currentStep={currentStep}
        stepStatuses={stepStatuses}
        onStepClick={handleStepClick}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <main className="flex-1 overflow-y-auto">
        {renderStep()}
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <DebugOverlay logs={logs} />
    </div>
  );
}
