import { useState, useEffect, useCallback } from 'react';
import { Flag, RotateCcw, X } from 'lucide-react';
import { getAllFlags, setFeatureFlag, resetFeatureFlags } from '../services/featureFlags';
import type { FeatureFlag } from '../services/featureFlags';

interface FeatureFlagsPanelProps {
  onClose: () => void;
}

export default function FeatureFlagsPanel({ onClose }: FeatureFlagsPanelProps) {
  const [flags, setFlags] = useState<Array<FeatureFlag & { overridden?: boolean }>>([]);

  const refresh = useCallback(() => {
    setFlags(getAllFlags());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = (name: string, currentEnabled: boolean) => {
    setFeatureFlag(name, !currentEnabled);
    refresh();
  };

  const handleReset = () => {
    resetFeatureFlags();
    refresh();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-lg border-2 border-surface-700 bg-surface-900 p-6 shadow-hard">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-brand-400" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-white">Feature Flags</h3>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black p-1"
            aria-label="Close feature flags panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {flags.map(flag => (
            <div
              key={flag.name}
              className="flex items-center justify-between border-2 border-surface-700 bg-surface-950 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-mono text-white">{flag.name}</span>
                  {flag.overridden && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-brand-400 bg-brand-500/10 px-1.5 py-0.5">
                      overridden
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-surface-500 mt-0.5">
                  Rollout: {flag.rolloutPercentage}%
                </p>
              </div>
              <button
                onClick={() => handleToggle(flag.name, flag.enabled)}
                className={`px-3 py-1.5 text-xs font-bold font-mono uppercase ${
                  flag.enabled
                    ? 'bg-brand-500 text-black'
                    : 'bg-surface-800 text-surface-400 border border-surface-600'
                }`}
                aria-label={`Toggle ${flag.name} ${flag.enabled ? 'off' : 'on'}`}
              >
                {flag.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 border-2 border-surface-600 bg-surface-800 px-4 py-2 text-xs font-bold font-mono uppercase text-surface-300 hover:border-brand-500 hover:text-brand-400"
            aria-label="Reset all feature flags to defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
