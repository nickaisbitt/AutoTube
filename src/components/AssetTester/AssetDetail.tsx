import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MediaCandidate } from '../../services/media';
import type { VisionCheckResult } from '../../services/visionCheck';
import type { CropMetadata } from '../../services/focalCropper';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AssetDetailProps {
  candidate: MediaCandidate;
  isExpanded: boolean;
  onToggle: () => void;
  vision?: VisionCheckResult;
  crop?: CropMetadata;
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
 * Renders the detail/expanded view for a single asset candidate.
 * Shows score breakdown, vision results, quality factors, resolver info, and crop data.
 */
export default function AssetDetail({ candidate: c, isExpanded, onToggle, vision, crop }: AssetDetailProps) {
  return (
    <div className="p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-brand-400 truncate max-w-[50%]">{c.source}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${qualityColor(computeQualityPct(c))}`}>{computeQualityPct(c)}%</span>
          <span className="text-[10px] text-surface-500">{c.finalScore}pts</span>
        </div>
      </div>
      <div className="text-[9px] text-surface-500">
        {c.width && c.height ? `${c.width}x${c.height}` : 'N/A'} &middot; {c.type}
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[9px] text-surface-500 hover:text-brand-400"
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details
      </button>

      {isExpanded && (
        <div className="space-y-2 border-t border-surface-700 pt-2 text-[9px] text-surface-400">
          {/* Score breakdown */}
          <div>
            <span className="font-semibold text-surface-300">Score:</span> base={c.baseScore}, final={c.finalScore}
          </div>

          {/* Vision */}
          {vision && (
            <div>
              <span className="font-semibold text-surface-300">Vision:</span>{' '}
              <span className={vision.pass ? 'text-emerald-400' : 'text-red-400'}>
                {vision.pass ? 'PASS' : 'FAIL'}
              </span>
              {vision.issues.length > 0 && (
                <div className="ml-2">Issues: {vision.issues.join(', ')}</div>
              )}
              {vision.qualitySignals.length > 0 && (
                <div className="ml-2">Signals: {vision.qualitySignals.join(', ')}</div>
              )}
              <div className="ml-2">Quality: {vision.qualityScore}/10</div>
            </div>
          )}

          {/* Quality factors */}
          {c.qualityFactors && (
            <div>
              <span className="font-semibold text-surface-300">Quality:</span>
              <div className="ml-2">
                S:{c.qualityFactors.sharpness} L:{c.qualityFactors.lighting} C:{c.qualityFactors.composition} V:{c.qualityFactors.vibrancy} R:{c.qualityFactors.relevance}
              </div>
              {c.qualityCompositeScore !== undefined && (
                <div className="ml-2">Composite: {c.qualityCompositeScore.toFixed(1)}/200</div>
              )}
            </div>
          )}

          {/* Resolver */}
          {c.resolvedUrl && c.resolvedUrl !== c.url && (
            <div>
              <span className="font-semibold text-surface-300">Resolved:</span>
              <div className="ml-2 text-emerald-400 truncate">{c.resolvedUrl}</div>
              {c.resolvedWidth && c.resolvedHeight && (
                <div className="ml-2">{c.resolvedWidth}x{c.resolvedHeight}</div>
              )}
            </div>
          )}

          {/* Crop */}
          {crop && (
            <div>
              <span className="font-semibold text-surface-300">Crop:</span>{' '}
              {crop.x},{crop.y} {crop.width}x{crop.height}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
