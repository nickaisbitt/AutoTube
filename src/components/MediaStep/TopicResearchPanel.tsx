import { Brain } from 'lucide-react';
import type { VideoProject } from '../../types';

interface TopicResearchPanelProps {
  ctx: NonNullable<VideoProject['topicContext']>;
}

export default function TopicResearchPanel({ ctx }: TopicResearchPanelProps) {
  return (
    <div className="border-2 border-sky-500 bg-surface-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Brain className="h-4 w-4 text-sky-400" />
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-300">
          Topic research
        </span>
        {ctx.kind && (
          <span className="border-2 border-sky-500 bg-sky-500 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-black">
            {ctx.kind}
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm text-white">
        <div>
          <span className="text-surface-400">You entered:</span>{' '}
          <span className="font-semibold">&quot;{ctx.topic}&quot;</span>
        </div>
        <div>
          <span className="text-surface-400">Parsed subject:</span>{' '}
          <span className="border-2 border-sky-500 bg-sky-500 px-2 py-0.5 font-bold text-black">
            {ctx.coreSubject}
          </span>
          {ctx.coreSubject.toLowerCase() !== ctx.topic.toLowerCase() && (
            <span className="ml-2 text-[11px] text-surface-500">
              (stripped clickbait wrapper to find the core entity)
            </span>
          )}
        </div>
        <div>
          {ctx.resolvedTitle ? (
            <>
              <span className="text-surface-400">Wikipedia match:</span>{' '}
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(ctx.resolvedTitle)}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
              >
                ✓ {ctx.resolvedTitle}
              </a>
            </>
          ) : (
            <>
              <span className="text-surface-400">Wikipedia match:</span>{' '}
              <span className="text-amber-300">
                ✗ none found — using parsed subject as the research target
              </span>
            </>
          )}
        </div>
      </div>

      {ctx.description && (
        <p className="mt-2 text-xs text-surface-400">{ctx.description}</p>
      )}

      {ctx.subjectCandidates && ctx.subjectCandidates.length > 1 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-surface-400 hover:text-surface-300">
            Show parser candidates ({ctx.subjectCandidates.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ctx.subjectCandidates.map((c, i) => (
              <span
                key={`${c}-${i}`}
                className={`border-2 px-2 py-0.5 text-[11px] font-mono ${
                  c === ctx.coreSubject || c === ctx.resolvedTitle
                    ? 'border-emerald-500 bg-emerald-500 text-black'
                    : 'border-surface-700 bg-surface-900 text-surface-400'
                }`}
              >
                {i + 1}. {c}
              </span>
            ))}
          </div>
        </details>
      )}

      {ctx.entities.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-surface-500">
            Related entities
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ctx.entities.slice(0, 10).map((e) => (
              <span
                key={e}
                className="border-2 border-sky-500 bg-surface-900 px-2 py-0.5 text-[11px] font-mono text-sky-200"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
