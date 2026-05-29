import { useState, useEffect, useCallback } from 'react';
import AppShell from './components/AppShell';
import AppModals from './components/AppModals';
import PipelineStepRouter from './components/PipelineStepRouter';
import RenderProgressDashboard from './components/RenderProgressDashboard';
import { useVideoProject } from './store';
import { VideoProject } from './types';

export default function App() {
  const { appConfig, loadProject, project, assembleVideo } = useVideoProject();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('autotube_onboarding_seen');
    if (!hasSeenOnboarding && !appConfig.openRouterKey) {
      setShowOnboarding(true);
    } else {
      if (!hasSeenOnboarding && appConfig.openRouterKey) {
        localStorage.setItem('autotube_onboarding_seen', 'true');
      }
      loadProject();
    }
  }, [loadProject, appConfig.openRouterKey]);

  const assembleVideoWithOptions = assembleVideo as unknown as (
    exportOptions?: { quality?: 'draft' | 'standard' | 'high'; format?: 'webm' | 'mp4' },
    projectOverride?: VideoProject,
  ) => Promise<VideoProject | null>;

  const handleExport = useCallback(async (quality: 'draft' | 'standard' | 'high', format: 'webm' | 'mp4', resolution?: '720p' | '1080p' | '4K') => {
    if (!project) return;
    
    // Use structuredClone for deep immutable copy to prevent store mutations
    const clonedProject = structuredClone(project);
    clonedProject.exportSettings = {
      quality,
      format,
      resolution: resolution || '1080p',
      width: 0,
      height: 0,
      mimeType: format === 'mp4' ? 'video/mp4' : 'video/webm',
      fileName: `${project.title || 'video'}.${format}`,
    };
    
    await assembleVideoWithOptions({ quality, format }, clonedProject);
  }, [project, assembleVideoWithOptions]);

  return (
    <AppShell onOpenSettings={() => setIsSettingsOpen(true)}>
      <PipelineStepRouter onOpenExport={() => setIsExportOpen(true)} />
      <RenderProgressDashboard />
      <AppModals
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        isExportOpen={isExportOpen}
        setIsExportOpen={setIsExportOpen}
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
        handleExport={handleExport}
      />
    </AppShell>
  );
}
