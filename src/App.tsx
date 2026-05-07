import { useCallback, useEffect } from 'react';
import PipelineSidebar from './components/PipelineSidebar';
import TopicStep from './components/TopicStep';
import ScriptStep from './components/ScriptStep';
import MediaStep from './components/MediaStep';
import NarrationStep from './components/NarrationStep';
import AIEditStep from './components/AIEditStep';
import AssemblyStep from './components/AssemblyStep';
import PreviewStep from './components/PreviewStep';
import DebugOverlay from './components/DebugOverlay';
import SettingsModal from './components/SettingsModal';
import OnboardingModal from './components/OnboardingModal';
import ExportModal from './components/ExportModal';
import BatchProcessor from './components/BatchProcessor';
import { useVideoProject } from './store';
import type { PipelineStep, TopicConfig, VideoProject } from './types';
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
    runAIEdit,
    skipAIEdit,
    assembleVideo,
    generateFullVideo,
    cancelRender,
    retryAssemble,
    resetProject,
    loadProject,
    logs,
    updateNarrationText,
    batchGenerate,
    isBatchProcessing,
    batchJobs,
    appConfig,
  } = useVideoProject();

  const assembleVideoWithOptions = assembleVideo as unknown as (
    exportOptions?: { quality?: 'draft' | 'standard' | 'high'; format?: 'webm' | 'mp4' },
    projectOverride?: VideoProject,
  ) => Promise<VideoProject | null>;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check for first-time user and try to load saved project
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('autotube_onboarding_seen');
    if (!hasSeenOnboarding && !appConfig.openRouterKey) {
      setShowOnboarding(true);
    } else {
      // Mark as seen if key already exists (e.g. from .env or session)
      if (!hasSeenOnboarding && appConfig.openRouterKey) {
        localStorage.setItem('autotube_onboarding_seen', 'true');
      }
      // Try to load saved project
      loadProject();
    }
  }, [loadProject, appConfig.openRouterKey]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  const handleStepClick = useCallback((step: PipelineStep) => {
    const status = stepStatuses[step];
    if (status === 'complete' || status === 'active') {
      setCurrentStep(step);
    }
  }, [setCurrentStep, stepStatuses]);

  const handleGenerate = useCallback(async (config: TopicConfig) => {
    await generateScript(config);
  }, [generateScript]);

  const handleGenerateFull = useCallback(async (config: TopicConfig) => {
    await generateFullVideo(config);
  }, [generateFullVideo]);

  const handleSourceMedia = useCallback(async () => {
    const activeProject = project;
    if (!activeProject) return;
    setCurrentStep('media');
    await sourceMedia(activeProject);
  }, [project, setCurrentStep, sourceMedia]);

  const handleReplaceMedia = useCallback(async (assetId: string) => {
    await replaceMediaAsset(assetId);
  }, [replaceMediaAsset]);

  const handleGenerateNarration = useCallback(async () => {
    const activeProject = project;
    if (!activeProject) return;
    setCurrentStep('narration');
    const result = await generateNarration(activeProject);
    if (result) {
      setCurrentStep('ai_edit');
    }
  }, [project, generateNarration, setCurrentStep]);

  const handleRunAIEdit = useCallback(async () => {
    const activeProject = project;
    if (!activeProject) return;
    setCurrentStep('ai_edit');
    await runAIEdit(activeProject);
  }, [project, runAIEdit, setCurrentStep]);

  const handleSkipAIEdit = useCallback(() => {
    skipAIEdit();
  }, [skipAIEdit]);

  const handleAssembleVideo = useCallback(async (options?: { backgroundMusic?: boolean; musicPreset?: string }) => {
    const activeProject = project;
    if (!activeProject) return;
    // Apply backgroundMusic setting to the project's exportSettings before rendering
    // Default to highest quality: 1080p, MP4, 24fps — single render, one-click download
    const bgMusic = options?.backgroundMusic !== false; // defaults to true
    const projectWithBgMusic: VideoProject = {
      ...activeProject,
      exportSettings: {
        ...activeProject.exportSettings,
        quality: activeProject.exportSettings?.quality ?? 'high',
        format: activeProject.exportSettings?.format ?? 'mp4',
        width: activeProject.exportSettings?.width ?? 1920,
        height: activeProject.exportSettings?.height ?? 1080,
        resolution: activeProject.exportSettings?.resolution ?? '1080p',
        mimeType: activeProject.exportSettings?.mimeType ?? 'video/mp4',
        fileName: activeProject.exportSettings?.fileName ?? 'video.mp4',
        backgroundMusic: bgMusic,
        musicPreset: options?.musicPreset,
      },
    };
    setCurrentStep('assembly');
    await assembleVideoWithOptions(undefined, projectWithBgMusic);
  }, [project, assembleVideoWithOptions, setCurrentStep]);

  const handleRetryAssemble = useCallback(async () => {
    await retryAssemble();
  }, [retryAssemble]);

  // #40: handleExport calls assembleVideoWithOptions → assembleVideo → renderVideoToBlob,
  // which already tries tryServerRender first (server-side node-canvas + ffmpeg) before
  // falling back to the browser renderer. No extra wiring needed.
  const handleExport = useCallback(async (quality: 'draft' | 'standard' | 'high', format: 'webm' | 'mp4', resolution?: '720p' | '1080p' | '4K') => {
    const activeProject = project;
    if (!activeProject) return;
    // Store the selected resolution in exportSettings so the renderer can pick it up
    if (resolution && activeProject.exportSettings) {
      activeProject.exportSettings.resolution = resolution;
    } else if (resolution) {
      activeProject.exportSettings = {
        quality,
        format,
        resolution,
        width: 0,
        height: 0,
        mimeType: format === 'mp4' ? 'video/mp4' : 'video/webm',
        fileName: `${activeProject.title || 'video'}.${format}`,
      };
    }
    await assembleVideoWithOptions({ quality, format }, activeProject);
  }, [project, assembleVideoWithOptions]);

  const renderStep = () => {
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
            onOpenExport={() => setIsExportOpen(true)}
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
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={project}
        onExport={handleExport}
      />
      <DebugOverlay logs={logs} />
    </div>
  );
}
