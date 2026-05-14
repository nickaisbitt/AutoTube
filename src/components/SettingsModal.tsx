import { useState, useEffect, useMemo } from 'react';
import { X, ExternalLink, Settings, AlertTriangle, CheckCircle, AlertCircle, Mic2, Check, XCircle } from 'lucide-react';
import { useVideoProject } from '../store';
import { logger } from '../services/logger';
import AssetTester from './AssetTester';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { appConfig: config, setAppConfig } = useVideoProject();
  const [orVal, setOrVal] = useState(config.openRouterKey);
  const [sourceTypeVal, setSourceTypeVal] = useState(config.sourceType);
  const [flickrVal, setFlickrVal] = useState(config.flickrKey || '');
  const [showAssetTester, setShowAssetTester] = useState(false);
  const [status, setStatus] = useState<Record<string, 'idle' | 'testing' | 'valid' | 'invalid'>>({
    openRouter: 'idle',
  });

  // TTS engine availability from env vars
  const hasMeloKeys = useMemo(() => !!(import.meta.env.VITE_CF_ACCOUNT_ID && import.meta.env.VITE_CF_API_TOKEN), []);

  useEffect(() => {
    if (isOpen) {
      setOrVal(config.openRouterKey);
      setSourceTypeVal(config.sourceType);
      setFlickrVal(config.flickrKey || '');
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const verifyAll = async () => {
    try {
      logger.info('Settings', 'Starting API credential verification...');

      setStatus(s => ({ ...s, openRouter: 'testing' }));
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${orVal}` }
        });
        if (res.ok) {
          setStatus(s => ({ ...s, openRouter: 'valid' }));
          logger.success('Settings', 'OpenRouter key is VALID.');
        } else {
          setStatus(s => ({ ...s, openRouter: 'invalid' }));
          logger.error('Settings', `OpenRouter key is INVALID (Status: ${res.status})`);
        }
      } catch {
        setStatus(s => ({ ...s, openRouter: 'invalid' }));
      }
    } catch {
      setStatus(s => ({
        ...s,
        openRouter: s.openRouter === 'testing' ? 'invalid' : s.openRouter,
      }));
      logger.error('Settings', 'API verification failed unexpectedly');
    }
  };

  const isORMismatched = orVal.length > 0 && !orVal.startsWith('sk-or-v1-');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAppConfig({
      openRouterKey: orVal.trim(),
      sourceType: sourceTypeVal,
      flickrKey: flickrVal.trim(),
      ttsVoice: ttsVoiceVal,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="settings-modal">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      
      <div className="relative w-full max-w-lg overflow-hidden border-2 border-surface-700 bg-surface-900 shadow-hard">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between border-b-2 border-surface-700 px-6 py-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-brand-500" />
              <h2 className="text-lg font-bold uppercase tracking-wider text-white">Settings</h2>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="border-2 border-surface-700 p-1 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
              data-testid="settings-modal-close"
              aria-label="Close settings modal"
              title="Close settings modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-start gap-2 border-2 border-amber-500 bg-amber-900 px-3 py-2.5 text-[11px] font-mono text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>API keys are stored in your browser's localStorage. Only use this on a device you trust.</span>
            </div>

            {/* AI Generation — OpenRouter */}
            <div className="space-y-3 border-2 border-surface-700 bg-surface-950 p-3">
              <label className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-500">
                AI Generation (Required)
              </label>
              <div className="space-y-2">
                <label htmlFor="openRouterKey" className="text-[11px] font-mono font-medium text-surface-400 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    OpenRouter API Key
                    {status.openRouter === 'valid' && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                    {status.openRouter === 'invalid' && <AlertCircle className="h-3 w-3 text-red-500" />}
                  </span>
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-brand-400 hover:underline flex items-center gap-1">
                    Get Key <ExternalLink className="h-2 w-2" />
                  </a>
                </label>
                <input
                  id="openRouterKey"
                  name="openRouterKey"
                  type="password"
                  value={orVal}
                  onChange={(e) => setOrVal(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className={`w-full border-2 px-3 py-2 text-xs font-mono text-white placeholder-surface-600 focus:outline-none ${
                    isORMismatched ? 'border-red-500 bg-red-900' : 'border-surface-700 bg-surface-800 focus:border-brand-500'
                  }`}
                />
                {isORMismatched && (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    OpenRouter keys typically start with 'sk-or-v1-'.
                  </div>
                )}
                <p className="text-[10px] font-mono text-surface-500">
                  Powers script generation (Gemini Flash), visual planning, AI editing, blind review, and image quality checks (Reka Edge). ~$0.10/M tokens.
                </p>
              </div>
            </div>

            {/* Visual Harvesting — Free sources + optional Flickr */}
            <div className="space-y-3 border-2 border-surface-700 bg-surface-950 p-3">
              <label className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-500">
                Visual Harvesting
                <span className="ml-2 text-[10px] text-brand-400 normal-case font-mono font-normal border-2 border-brand-500 px-1.5 py-0.5 bg-brand-900">Free Sources Active</span>
              </label>
              <p className="text-[10px] font-mono text-surface-500">
                Images are sourced from DuckDuckGo, Wikimedia Commons, and government press archives — all free, no API key needed.
              </p>
              <div className="space-y-2">
                <label htmlFor="flickrKey" className="text-[11px] font-mono font-medium text-surface-400 flex items-center justify-between">
                  Flickr API Key (Optional — adds CC-licensed photos)
                  <a href="https://www.flickr.com/services/apps/create/" target="_blank" rel="noopener" className="text-brand-400 hover:underline flex items-center gap-1">
                    Get Key <ExternalLink className="h-2 w-2" />
                  </a>
                </label>
                <input
                  id="flickrKey"
                  name="flickrKey"
                  type="password"
                  value={flickrVal}
                  onChange={(e) => setFlickrVal(e.target.value)}
                  placeholder="Enter Flickr key..."
                  className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2 text-xs font-mono text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Sourcing Strategy */}
            <div className="space-y-3 border-2 border-surface-700 bg-surface-950 p-3">
              <label className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-500">
                Sourcing Strategy
              </label>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <label className="relative flex cursor-pointer items-center justify-center border-2 border-surface-700 bg-surface-950 py-2.5 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500 has-[:checked]:text-black">
                  <input type="radio" name="sourceType" value="stock" checked={sourceTypeVal === 'stock'} onChange={() => setSourceTypeVal('stock')} className="sr-only" data-testid="source-type-stock" />
                  Stock (Free)
                </label>
                <label className="relative flex cursor-pointer items-center justify-center border-2 border-surface-700 bg-surface-950 py-2.5 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500 has-[:checked]:text-black">
                  <input type="radio" name="sourceType" value="raw" checked={sourceTypeVal === 'raw'} onChange={() => setSourceTypeVal('raw')} className="sr-only" data-testid="source-type-raw" />
                  Raw (Web)
                </label>
              </div>
            </div>

            {/* Narration (TTS) — Fallback Chain Status */}
            <div className="space-y-3 border-2 border-surface-700 bg-surface-950 p-3">
              <label className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-2">
                <Mic2 className="h-3.5 w-3.5" />
                Narration (TTS)
              </label>

              {/* TTS Engine Availability */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-medium text-surface-400">TTS Fallback Chain</label>
                <div className="space-y-1">
                   <div className="flex items-center gap-2 text-[11px] font-mono">
                     <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                     <span className="text-emerald-400">
                       1. Kokoro-82M — Local, GPU accelerated (primary)
                     </span>
                   </div>
                   <div className="flex items-center gap-2 text-[11px] font-mono">
                     {hasMeloKeys ? (
                       <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                     ) : (
                       <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                     )}
                     <span className={hasMeloKeys ? 'text-emerald-400' : 'text-surface-500'}>
                       2. MeloTTS (Cloudflare) — Cheap fallback
                     </span>
                   </div>
                   <div className="flex items-center gap-2 text-[11px] font-mono">
                     <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                     <span className="text-emerald-400">
                       3. Browser TTS — Free fallback
                     </span>
                   </div>
                </div>
              </div>

              <p className="text-[10px] font-mono text-surface-500">
                Server-side renders use Kokoro-82M (local) → MeloTTS. Browser renders use built-in speech synthesis. All free, no API costs.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t-2 border-surface-700 bg-surface-950 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowAssetTester(true)}
              className="flex items-center gap-2 border-2 border-surface-700 px-4 py-2 text-xs font-mono font-semibold text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
              data-testid="open-asset-tester"
            >
              Asset Tester
            </button>
            <button
              type="button"
              onClick={verifyAll}
              className="flex items-center gap-2 border-2 border-surface-700 px-4 py-2 text-xs font-mono font-semibold text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
              data-testid="settings-test-connections"
            >
              Test Connection
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="border-2 border-surface-700 px-4 py-2 text-xs font-mono font-semibold text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-brand-500 px-6 py-2 text-xs font-bold uppercase text-black shadow-hard-sm"
              data-testid="settings-save-button"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
      <AssetTester isOpen={showAssetTester} onClose={() => setShowAssetTester(false)} appConfig={config} />
    </div>
  );
}
