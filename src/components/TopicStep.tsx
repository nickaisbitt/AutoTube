import { useCallback, useEffect, useState } from 'react';
import { 
  Lightbulb, Zap, TrendingUp, Globe, Shield, Cpu,
  DollarSign, Leaf, Rocket, ChevronRight, Sparkles,
  RefreshCw, Loader2, KeyRound,
} from 'lucide-react';
import type { TopicConfig } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

interface TopicStepProps {
  config: TopicConfig;
  onConfigChange: (config: TopicConfig) => void;
  onGenerate: (config: TopicConfig) => void;
  onGenerateFull?: (config: TopicConfig) => void;
  apiKey?: string;
}

interface SuggestedTopic {
  label: string;
  category: string;
}

const CATEGORY_ICONS: Record<string, typeof TrendingUp> = {
  Finance: DollarSign,
  Technology: Cpu,
  Science: Rocket,
  Environment: Leaf,
  Geopolitics: Globe,
  Security: Shield,
  Economics: TrendingUp,
  Social: Leaf,
  Health: Sparkles,
  Culture: Lightbulb,
};

function getIconForCategory(category: string) {
  return CATEGORY_ICONS[category] || Lightbulb;
}

async function generateTopicIdeas(apiKey: string): Promise<SuggestedTopic[]> {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video',
        'X-Title': 'AutoTube AI Generator',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: `You generate viral YouTube video topic ideas. Return a JSON array of exactly 8 objects with "label" (the topic title, punchy and clickable, 6-12 words) and "category" (one of: Finance, Technology, Science, Environment, Geopolitics, Security, Economics, Social, Health, Culture). No markdown, just the JSON array.`,
          },
          {
            role: 'user',
            content: `Today is ${today}. Generate 8 fresh, trending video topic ideas that would perform well on YouTube right now. Mix categories. Focus on topics that are timely, surprising, or have a strong narrative angle. Avoid generic evergreen topics — make them feel current and specific.`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    },
    { timeoutMs: 15_000, maxRetries: 1 },
  );

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response');

  const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
  let parsed = JSON.parse(cleaned);

  // Handle { "topics": [...] } wrapper or bare array
  if (!Array.isArray(parsed)) {
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
    parsed = key ? parsed[key] : [];
  }

  return (parsed as Array<{ label?: string; category?: string }>)
    .filter(t => t && typeof t.label === 'string' && t.label.trim())
    .map(t => ({
      label: t.label!.trim(),
      category: typeof t.category === 'string' ? t.category.trim() : 'Technology',
    }))
    .slice(0, 8);
}

const TONES: { key: TopicConfig['tone']; label: string; emoji: string }[] = [
  { key: 'informative', label: 'Informative', emoji: '📊' },
  { key: 'dramatic', label: 'Dramatic', emoji: '🎭' },
  { key: 'casual', label: 'Casual', emoji: '💬' },
  { key: 'urgent', label: 'Urgent', emoji: '🚨' },
];

