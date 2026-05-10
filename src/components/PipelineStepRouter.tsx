import React, { useCallback } from 'react';
import { useVideoProject } from '../store';
import { TopicConfig, VideoProject } from '../types';

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

  const assembleVideoWithOptions = assembleVideo as unknown as (
    exportOptions?: { quality?: 'draft' | 'standard' | 'high'; format?: 'webm' | 'mp4' },
    projectOverride?: VideoProject,
  ) => Promise<VideoProject | null>;

  const handleAssembleVideo = useCallback(async (options?: { backgroundMusic?: boolean; musicPreset?: string; quality?: 'draft' | 'standard' | 'high' }) => {
    if (!project) return;
    const bgMusic = options?.backgroundMusic !== false;
    const selectedQuality = options?.quality ?? 'standard';
    const projectWithBgMusic: VideoProject = {
      ...project,
      exportSettings: {
        ...project.exportSettings,
        quality: selectedQuality,
        format: project.exportSettings?.format ?? 'mp4',
        width: project.exportSettings?.width ?? 1920,
        height: project.exportSettings?.height ?? 1080,
        resolution: project.exportSettings?.resolution ?? '1080p',
        mimeType: project.exportSettings?.mimeType ?? 'video/mp4',
        fileName: project.exportSettings?.fileName ?? 'video.mp4',
        backgroundMusic: bgMusic,
        musicPreset: options?.musicPreset,
      },
    };
    setCurrentStep('assembly');
    await assembleVideoWithOptions({ quality: selectedQuality }, projectWithBgMusic);
  }, [project, assembleVideoWithOptions, setCurrentStep]);

  const handleRetryAssemble = useCallback(async () => {
    await retryAssemble();
  }, [retryAssemble]);

  switch (currentStep) {
    case 'topic':
      return (
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
          onRegenerate={() => generateScript(topicConfig)}
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
          onGenerateNarration={handleGenerateNarration}
          onNext={handleRunAIEdit}
          appConfig={appConfig}
        />
      );
    case 'ai_edit':
      return (
        <AIEditStep
          project={project}
          status={stepStatuses.ai_edit}
          progress={processingProgress}
          message={processingMessage}
          onRunAIEdit={handleRunAIEdit}
          onSkipAIEdit={handleSkipAIEdit}
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
          onAssemble={handleAssembleVideo}
          onNext={() => setCurrentStep('preview')}
          onCancel={cancelRender}
          onRetry={handleRetryAssemble}
        />
      );
    case 'preview':
      return (
        <PreviewStep
          project={project}
          onReset={resetProject}
          onOpenExport={onOpenExport}
        />
      );
    default:
      return null;
  }
}
