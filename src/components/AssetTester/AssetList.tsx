import type { MediaCandidate } from '../../services/media';
import type { VisionCheckResult } from '../../services/visionCheck';
import type { CropMetadata } from '../../services/focalCropper';
import AssetDetail from './AssetDetail';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'grid' | 'list';
type VisionMap = Map<string, VisionCheckResult>;
type CropMap = Map<string, CropMetadata>;

export interface AssetListProps {
  candidates: MediaCandidate[];
  viewMode: ViewMode;
  expandedCards: Set<string>;
  onToggleCard: (url: string) => void;
  visionResults: VisionMap;
  cropResults: CropMap;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeQualityPct(c: MediaCandidate): number {
  if (c.qualityCompositeScore !== undefined && c.qualityCompositeScore > 0) {
    return Math.round(Math.max(0, Math.min(100, (c.qualityCompositeScore / 200) * 100)));
  }
  return 0;
}

function qualityColor(pct: number): string {
  if (pct >= 70) return 'text-emerald-400 border-emerald-500 bg-emerald-500/20';
  if (pct >= 40) return 'text-amber-400 border-amber-500 bg-amber-500/20';
  return 'text-red-400 border-red-500 bg-red-500/20';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the list of accepted asset candidates in either grid or list (table) view.
 */
export default function AssetList({
  candidates,
  viewMode,
  expandedCards,
  onToggleCard,
  visionResults,
  cropResults,
}: AssetListProps) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="asset-tester-grid">
        {candidates.map((c, i) => {
          const crop = cropResults.get(c.url);
          const vision = visionResults.get(c.url);
          return (
            <div
              key={c.url + i}
              className="border-2 border-surface-700 bg-surface-900"
              data-testid="asset-tester-card"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-surface-800 overflow-hidden">
                {c.type === 'image' ? (
                  <img
                    src={c.thumbnailUrl || c.url}
                    alt={c.alt}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-surface-500">
                    VIDEO
                  </div>
                )}
                {/* Crop overlay */}
                {crop && c.width && c.height && (
                  <div
                    className="absolute border-2 border-brand-500 pointer-events-none"
                    style={{
                      left: `${(crop.x / c.width) * 100}%`,
                      top: `${(crop.y / c.height) * 100}%`,
                      width: `${(crop.width / c.width) * 100}%`,
                      height: `${(crop.height / c.height) * 100}%`,
                    }}
                  />
                )}
                {/* Selection badge */}
                {i === 0 && (
                  <span className="absolute top-1 left-1 bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                    PRIMARY
                  </span>
                )}
                {i === 1 && (
                  <span className="absolute top-1 left-1 bg-surface-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    SECONDARY
                  </span>
                )}
                {/* Quality percentage badge */}
                {(() => {
                  const pct = computeQualityPct(c);
                  return (
                    <span className={`absolute top-1 right-1 border px-1.5 py-0.5 text-[10px] font-bold ${qualityColor(pct)}`} data-testid="asset-quality-pct">
                      {pct}%
                    </span>
                  );
                })()}
              </div>

              {/* Card detail */}
              <AssetDetail
                candidate={c}
                isExpanded={expandedCards.has(c.url)}
                onToggle={() => onToggleCard(c.url)}
                vision={vision}
                crop={crop}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // List (table) view
  return (
    <div className="overflow-x-auto" data-testid="asset-tester-list">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b-2 border-surface-700 text-left text-surface-500 uppercase">
            <th className="px-2 py-2">Thumb</th>
            <th className="px-2 py-2">Source</th>
            <th className="px-2 py-2">Dims</th>
            <th className="px-2 py-2">Base</th>
            <th className="px-2 py-2">Final</th>
            <th className="px-2 py-2">Quality</th>
            <th className="px-2 py-2">Type</th>
            <th className="px-2 py-2">Vision</th>
            <th className="px-2 py-2">Quality</th>
            <th className="px-2 py-2">Resolved</th>
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => {
            const vision = visionResults.get(c.url);
            return (
              <tr key={c.url + i} className="border-b border-surface-800 text-surface-300 hover:bg-surface-900">
                <td className="px-2 py-1.5">
                  <div className="h-8 w-12 bg-surface-800 overflow-hidden">
                    {c.type === 'image' && (
                      <img src={c.thumbnailUrl || c.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-brand-400 max-w-[120px] truncate">{c.source}</td>
                <td className="px-2 py-1.5">{c.width && c.height ? `${c.width}x${c.height}` : '—'}</td>
                <td className="px-2 py-1.5">{c.baseScore}</td>
                <td className="px-2 py-1.5 font-semibold text-white">{c.finalScore}</td>
                <td className="px-2 py-1.5">
                  <span className={`font-bold ${qualityColor(computeQualityPct(c))}`}>{computeQualityPct(c)}%</span>
                </td>
                <td className="px-2 py-1.5">{c.type}</td>
                <td className="px-2 py-1.5">
                  {vision ? (
                    <span className={vision.pass ? 'text-emerald-400' : 'text-red-400'}>
                      {vision.pass ? 'PASS' : 'FAIL'}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-2 py-1.5">
                  {c.qualityCompositeScore !== undefined ? c.qualityCompositeScore.toFixed(0) : '—'}
                </td>
                <td className="px-2 py-1.5">
                  {c.resolvedUrl && c.resolvedUrl !== c.url ? (
                    <span className="text-emerald-400">Upgraded</span>
                  ) : '—'}
                </td>
                <td className="px-2 py-1.5">
                  {i === 0 ? (
                    <span className="bg-brand-500 px-1 py-0.5 text-[8px] font-bold text-black">PRIMARY</span>
                  ) : i === 1 ? (
                    <span className="bg-surface-600 px-1 py-0.5 text-[8px] font-bold text-white">SECONDARY</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
