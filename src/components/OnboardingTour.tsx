import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, X, RotateCcw } from 'lucide-react';

const ONBOARDING_STORAGE_KEY = 'autotube_onboarding_completed';
const ONBOARDING_SEEN_KEY = 'autotube_onboarding_seen';

interface Step {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    id: 'topic',
    title: 'Enter Your Video Topic',
    description: 'Type your YouTube video topic here. Our AI will use this to generate a professional script.',
    targetSelector: '[data-onboarding="topic-input"]',
    position: 'bottom',
  },
  {
    id: 'script',
    title: 'AI Script Generation',
    description: "We'll generate a complete script with segments, hooks, and transitions automatically.",
    targetSelector: '[data-onboarding="script-step"]',
    position: 'bottom',
  },
  {
    id: 'media',
    title: 'Media Sourcing & Preview',
    description: 'AI plans visuals for each segment and finds relevant images. Preview and customize your video here.',
    targetSelector: '[data-onboarding="preview-step"]',
    position: 'bottom',
  },
  {
    id: 'assemble',
    title: 'Assemble & Render',
    description: 'Click "Assemble Video" to render your final video with Ken Burns effects, captions, and smooth transitions.',
    targetSelector: '[data-onboarding="assemble-button"]',
    position: 'top',
  },
];

interface OnboardingTourProps {
  isOpen: boolean;
  onComplete: () => void;
  currentStep?: string;
}

export function useOnboarding() {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!completed) {
      setShowTour(true);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    setShowTour(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_SEEN_KEY);
    setShowTour(true);
  }, []);

  return { showTour, completeOnboarding, resetOnboarding };
}

export default function OnboardingTour({ isOpen, onComplete, currentStep }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setStepIndex(0);
      return;
    }

    if (currentStep) {
      const matchingIndex = STEPS.findIndex(s => s.id === currentStep);
      if (matchingIndex !== -1 && matchingIndex >= stepIndex) {
        setStepIndex(matchingIndex);
      }
    }
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const step = STEPS[stepIndex];

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const getSpotlightStyle = (): React.CSSProperties => {
    const el = document.querySelector(step.targetSelector);
    if (!el) return { display: 'none' };

    const rect = el.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      top: rect.top - 8,
      left: rect.left - 8,
      width: rect.width + 16,
      height: rect.height + 16,
      borderRadius: 8,
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
      border: '2px solid #f59e0b',
      zIndex: 9998,
      pointerEvents: 'none' as const,
    };
  };

  const getTooltipPosition = (): React.CSSProperties => {
    const el = document.querySelector(step.targetSelector);
    if (!el) return { display: 'none' };

    const rect = el.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 160;

    let top: number;
    let left: number;

    switch (step.position) {
      case 'bottom':
        top = rect.bottom + 16;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = rect.top - tooltipHeight - 16;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - 16;
        break;
      case 'right':
      default:
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + 16;
        break;
    }

    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    return {
      position: 'fixed' as const,
      top,
      left,
      width: tooltipWidth,
      zIndex: 9999,
    };
  };

  return (
    <>
      <div
        style={getSpotlightStyle()}
        data-onboarding-spotlight
      />
      <div style={getTooltipPosition()} className="border-2 border-brand-500 bg-surface-900 p-5 shadow-hard">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-brand-500' : 'bg-surface-700'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="text-surface-500 hover:text-white"
            aria-label="Skip onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-white">
          Step {stepIndex + 1}: {step.title}
        </h3>
        <p className="mb-4 text-xs font-mono leading-relaxed text-surface-400">
          {step.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-surface-600">
            {stepIndex + 1} of {STEPS.length}
          </span>
          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 bg-brand-500 px-3 py-1.5 text-xs font-bold uppercase text-black"
          >
            {stepIndex < STEPS.length - 1 ? (
              <>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </>
            ) : (
              'Get Started'
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export function ShowTourAgainButton() {
  const { resetOnboarding } = useOnboarding();

  return (
    <button
      onClick={resetOnboarding}
      className="flex items-center gap-1.5 text-xs font-mono text-surface-400 hover:text-brand-400"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Show Tour Again
    </button>
  );
}
