import React, { useCallback } from 'react';
import { useVideoProject } from '../store';
import { TopicConfig } from '../types';

import TopicStep from './TopicStep';
import ScriptStep from './ScriptStep';
import MediaStep from './MediaStep';
import NarrationStep from './NarrationStep';
import AIEditStep from './AIEditStep';
import AssemblyStep from './AssemblyStep';
import PreviewStep from './PreviewStep';
import BatchProcessor from './BatchProcessor';

interface PipelineStepRouterProps {
  onOpenExport: () => void;
}

class StepErrorBoundary extends React.Component<{children: React.ReactNode; stepName: string}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <div className="p-8 text-center"><h2 className="text-xl font-bold text-red-400">{this.props.stepName} crashed</h2><p className="text-surface-400">Something went wrong in this step. Try restarting it.</p></div>;
    }
    return this.props.children;
  }
}

export default function PipelineStepRouter({ onOpenExport }: PipelineStepRouterProps) {
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
    runAIEdit,
    skipAIEdit,
    assembleVideo,
    generateFullVideo,
    cancelRender,
    retryAssemble,
    resetProject,
    updateNarrationText,
    batchGenerate,
    isBatchProcessing,
    batchJobs,
    appConfig,
  } = useVideoProject();

  const handleGenerate = useCallback(async (config: TopicConfig) => {
    await generateScript(config);
  }, [generateScript]);

  const handleGenerateFull = useCallback(async (config: TopicConfig) => {
    await generateFullVideo(config);
  }, [generateFullVideo]);

  const handleSourceMedia = useCallback(async () => {
    if (!project) return;
    setCurrentStep('media');
    await sourceMedia(project);
  }, [project, setCurrentStep, sourceMedia]);

  const handleReplaceMedia = useCallback(async (assetId: string) => {
    await replaceMediaAsset(assetId);
  }, [replaceMediaAsset]);

  const handleGenerateNarration = useCallback(async () => {
    if (!project) return;
    setCurrentStep('narration');
    const result = await generateNarration(project);
    if (result) {
      setCurrentStep('ai_edit');
    }
  }, [project, generateNarration, setCurrentStep]);

  const handleRunAIEdit = useCallback(async () => {
    if (!project) return;
    setCurrentStep('ai_edit');
    await runAIEdit(project);
  }, [project, runAIEdit, setCurrentStep]);

  const handleSkipAIEdit = useCallback(() => {
    skipAIEdit();
  }, [skipAIEdit]);

  const handleAssembleVideo = useCallback(async (options?: { backgroundMusic?: boolean; musicPreset?: string; quality?: 'draft' | 'standard' | 'high' }) => {
    if (!project) return;
    const bgMusic = options?.backgroundMusic !== false;
    const selectedQuality = options?.quality ?? 'standard';
    const clonedProject = structuredClone(project);
    clonedProject.exportSettings = {
      ...clonedProject.exportSettings,
      quality: selectedQuality,
      format: clonedProject.exportSettings?.format ?? 'mp4',
      width: clonedProject.exportSettings?.width ?? 1920,
      height: clonedProject.exportSettings?.height ?? 1080,
      resolution: clonedProject.exportSettings?.resolution ?? '1080p',
      mimeType: clonedProject.exportSettings?.mimeType ?? 'video/mp4',
      fileName: clonedProject.exportSettings?.fileName ?? 'video.mp4',
      backgroundMusic: bgMusic,
      musicPreset: options?.musicPreset,
    };
    setCurrentStep('assembly');
    await assembleVideo({ quality: selectedQuality }, clonedProject);
  }, [project, assembleVideo, setCurrentStep]);

  const handleRetryAssemble = useCallback(async () => {
    await retryAssemble();
  }, [retryAssemble]);

  switch (currentStep) {
    case 'topic':
      return (
        <StepErrorBoundary stepName="Topic">
          <>
            <TopicStep
              config={topicConfig}
              onConfigChange={setTopicConfig}
              onGenerate={handleGenerate}
              onGenerateFull={handleGenerateFull}
              apiKey={appConfig.openRouterKey}
            />
            <BatchProcessor
              onGenerate={batchGenerate}
              isProcessing={isBatchProcessing}
              batchJobs={batchJobs}
            />
          </>
        </StepErrorBoundary>
      );
    case 'script':
      return (
        <StepErrorBoundary stepName="Script">
          <ScriptStep
            project={project}
            status={stepStatuses.script}
            progress={processingProgress}
            message={processingMessage}
            onNext={handleSourceMedia}
            onUpdateNarration={updateNarrationText}
            onRegenerate={() => generateScript(topicConfig)}
          />
        </StepErrorBoundary>
      );
    case 'media':
      return (
        <StepErrorBoundary stepName="Media">
          <MediaStep
            project={project}
            status={stepStatuses.media}
            progress={processingProgress}
            message={processingMessage}
            onNext={handleGenerateNarration}
            onReplace={handleReplaceMedia}
            onRetry={handleSourceMedia}
          />
        </StepErrorBoundary>
      );
    case 'narration':
      return (
        <StepErrorBoundary stepName="Narration">
          <NarrationStep
            project={project}
            status={stepStatuses.narration}
            progress={processingProgress}
            message={processingMessage}
            onGenerateNarration={handleGenerateNarration}
            onNext={handleRunAIEdit}
            appConfig={appConfig}
          />
        </StepErrorBoundary>
      );
    case 'ai_edit':
      return (
        <StepErrorBoundary stepName="AI Edit">
          <AIEditStep
            project={project}
            status={stepStatuses.ai_edit}
            progress={processingProgress}
            message={processingMessage}
            onRunAIEdit={handleRunAIEdit}
            onSkipAIEdit={handleSkipAIEdit}
            onNext={handleAssembleVideo}
          />
        </StepErrorBoundary>
      );
    case 'assembly':
      return (
        <StepErrorBoundary stepName="Assembly">
          <AssemblyStep
            project={project}
            status={stepStatuses.assembly}
            progress={processingProgress}
            message={processingMessage}
            onAssemble={handleAssembleVideo}
            onNext={() => setCurrentStep('preview')}
            onCancel={cancelRender}
            onRetry={handleRetryAssemble}
          />
        </StepErrorBoundary>
      );
    case 'preview':
      return (
        <StepErrorBoundary stepName="Preview">
          <PreviewStep
            project={project}
            onReset={resetProject}
            onOpenExport={onOpenExport}
          />
        </StepErrorBoundary>
      );
    default:
      return null;
  }
}
