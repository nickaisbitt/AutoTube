import { useState } from 'react';
import { Key, Zap, Film, Mic, ChevronRight, Check, ExternalLink, Settings } from 'lucide-react';
import { useVideoProject } from '../store/StoreContext';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
  /** Optional: open Settings when user skips without a key (avoids dead-start). */
  onOpenSettings?: () => void;
}

const STEPS = [
  {
    icon: Key,
    title: 'API Key Setup',
    description: 'Add your OpenRouter API key to enable AI-powered script generation. The app requires this key to create professional YouTube scripts.',
  },
  {
    icon: Zap,
    title: 'Generate Scripts',
    description: 'Enter a topic and our AI will create a professional YouTube script with segments, hooks, and transitions.',
  },
  {
    icon: Film,
    title: 'Source Media',
    description: 'AI plans visuals for each segment and finds relevant images from free sources like DuckDuckGo, Wikimedia, and Unsplash.',
  },
  {
    icon: Mic,
    title: 'Narrate & Render',
    description: 'Generate professional voiceover and render a complete video with Ken Burns effects, captions, and smooth transitions.',
  },
];

export default function OnboardingModal({ isOpen, onComplete, onOpenSettings }: OnboardingModalProps) {
  const { appConfig, setAppConfig } = useVideoProject();
  const [openRouterKey, setOpenRouterKey] = useState(appConfig.openRouterKey);
  const [currentStep, setCurrentStep] = useState(0);
  const [keyError, setKeyError] = useState(false);

  if (!isOpen) return null;

  const persistKeyAndComplete = (key: string) => {
    setAppConfig({
      ...appConfig,
      openRouterKey: key,
    });
    onComplete();
  };

  const handleSave = () => {
    const trimmed = openRouterKey.trim();
    if (!trimmed) {
      setKeyError(true);
      return;
    }
    setKeyError(false);
    persistKeyAndComplete(trimmed);
  };

  /** Skip: require a key, or open Settings — never persist empty key + seen forever. */
  const handleSkip = () => {
    const trimmed = openRouterKey.trim();
    if (trimmed) {
      setKeyError(false);
      persistKeyAndComplete(trimmed);
      return;
    }
    if (onOpenSettings) {
      setKeyError(false);
      onOpenSettings();
      return;
    }
    setKeyError(true);
  };

  const StepIcon = STEPS[currentStep].icon;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" data-testid="onboarding-modal">
      <div className="absolute inset-0 bg-black/90" />
      <div className="relative w-full max-w-lg border-2 border-surface-700 bg-surface-900 p-8 shadow-hard">
        {/* Progress squares */}
        <div className="mb-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-8 ${
                i <= currentStep ? 'bg-brand-500' : 'bg-surface-700'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center bg-brand-500">
            <StepIcon className="h-8 w-8 text-black" />
          </div>
          <h2 className="text-xl font-bold uppercase tracking-wider text-white">{STEPS[currentStep].title}</h2>
          <p className="mt-2 text-sm font-mono text-surface-400">{STEPS[currentStep].description}</p>
        </div>

        {/* API Key inputs on first step */}
        {currentStep === 0 && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-mono font-medium text-surface-300">
                OpenRouter API Key <span className="text-red-400">(required)</span>
              </label>
              <input
                type="password"
                value={openRouterKey}
                onChange={(e) => {
                  setOpenRouterKey(e.target.value);
                  if (e.target.value.trim()) setKeyError(false);
                }}
                placeholder="sk-or-v1-..."
                className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2.5 text-sm font-mono text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
                aria-label="OpenRouter API Key"
                data-testid="onboarding-api-key-input"
              />
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-mono text-brand-400 hover:text-brand-300"
              >
                Get your key <ExternalLink className="h-3 w-3" />
              </a>
              {keyError && (
                <p className="mt-2 text-xs font-mono text-red-400" data-testid="onboarding-key-required">
                  Enter an API key, or open Settings to add one before continuing.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={currentStep === 0 ? 'onboarding-skip' : 'onboarding-back'}
              onClick={() => currentStep === 0 ? handleSkip() : setCurrentStep(Math.max(0, currentStep - 1))}
              className="border-2 border-surface-700 px-4 py-2 text-sm font-mono font-medium text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            >
              {currentStep === 0 ? 'Skip' : '← Back'}
            </button>
            {currentStep === 0 && onOpenSettings && (
              <button
                type="button"
                data-testid="onboarding-open-settings"
                onClick={() => onOpenSettings()}
                className="inline-flex items-center gap-1 border-2 border-surface-700 px-3 py-2 text-sm font-mono font-medium text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>
            )}
          </div>
          
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={() => {
                if (currentStep === 0 && !openRouterKey.trim()) {
                  setKeyError(true);
                  return;
                }
                setCurrentStep(currentStep + 1);
              }}
              className="flex items-center gap-2 bg-brand-500 px-4 py-2 text-sm font-bold uppercase text-black shadow-hard-sm"
              data-testid="onboarding-next"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-emerald-500 px-4 py-2 text-sm font-bold uppercase text-black shadow-hard-sm"
              data-testid="onboarding-get-started"
            >
              <Check className="h-4 w-4" />
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
