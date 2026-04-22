import { useState } from 'react';
import { 
  Lightbulb, Zap, TrendingUp, Globe, Shield, Cpu,
  DollarSign, Leaf, Rocket, ChevronRight, Sparkles
} from 'lucide-react';
import type { TopicConfig, VideoProject } from '../types';

interface TopicStepProps {
  config: TopicConfig;
  onConfigChange: (config: TopicConfig) => void;
  onGenerate: (config: TopicConfig) => void;
}

const SUGGESTED_TOPICS = [
  { icon: TrendingUp, label: 'How BlackRock Controls $10 Trillion', category: 'Finance' },
  { icon: Globe, label: 'The Water Crisis No One Talks About', category: 'Environment' },
  { icon: Shield, label: 'Inside the World\'s Most Secure Vault', category: 'Security' },
  { icon: Cpu, label: 'AI is Replacing These Jobs First', category: 'Technology' },
  { icon: DollarSign, label: 'Why the Dollar is Losing Its Power', category: 'Economics' },
  { icon: Leaf, label: 'The Hidden Cost of Fast Fashion', category: 'Social' },
  { icon: Rocket, label: 'SpaceX vs NASA: The Real Competition', category: 'Science' },
  { icon: Zap, label: 'The Global Energy War Explained', category: 'Geopolitics' },
];

const STYLES: { key: VideoProject['style']; label: string; description: string; color: string }[] = [
  { key: 'business_insider', label: 'Business Insider', description: 'Data-driven, professional analysis', color: 'from-blue-500 to-cyan-500' },
  { key: 'warfront', label: 'WARFRONT', description: 'Dramatic, high-stakes narratives', color: 'from-red-500 to-orange-500' },
  { key: 'documentary', label: 'Documentary', description: 'Deep-dive investigative format', color: 'from-amber-500 to-yellow-500' },
  { key: 'explainer', label: 'Explainer', description: 'Simple, clear breakdowns', color: 'from-emerald-500 to-teal-500' },
];

const TONES: { key: TopicConfig['tone']; label: string; emoji: string }[] = [
  { key: 'informative', label: 'Informative', emoji: '📊' },
  { key: 'dramatic', label: 'Dramatic', emoji: '🎭' },
  { key: 'casual', label: 'Casual', emoji: '💬' },
  { key: 'urgent', label: 'Urgent', emoji: '🚨' },
];

export default function TopicStep({ config, onConfigChange, onGenerate }: TopicStepProps) {
  const [isHovering, setIsHovering] = useState<number | null>(null);

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
          Select a trending topic or enter your own. Our AI will create a complete video production pipeline.
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
            className="w-full rounded-xl border border-surface-700 bg-surface-900/80 px-4 py-3.5 text-sm text-white placeholder-surface-500 ring-1 ring-transparent transition-all focus:border-brand-500 focus:outline-none focus:ring-brand-500/30"
          />
          <Sparkles className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
        </div>
      </div>

      {/* Suggested Topics */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-surface-300">Trending Topics</label>
        <div className="grid grid-cols-2 gap-2">
          {SUGGESTED_TOPICS.map((topic, i) => (
            <button
              key={i}
              onClick={() => onConfigChange({ ...config, topic: topic.label })}
              onMouseEnter={() => setIsHovering(i)}
              onMouseLeave={() => setIsHovering(null)}
              className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all ${
                config.topic === topic.label
                  ? 'border-brand-500/50 bg-brand-500/10 text-white'
                  : 'border-surface-700/50 bg-surface-900/50 text-surface-300 hover:border-surface-600 hover:bg-surface-800/60 hover:text-white'
              }`}
            >
              <topic.icon className={`h-4 w-4 flex-shrink-0 ${
                config.topic === topic.label ? 'text-brand-400' : isHovering === i ? 'text-surface-300' : 'text-surface-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-[13px] font-medium">{topic.label}</div>
                <div className="text-[10px] text-surface-500">{topic.category}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Style Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-surface-300">Video Style</label>
        <div className="grid grid-cols-2 gap-3">
          {STYLES.map((style) => (
            <button
              key={style.key}
              onClick={() => onConfigChange({ ...config, style: style.key })}
              className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
                config.style === style.key
                  ? 'border-brand-500/50 bg-surface-900 ring-1 ring-brand-500/20'
                  : 'border-surface-700/50 bg-surface-900/50 hover:border-surface-600 hover:bg-surface-800/60'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${style.color} opacity-[0.03] ${
                config.style === style.key ? 'opacity-[0.08]' : ''
              }`} />
              <div className="relative">
                <h3 className={`text-sm font-semibold ${
                  config.style === style.key ? 'text-white' : 'text-surface-300'
                }`}>
                  {style.label}
                </h3>
                <p className="mt-0.5 text-[11px] text-surface-500">{style.description}</p>
              </div>
              {config.style === style.key && (
                <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Duration */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-surface-300">Duration</label>
          <select
            value={config.targetDuration}
            onChange={(e) => onConfigChange({ ...config, targetDuration: Number(e.target.value) })}
            className="w-full rounded-lg border border-surface-700 bg-surface-900/80 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
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
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all ${
                  config.tone === tone.key
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                    : 'border-surface-700/50 bg-surface-900/50 text-surface-400 hover:border-surface-600 hover:text-surface-300'
                }`}
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
            className="w-full rounded-lg border border-surface-700 bg-surface-900/80 px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            placeholder="e.g., Tech enthusiasts, 18-35"
          />
        </div>
      </div>

      {/* Generate Button */}
      <div className="pt-2">
        <button
          onClick={() => config.topic.trim() && onGenerate(config)}
          disabled={!config.topic.trim()}
          className={`group flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all ${
            config.topic.trim()
              ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:from-brand-500 hover:to-brand-400'
              : 'cursor-not-allowed bg-surface-800 text-surface-500'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Generate Video Script
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
