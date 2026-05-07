import { useMemo } from 'react';
import { AlertCircle, Clock, Film, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { VideoProject } from '../types';
import { buildStoryboard, formatStoryboardTimecode } from '../services/storyboard';

interface StoryboardViewProps {
  project: VideoProject;
}

const QUALITY_STYLES: Record<'strong' | 'okay' | 'weak', string> = {
  strong: 'border-2 border-emerald-500 bg-surface-800 text-emerald-300',
  okay: 'border-2 border-amber-500 bg-surface-800 text-amber-300',
  weak: 'border-2 border-rose-500 bg-surface-800 text-rose-300',
};

const SEGMENT_BADGES: Record<VideoProject['script'][number]['type'], string> = {
  intro: 'bg-surface-800 text-fuchsia-300 border-2 border-fuchsia-500',
  section: 'bg-surface-800 text-sky-300 border-2 border-sky-500',
  transition: 'bg-surface-800 text-amber-300 border-2 border-amber-500',
  outro: 'bg-surface-800 text-emerald-300 border-2 border-emerald-500',
};

function SummaryPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-surface-700 bg-surface-800 px-3 py-2 text-center">
      <div className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-white">{value}</div>
    </div>
  );
}

export default function StoryboardView({ project }: StoryboardViewProps) {
  const storyboard = useMemo(() => buildStoryboard(project), [project]);
  const summary = storyboard.totals;

  return (
    <div className="space-y-6 bg-surface-950 p-4 sm:p-5" data-testid="storyboard-view">
      <div className="border-2 border-brand-500 bg-surface-900 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-brand-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Storyboard mode</span>
            </div>
            <h3 className="mt-2 text-2xl font-bold text-white">One card per second, so you can scan the cut fast.</h3>
            <p className="mt-2 text-sm leading-relaxed text-surface-300">
              This view breaks the video into second-by-second frames, making it much easier to spot pacing issues,
              weak shots, fallback visuals, and stretches that need more motion before you render the final cut.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
            <SummaryPill label="Frames" value={summary.totalFrames} />
            <SummaryPill label="Strong" value={summary.strongFrames} />
            <SummaryPill label="Weak" value={summary.weakFrames} />
            <SummaryPill label="Fallback" value={summary.fallbackFrames} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="border-2 border-surface-700 bg-surface-800 px-3 py-2">
            <div className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">Average score</div>
            <div className="mt-0.5 text-sm font-bold text-white">{summary.averageScore}/100</div>
          </div>
          <div className="border-2 border-surface-700 bg-surface-800 px-3 py-2">
            <div className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">Video frames</div>
            <div className="mt-0.5 text-sm font-bold text-white">{summary.videoFrames}</div>
          </div>
          <div className="border-2 border-surface-700 bg-surface-800 px-3 py-2">
            <div className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">Image frames</div>
            <div className="mt-0.5 text-sm font-bold text-white">{summary.imageFrames}</div>
          </div>
          <div className="border-2 border-surface-700 bg-surface-800 px-3 py-2">
            <div className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">Segments</div>
            <div className="mt-0.5 text-sm font-bold text-white">{summary.segmentCount}</div>
          </div>
        </div>

        <div className="mt-4 border-2 border-surface-700 bg-surface-800 p-3 text-sm text-surface-300">
          <div className="flex items-center gap-2 text-surface-100">
            <Clock className="h-4 w-4 text-brand-300" />
            <span className="font-semibold">How to read it:</span>
          </div>
          <p className="mt-2 leading-relaxed text-surface-400">
            Each card is one second. Green frames are strong, amber frames are okay, and red frames need attention.
            Look for segments with too many fallback shots or too little visual variety.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {storyboard.blocks.map((block, index) => (
          <section
            key={block.segment.id}
            className="border-2 border-surface-700 bg-surface-900 p-4"
            data-testid={`storyboard-segment-${block.segment.id}`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-surface-800 px-2 py-0.5 text-[10px] font-bold font-mono text-surface-300">
                    {index + 1}
                  </span>
                  <span className={`border px-2 py-0.5 text-[10px] font-semibold font-mono uppercase tracking-wider ${SEGMENT_BADGES[block.segment.type]}`}>
                    {block.segment.type}
                  </span>
                  <span className="border-2 border-surface-700 bg-surface-800 px-2 py-0.5 text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-400">
                    {block.summary.averageScore}/100 avg
                  </span>
                </div>
                <h4 className="mt-2 text-lg font-semibold text-white">{block.segment.title}</h4>
                <p className="mt-1 text-sm text-surface-400">
                  {block.summary.frameCount} seconds • {block.summary.distinctVisuals} distinct visuals •
                  {block.summary.fallbackFrames > 0 ? ` ${block.summary.fallbackFrames} fallback frames` : ' no fallback frames'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="border-2 border-emerald-500 bg-surface-800 px-2.5 py-1 font-semibold font-mono text-emerald-300">
                  Strong {block.summary.strongFrames}
                </span>
                <span className="border-2 border-amber-500 bg-surface-800 px-2.5 py-1 font-semibold font-mono text-amber-300">
                  Okay {block.summary.okayFrames}
                </span>
                <span className="border-2 border-rose-500 bg-surface-800 px-2.5 py-1 font-semibold font-mono text-rose-300">
                  Weak {block.summary.weakFrames}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-flow-col auto-cols-[170px] gap-3 overflow-x-auto pb-2">
              {block.frames.map((frame) => {
                const assetSrc = frame.asset?.thumbnailUrl || frame.asset?.url;
                const borderClass = QUALITY_STYLES[frame.qualityLabel];

                return (
                  <article
                    key={frame.id}
                    className={`overflow-hidden border ${borderClass}`}
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-surface-800">
                      {assetSrc ? (
                        <img
                          src={assetSrc}
                          alt={frame.asset?.alt || frame.segmentTitle}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-surface-800 px-4 text-center">
                          <div>
                            <div className="mx-auto flex h-12 w-12 items-center justify-center bg-surface-700 text-surface-300">
                              <Film className="h-6 w-6" />
                            </div>
                            <p className="mt-3 text-sm font-semibold text-white">No visual assigned</p>
                            <p className="mt-1 text-xs text-surface-400">{frame.visualCue}</p>
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-black/70" />

                      <div className="absolute left-2 top-2 flex items-center gap-2">
                        <span className="bg-black px-2 py-0.5 text-[10px] font-bold font-mono text-white">
                          {frame.timecode}
                        </span>
                        {frame.asset?.type && (
                          <span className="bg-black px-2 py-0.5 text-[10px] font-semibold font-mono text-white">
                            {frame.asset.type === 'video' ? 'Clip' : 'Still'}
                          </span>
                        )}
                      </div>

                      <div className="absolute right-2 top-2">
                        <span className={`border px-2 py-0.5 text-[10px] font-bold font-mono uppercase tracking-wider ${borderClass}`}>
                          {frame.qualityLabel}
                        </span>
                      </div>

                      <div className="absolute bottom-2 left-2 right-2 space-y-1">
                        <p className="line-clamp-2 text-[12px] leading-tight font-semibold text-white">
                          {frame.narrationSnippet}
                        </p>
                        <p className="line-clamp-2 text-[11px] text-white/75">
                          {frame.visualCue}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 bg-surface-900 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">
                          Score {frame.qualityScore}/100
                        </span>
                        <span className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">
                          {frame.shotLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {frame.asset?.isFallback && (
                          <span className="border-2 border-amber-500 bg-surface-800 px-2 py-0.5 text-[10px] font-semibold font-mono text-amber-300">
                            Fallback
                          </span>
                        )}
                        {frame.asset?.concept && (
                          <span className="border-2 border-brand-500 bg-surface-800 px-2 py-0.5 text-[10px] font-semibold font-mono text-brand-300">
                            {frame.asset.concept}
                          </span>
                        )}
                        {frame.beat !== 'unknown' && (
                          <span className="border-2 border-surface-700 bg-surface-800 px-2 py-0.5 text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-300">
                            {frame.beat}
                          </span>
                        )}
                      </div>

                      {frame.notes.length > 0 && (
                        <p className="text-[11px] leading-relaxed text-surface-500">
                          {frame.notes.slice(0, 3).join(' • ')}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="border-2 border-surface-700 bg-surface-900 p-4">
        <div className="flex items-center gap-2 text-surface-100">
          <AlertCircle className="h-4 w-4 text-rose-300" />
          <h4 className="font-semibold uppercase tracking-wider">Weakest seconds to review</h4>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {storyboard.weakestFrames.map((frame) => (
            <div key={frame.id} className="border-2 border-surface-700 bg-surface-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-500">
                  {frame.timecode} • {frame.segmentTitle}
                </span>
                <span className="border-2 border-rose-500 bg-surface-800 px-2 py-0.5 text-[10px] font-bold font-mono uppercase text-rose-300">
                  {frame.qualityScore}/100
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-white line-clamp-2">{frame.narrationSnippet}</p>
              <p className="mt-1 text-xs text-surface-400 line-clamp-2">{frame.visualCue}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {frame.asset?.isFallback && (
                  <span className="border-2 border-amber-500 bg-surface-800 px-2 py-0.5 text-[10px] font-semibold font-mono text-amber-300">
                    fallback
                  </span>
                )}
                {frame.asset?.type && (
                  <span className="border-2 border-surface-700 bg-surface-800 px-2 py-0.5 text-[10px] font-semibold font-mono uppercase tracking-wider text-surface-300">
                    {frame.asset.type}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-2 border-surface-700 bg-surface-900 p-4">
        <div className="flex items-center gap-2 text-surface-100">
          <ImageIcon className="h-4 w-4 text-brand-300" />
          <h4 className="font-semibold uppercase tracking-wider">Best use case</h4>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-surface-400">
          Use this board to spot long stretches with a single shot, too many fallback images, or transitions that need
          a stronger visual interrupt. It is the fastest way to judge whether the video feels punchy before you spend
          time on a full render.
        </p>
      </div>
    </div>
  );
}
