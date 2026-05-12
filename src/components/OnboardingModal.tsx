import { useState } from 'react';
import { Key, Zap, Film, Mic, ChevronRight, Check, ExternalLink } from 'lucide-react';
import { useVideoProject } from '../store';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
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

export default function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const { appConfig, setAppConfig } = useVideoProject();
  const [openRouterKey, setOpenRouterKey] = useState(appConfig.openRouterKey);
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const handleSave = () => {
    setAppConfig({
      ...appConfig,
      openRouterKey: openRouterKey.trim(),
    });
    onComplete();
  };

  const StepIcon = STEPS[currentStep].icon;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
                onChange={(e) => setOpenRouterKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2.5 text-sm font-mono text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
                aria-label="OpenRouter API Key"
              />
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-mono text-brand-400 hover:text-brand-300"
              >
                Get your key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => currentStep === 0 ? handleSave() : setCurrentStep(Math.max(0, currentStep - 1))}
            className="border-2 border-surface-700 px-4 py-2 text-sm font-mono font-medium text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
          >
            {currentStep === 0 ? 'Skip' : '← Back'}
          </button>
          
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="flex items-center gap-2 bg-brand-500 px-4 py-2 text-sm font-bold uppercase text-black shadow-hard-sm"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-emerald-500 px-4 py-2 text-sm font-bold uppercase text-black shadow-hard-sm"
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