export default function TopicStep({ config, onConfigChange, onGenerate, onGenerateFull, apiKey }: TopicStepProps) {
  const [, setIsHovering] = useState<number | null>(null);
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    if (!apiKey) return;
    setIsLoadingTopics(true);
    setTopicError(null);
    try {
      const topics = await generateTopicIdeas(apiKey);
      setSuggestedTopics(topics);
    } catch (err) {
      console.error('Failed to generate topic ideas:', err);
      setTopicError('Failed to generate ideas. Try again.');
    } finally {
      setIsLoadingTopics(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && suggestedTopics.length === 0) {
      void fetchTopics();
    }
  }, [apiKey, fetchTopics, suggestedTopics.length]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-brand-400 mb-2">
          <Lightbulb className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Step 1</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Choose Your Video Topic</h2>
        <p className="mt-1 text-sm text-surface-400">
          Enter a topic or pick from AI-generated trending ideas.
        </p>
      </div>

      {/* Topic Input */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-surface-300">Topic / Title</label>
        <div className="relative">
          <input
            type="text"
            value={config.topic}
            onChange={(e) => onConfigChange({ ...config, topic: e.target.value })}
            placeholder="e.g., 'Why Countries Are Banning TikTok'"
            className="w-full border-2 border-surface-700 bg-surface-900 px-4 py-3.5 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            data-testid="topic-input"
          />
          <Sparkles className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
        </div>
      </div>

      {/* AI-Generated Topic Suggestions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-surface-300">
            {apiKey ? 'AI-Generated Trending Topics' : 'Trending Topics'}
          </label>
          {apiKey && (
            <button
              onClick={fetchTopics}
              disabled={isLoadingTopics}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium text-surface-400 hover:bg-brand-500 hover:text-black disabled:opacity-50"
              aria-label="Refresh topic ideas"
            >
              {isLoadingTopics ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {isLoadingTopics ? 'Generating...' : 'Refresh'}
            </button>
          )}
        </div>

        {!apiKey ? (
          <div className="flex items-center gap-3 border-2 border-surface-700 bg-surface-900 px-4 py-4">
            <KeyRound className="h-5 w-5 flex-shrink-0 text-surface-500" />
            <p className="text-sm font-mono text-surface-400">
              Add an OpenRouter API key in Settings to get AI-generated topic ideas, or type your own topic above.
            </p>
          </div>
        ) : isLoadingTopics && suggestedTopics.length === 0 ? (
          <div className="flex items-center justify-center gap-2 border-2 border-surface-700 bg-surface-900 px-4 py-8">
            <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
            <span className="text-sm font-mono text-surface-400">Generating fresh topic ideas...</span>
          </div>
        ) : topicError && suggestedTopics.length === 0 ? (
          <div className="flex items-center justify-center gap-2 border-2 border-red-500 bg-surface-900 px-4 py-4">
            <span className="text-sm font-mono text-red-400">{topicError}</span>
            <button
              onClick={fetchTopics}
              className="bg-red-500 px-3 py-1 text-xs font-bold font-mono uppercase text-black hover:bg-red-400"
            >
              Retry
            </button>
          </div>
        ) : suggestedTopics.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {suggestedTopics.map((topic, i) => {
              const Icon = getIconForCategory(topic.category);
              return (
                <button
                  key={i}
                  onClick={() => onConfigChange({ ...config, topic: topic.label })}
                  onMouseEnter={() => setIsHovering(i)}
                  onMouseLeave={() => setIsHovering(null)}
                  className={`flex items-center gap-3 border-2 px-3.5 py-2.5 text-left text-sm ${
                    config.topic === topic.label
                      ? 'border-brand-500 bg-brand-500 text-black'
                      : 'border-surface-700 bg-surface-900 text-surface-300 hover:bg-brand-500 hover:text-black'
                  }`}
                  data-testid={`suggested-topic-${i}`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${
                    config.topic === topic.label ? 'text-black' : 'text-surface-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13px] font-medium">{topic.label}</div>
                    <div className="text-[10px] text-surface-500">{topic.category}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Settings Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Duration */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-surface-300">Duration</label>
          <select
            value={config.targetDuration}
            onChange={(e) => onConfigChange({ ...config, targetDuration: Number(e.target.value) })}
            className="w-full border-2 border-surface-700 bg-surface-900 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
            data-testid="duration-select"
            aria-label="Duration"
          >
            <option value={3}>3 minutes</option>
            <option value={5}>5 minutes</option>
            <option value={8}>8 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </div>

        {/* Tone */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-surface-300">Tone</label>
          <div className="grid grid-cols-2 gap-1.5">
            {TONES.map((tone) => (
              <button
                key={tone.key}
                onClick={() => onConfigChange({ ...config, tone: tone.key })}
                className={`border-2 px-2 py-1.5 text-[11px] font-mono font-bold uppercase ${
                  config.tone === tone.key
                    ? 'border-brand-500 bg-brand-500 text-black'
                    : 'border-surface-700 bg-surface-900 text-surface-400 hover:bg-brand-500 hover:text-black'
                }`}
                data-testid={`tone-${tone.key}`}
              >
                {tone.emoji} {tone.label}
              </button>
            ))}
          </div>
        </div>

        {/* Audience */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-surface-300">Target Audience</label>
          <input
            type="text"
            value={config.audience}
            onChange={(e) => onConfigChange({ ...config, audience: e.target.value })}
            className="w-full border-2 border-surface-700 bg-surface-900 px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            placeholder="e.g., Tech enthusiasts, 18-35"
            data-testid="audience-input"
          />
        </div>
      </div>

      {/* Generate Buttons */}
      <div className="pt-2 space-y-3">
        {onGenerateFull && (
          <button
            onClick={() => config.topic.trim() && onGenerateFull(config)}
            disabled={!config.topic.trim()}
            className={`group flex w-full items-center justify-center gap-2 px-6 py-4 text-sm font-bold uppercase tracking-wider ${
              config.topic.trim()
                ? 'bg-brand-500 text-black shadow-hard hover:bg-brand-400'
                : 'cursor-not-allowed bg-surface-800 text-surface-500'
            }`}
            data-testid="generate-full-video"
          >
            <Zap className="h-4 w-4" />
            Generate Full Video (One-Click)
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => config.topic.trim() && onGenerate(config)}
          disabled={!config.topic.trim()}
          className={`group flex w-full items-center justify-center gap-2 px-6 py-4 text-sm font-bold uppercase tracking-wider ${
            config.topic.trim()
              ? 'bg-brand-500 text-black shadow-hard hover:bg-brand-400'
              : 'cursor-not-allowed bg-surface-800 text-surface-500'
          }`}
          data-testid="generate-script-only"
        >
          <Sparkles className="h-4 w-4" />
          Generate Script Only
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
