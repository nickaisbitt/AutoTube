import { useVideoProject } from '../store/StoreContext';
import OnboardingModal from './OnboardingModal';
import SettingsModal from './SettingsModal';
import ExportModal from './ExportModal';
import PinUnlockModal from './PinUnlockModal';

export default function AppModals({
  isSettingsOpen,
  setIsSettingsOpen,
  isExportOpen,
  setIsExportOpen,
  showOnboarding,
  setShowOnboarding,
  handleExport,
}: {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  isExportOpen: boolean;
  setIsExportOpen: (v: boolean) => void;
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
  handleExport: (quality: 'draft' | 'standard' | 'high', format: 'webm' | 'mp4', resolution?: '720p' | '1080p' | '4K' | '2.39:1') => Promise<void> | void;
}) {
  const { project } = useVideoProject();

  const handleOnboardingComplete = () => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
    setShowOnboarding(false);
  };

  return (
    <>
      <PinUnlockModal />
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        project={project}
        onExport={handleExport}
      />
    </>
  );
}
