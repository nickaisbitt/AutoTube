import { useState, useEffect, useCallback } from 'react';
import AppShell from './components/AppShell';
import AppModals from './components/AppModals';
import PipelineStepRouter from './components/PipelineStepRouter';
import RenderProgressDashboard from './components/RenderProgressDashboard';
import ToastContainer from './components/Toast';
import { StoreProvider, useVideoProject } from './store/StoreContext';
import { getExportBlockStatus } from './store/pipeline/orchestrator';
import { toast } from './hooks/useToast';

function AppContent() {
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

  const handleExport = useCallback(async (quality: 'draft' | 'standard' | 'high', format: 'webm' | 'mp4', resolution?: '720p' | '1080p' | '4K' | '2.39:1') => {
    if (!project) return;

    const block = getExportBlockStatus(project);
    if (block.blocked) {
      toast(block.reason ?? 'Export blocked by quality gate', 'error');
      return;
    }
    
    const clonedProject = structuredClone(project);
    const exportResolution =
      !resolution || resolution === '2.39:1' ? '1080p' : resolution;
    clonedProject.exportSettings = {
      quality,
      format,
      resolution: exportResolution,
      width: 0,
      height: 0,
      mimeType: format === 'mp4' ? 'video/mp4' : 'video/webm',
      fileName: `${project.title || 'video'}.${format}`,
    };
    
    await assembleVideo({ quality, format }, clonedProject);
  }, [project, assembleVideo]);

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
      <ToastContainer />
    </AppShell>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
