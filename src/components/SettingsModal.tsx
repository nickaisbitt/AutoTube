import { useState, useEffect } from 'react';
import { X, ExternalLink, Settings, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { useVideoProject } from '../store';
import { logger } from '../services/logger';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { appConfig: config, setAppConfig } = useVideoProject();
  const [serperVal, setSerperVal] = useState(config.serperKey);
  const [orVal, setOrVal] = useState(config.openRouterKey);
  const [pexelsVal, setPexelsVal] = useState(config.pexelsKey);
  const [firecrawlVal, setFirecrawlVal] = useState(config.firecrawlKey);
  const [openAIVal, setOpenAIVal] = useState(config.openAIKey);
  const [sourceTypeVal, setSourceTypeVal] = useState(config.sourceType);
  const [status, setStatus] = useState<Record<string, 'idle' | 'testing' | 'valid' | 'invalid'>>({
    pexels: 'idle',
    serper: 'idle',
    openRouter: 'idle',
    firecrawl: 'idle',
    openAI: 'idle'
  });

  // Sync local state when modal opens with current config
  useEffect(() => {
    if (isOpen) {
      setSerperVal(config.serperKey);
      setOrVal(config.openRouterKey);
      setPexelsVal(config.pexelsKey);
      setFirecrawlVal(config.firecrawlKey);
      setOpenAIVal(config.openAIKey);
      setSourceTypeVal(config.sourceType);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const verifyAll = async () => {
    logger.info('Settings', 'Starting API credential verification audit...');
    
    // 1. Serper Test
    setStatus(s => ({ ...s, serper: 'testing' }));
    try {
      const res = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': serperVal, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'test', num: 1 })
      });
      if (res.ok) {
        setStatus(s => ({ ...s, serper: 'valid' }));
        logger.success('Settings', 'Serper.dev key is VALID.');
      } else {
        setStatus(s => ({ ...s, serper: 'invalid' }));
        logger.error('Settings', `Serper.dev key is INVALID (Status: ${res.status})`);
      }
    } catch {
      setStatus(s => ({ ...s, serper: 'invalid' }));
    }

    // 2. OpenRouter Test
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
  };

  const isSerperMismatched = serperVal.startsWith('sk-or-v1-');
  const isORMismatched = orVal.length > 0 && !orVal.startsWith('sk-or-v1-');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAppConfig({
      pexelsKey: pexelsVal.trim(),
      openAIKey: openAIVal.trim(),
      serperKey: serperVal.trim(),
      openRouterKey: orVal.trim(),
      firecrawlKey: firecrawlVal.trim(),
      sourceType: sourceTypeVal,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-surface-950/80 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-2xl animate-in fade-in zoom-in duration-200">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between border-b border-surface-800 px-6 py-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-brand-400" />
              <h2 className="text-lg font-bold text-white">Global Settings</h2>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-surface-400 hover:bg-surface-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6">
            <div className="space-y-3 rounded-xl border border-surface-800 bg-surface-950/50 p-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                Visual Harvesting (Search)
                <span className="ml-2 text-[10px] text-brand-400 normal-case font-normal border border-brand-500/30 rounded px-1.5 py-0.5 bg-brand-500/5">Local DDG Active (Free)</span>
              </label>
              
                <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="pexelsKey" className="text-[11px] font-medium text-surface-400 flex items-center justify-between">
                    Pexels API Key (Stock)
                    <a href="https://www.pexels.com/api/new/" target="_blank" rel="noopener" className="text-brand-400 hover:underline flex items-center gap-1">
                      Get Key <ExternalLink className="h-2 w-2" />
                    </a>
                  </label>
                  <input
                    id="pexelsKey"
                    name="pexelsKey"
                    type="password"
                    value={pexelsVal}
                    onChange={(e) => setPexelsVal(e.target.value)}
                    placeholder="Enter Pexels key..."
                    className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="serperKey" className="text-[11px] font-medium text-surface-400 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        Serper.dev API Key (Google - Optional)
                        {status.serper === 'valid' && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                        {status.serper === 'invalid' && <AlertCircle className="h-3 w-3 text-red-500" />}
                    </span>
                    <a href="https://serper.dev/" target="_blank" rel="noopener" className="text-brand-400 hover:underline flex items-center gap-1">
                      Get Key <ExternalLink className="h-2 w-2" />
                    </a>
                  </label>
                  <input
                    id="serperKey"
                    name="serperKey"
                    type="password"
                    value={serperVal}
                    onChange={(e) => setSerperVal(e.target.value)}
                    placeholder="Enter Serper key..."
                    className={`w-full rounded-lg border px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none transition-all ${
                      isSerperMismatched ? 'border-red-500 bg-red-500/5' : 'border-surface-700 bg-surface-950 focus:border-brand-500'
                    }`}
                  />
                  {isSerperMismatched && (
                    <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      This looks like an OpenRouter key, not a Serper key.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="firecrawlKey" className="text-[11px] font-medium text-surface-400 flex items-center justify-between">
                    Firecrawl API Key (Scrape - Optional)
                    <a href="https://firecrawl.dev/" target="_blank" rel="noopener" className="text-brand-400 hover:underline flex items-center gap-1">
                      Get Key <ExternalLink className="h-2 w-2" />
                    </a>
                  </label>
                  <input
                    id="firecrawlKey"
                    name="firecrawlKey"
                    type="password"
                    value={firecrawlVal}
                    onChange={(e) => setFirecrawlVal(e.target.value)}
                    placeholder="fc-..."
                    className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-surface-800 bg-surface-950/50 p-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                AI Generation & Audio
              </label>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="openAIKey" className="text-[11px] font-medium text-surface-400 flex items-center justify-between">
                    OpenAI API Key (TTS)
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-brand-400 hover:underline flex items-center gap-1">
                      Get Key <ExternalLink className="h-2 w-2" />
                    </a>
                  </label>
                  <input
                    id="openAIKey"
                    name="openAIKey"
                    type="password"
                    value={openAIVal}
                    onChange={(e) => setOpenAIVal(e.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="openRouterKey" className="text-[11px] font-medium text-surface-400 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        OpenRouter API Key (Script)
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
                    className={`w-full rounded-lg border px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none transition-all ${
                      isORMismatched ? 'border-red-500 bg-red-500/5' : 'border-surface-700 bg-surface-950 focus:border-brand-500'
                    }`}
                  />
                  {isORMismatched && (
                    <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      OpenRouter keys typically start with 'sk-or-v1-'.
                    </div>
                  )}
                </div>
              </div>
            </div>


            <div className="space-y-3 rounded-xl border border-surface-800 bg-surface-950/50 p-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                Sourcing Strategy
              </label>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <label className="relative flex cursor-pointer items-center justify-center rounded-lg border border-surface-700 bg-surface-950 py-2.5 text-surface-400 hover:bg-surface-800 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:checked]:text-white transition-all">
                  <input type="radio" name="sourceType" value="stock" checked={sourceTypeVal === 'stock'} onChange={() => setSourceTypeVal('stock')} className="sr-only" />
                  Stock (Pexels)
                </label>
                <label className="relative flex cursor-pointer items-center justify-center rounded-lg border border-surface-700 bg-surface-950 py-2.5 text-surface-400 hover:bg-surface-800 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:checked]:text-white transition-all">
                  <input type="radio" name="sourceType" value="raw" checked={sourceTypeVal === 'raw'} onChange={() => setSourceTypeVal('raw')} className="sr-only" />
                  Raw (Google)
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-surface-800 bg-surface-950/30 px-6 py-4">
            <button
              type="button"
              onClick={verifyAll}
              className="flex items-center gap-2 rounded-xl border border-surface-700 px-4 py-2 text-xs font-semibold text-surface-400 hover:bg-surface-800 hover:text-white transition-colors"
            >
              Test AI Connections
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-surface-400 hover:bg-surface-800 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSerperMismatched}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-2 text-xs font-bold text-white shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
