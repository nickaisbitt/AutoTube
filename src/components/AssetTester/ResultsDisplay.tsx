import { Search } from 'lucide-react';
import type { MediaCandidate } from '../../services/media';
import type { VisionCheckResult } from '../../services/visionCheck';
import type { CropMetadata } from '../../services/focalCropper';
import AssetList from './AssetList';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'grid' | 'list';
type VisionMap = Map<string, VisionCheckResult>;
type CropMap = Map<string, CropMetadata>;
type RunStatus = 'idle' | 'running' | 'complete' | 'error';

interface StageTimingEntry {
  stage: string;
  durationMs: number | null;
}

interface RejectedCandidate {
  candidate: MediaCandidate;
  reason: 'domain-filter' | 'vision-check';
  pattern?: string;
  category?: string;
  issues?: string[];
}

interface TestRunResult {
  query: string;
  accepted: MediaCandidate[];
  rejected: RejectedCandidate[];
  timing: StageTimingEntry[];
  totalTimeMs: number;
  timestamp: string;
}

export interface ResultsDisplayProps {
  result: TestRunResult | null;
  runStatus: RunStatus;
  displayCandidates: MediaCandidate[];
  viewMode: ViewMode;
  expandedCards: Set<string>;
  onToggleCard: (url: string) => void;
  visionResults: VisionMap;
  cropResults: CropMap;
  // Clipboard fallback
  copyStatus: 'idle' | 'copied' | 'fallback';
  fallbackJson: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the test results: summary header, accepted candidates list,
 * rejected candidates, timing panel, clipboard fallback, and empty state.
 */
export default function ResultsDisplay({
  result,
  runStatus,
  displayCandidates,
  viewMode,
  expandedCards,
  onToggleCard,
  visionResults,
  cropResults,
  copyStatus,
  fallbackJson,
}: ResultsDisplayProps) {
  // Empty state
  if (!result && runStatus === 'idle') {
    return (
      <div className="flex h-full items-center justify-center text-surface-600">
        <div className="text-center">
          <Search className="mx-auto mb-3 h-8 w-8 opacity-20" />
          <p className="text-xs">Enter a query and click Test Harvest to run the pipeline</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Summary header */}
      <div className="flex items-center justify-between border-2 border-surface-700 bg-surface-900 px-4 py-3" data-testid="asset-tester-summary">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-emerald-400 font-semibold">{result.accepted.length} accepted</span>
          <span className="text-red-400 font-semibold">{result.rejected.length} rejected</span>
        </div>
        <span className="text-[10px] text-surface-500">
          {result.totalTimeMs.toFixed(0)}ms total
        </span>
      </div>

      {/* Clipboard fallback */}
      {copyStatus === 'fallback' && fallbackJson && (
        <div data-testid="asset-tester-fallback-textarea">
          <textarea
            readOnly
            value={fallbackJson}
            className="w-full h-48 border-2 border-surface-700 bg-surface-800 p-3 text-[10px] text-surface-300 font-mono focus:outline-none"
          />
        </div>
      )}

      {/* Accepted candidates */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-surface-400">
          Accepted ({displayCandidates.length})
        </h3>
        <AssetList
          candidates={displayCandidates}
          viewMode={viewMode}
          expandedCards={expandedCards}
          onToggleCard={onToggleCard}
          visionResults={visionResults}
          cropResults={cropResults}
        />
      </div>

      {/* Rejected candidates */}
      {result.rejected.length > 0 && (
        <div data-testid="asset-tester-rejected">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-red-400">
            Rejected ({result.rejected.length})
          </h3>
          <div className="flex gap-3 mb-3 text-[10px] text-surface-500">
            <span>
              Domain Filter: {result.rejected.filter((r) => r.reason === 'domain-filter').length}
            </span>
            <span>
              Vision Check: {result.rejected.filter((r) => r.reason === 'vision-check').length}
            </span>
          </div>
          <div className="space-y-2">
            {result.rejected.map((r, i) => (
              <div
                key={r.candidate.url + i}
                className="flex items-start gap-3 border-2 border-red-900 bg-surface-900 p-3"
                data-testid="asset-tester-rejected-item"
              >
                <div className="h-10 w-16 shrink-0 bg-surface-800 overflow-hidden">
                  {r.candidate.type === 'image' && (
                    <img
                      src={r.candidate.thumbnailUrl || r.candidate.url}
                      alt=""
                      className="h-full w-full object-cover opacity-50"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-surface-400 truncate">{r.candidate.source}</span>
                    <span className="text-surface-600">base={r.candidate.baseScore}</span>
                  </div>
                  <div className="mt-1">
                    {r.reason === 'domain-filter' ? (
                      <span className="text-red-400">
                        Domain blocked: <span className="text-red-300">{r.category}</span> (pattern: {r.pattern})
                      </span>
                    ) : (
                      <span className="text-red-400">
                        Vision failed: {r.issues?.join(', ') || 'Unknown issues'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timing panel */}
      <div data-testid="asset-tester-timing">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-surface-400">
          Pipeline Timing
        </h3>
        <div className="border-2 border-surface-700 bg-surface-900">
          {result.timing.map((t, i) => (
            <div
              key={t.stage + i}
              className="flex items-center justify-between border-b border-surface-800 px-4 py-2 text-[11px] last:border-b-0"
            >
              <span className="text-surface-400">{t.stage}</span>
              <span className={t.durationMs !== null ? 'text-white font-semibold' : 'text-surface-600 italic'}>
                {t.durationMs !== null ? `${t.durationMs.toFixed(0)}ms` : 'Skipped'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t-2 border-surface-700 px-4 py-2 text-[11px]">
            <span className="font-semibold text-brand-400">Total</span>
            <span className="font-bold text-brand-400">{result.totalTimeMs.toFixed(0)}ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}
