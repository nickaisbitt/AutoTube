import { useState, useCallback } from 'react';
import type { AppConfig } from '../../types';
import type { MediaCandidate } from '../../services/media';
import { usePipeline } from './usePipeline';
import TestRunner from './TestRunner';
import ResultsDisplay from './ResultsDisplay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'finalScore' | 'baseScore' | 'resolution' | 'source';
type ViewMode = 'grid' | 'list';

interface FilterState {
  source: string | null;
  mediaType: 'image' | 'video' | null;
}

interface AssetTesterProps {
  isOpen: boolean;
  onClose: () => void;
  appConfig: AppConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortCandidates(candidates: MediaCandidate[], key: SortKey): MediaCandidate[] {
  const sorted = [...candidates];
  switch (key) {
    case 'finalScore':
      return sorted.sort((a, b) => b.finalScore - a.finalScore);
    case 'baseScore':
      return sorted.sort((a, b) => b.baseScore - a.baseScore);
    case 'resolution':
      return sorted.sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
      );
    case 'source':
      return sorted.sort((a, b) => a.source.localeCompare(b.source));
    default:
      return sorted;
  }
}

function filterAccepted(candidates: MediaCandidate[], filter: FilterState): MediaCandidate[] {
  let result = candidates;
  if (filter.source) {
    result = result.filter((c) => c.source.includes(filter.source!));
  }
  if (filter.mediaType) {
    result = result.filter((c) => c.type === filter.mediaType);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetTester({ isOpen, onClose, appConfig }: AssetTesterProps) {
  const {
    runStatus,
    result,
    query,
    setQuery,
    currentStage,
    errorMsg,
    visionResults,
    cropResults,
    hasApiKey,
    runPipeline,
    handleCancel,
  } = usePipeline(appConfig);

  // UI state
  const [sortKey, setSortKey] = useState<SortKey>('finalScore');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterState, setFilterState] = useState<FilterState>({ source: null, mediaType: null });
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'fallback'>('idle');
  const [fallbackJson, setFallbackJson] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const handleExport = useCallback(async () => {
    if (!result) return;

    const exportData = {
      query: result.query,
      timestamp: result.timestamp,
      totalTimeMs: result.totalTimeMs,
      timing: result.timing,
      summary: {
        totalCandidates: result.accepted.length + result.rejected.length,
        acceptedCount: result.accepted.length,
        rejectedCount: result.rejected.length,
        rejectedByCategory: result.rejected.reduce<Record<string, number>>((acc, r) => {
          const key = r.reason;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      },
      accepted: result.accepted.map((c, i) => ({
        url: c.url,
        thumbnailUrl: c.thumbnailUrl,
        alt: c.alt,
        source: c.source,
        sourceUrl: c.sourceUrl,
        width: c.width,
        height: c.height,
        baseScore: c.baseScore,
        finalScore: c.finalScore,
        type: c.type,
        resolvedUrl: c.resolvedUrl,
        resolvedWidth: c.resolvedWidth,
        resolvedHeight: c.resolvedHeight,
        qualityFactors: c.qualityFactors,
        qualityCompositeScore: c.qualityCompositeScore,
        cropMetadata: cropResults.get(c.url),
        visionResult: visionResults.has(c.url)
          ? {
              pass: visionResults.get(c.url)!.pass,
              confidence: visionResults.get(c.url)!.confidence,
              issues: visionResults.get(c.url)!.issues,
              qualitySignals: visionResults.get(c.url)!.qualitySignals,
              qualityScore: visionResults.get(c.url)!.qualityScore,
            }
          : undefined,
        selectionStatus: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'candidate',
      })),
      rejected: result.rejected.map((r) => ({
        url: r.candidate.url,
        thumbnailUrl: r.candidate.thumbnailUrl,
        alt: r.candidate.alt,
        source: r.candidate.source,
        sourceUrl: r.candidate.sourceUrl,
        baseScore: r.candidate.baseScore,
        reason: r.reason,
        pattern: r.pattern,
        category: r.category,
        issues: r.issues,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);

    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setFallbackJson(json);
      setCopyStatus('fallback');
    }
  }, [result, visionResults, cropResults]);

  const toggleCard = useCallback((url: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const displayCandidates = result
    ? sortCandidates(filterAccepted(result.accepted, filterState), sortKey)
    : [];

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-surface-950 font-mono" data-testid="asset-tester-modal">
      <TestRunner
        onClose={onClose}
        query={query}
        onQueryChange={setQuery}
        onRun={runPipeline}
        onCancel={handleCancel}
        runStatus={runStatus}
        hasApiKey={hasApiKey}
        currentStage={currentStage}
        errorMsg={errorMsg}
        hasResults={!!result}
        sortKey={sortKey}
        onSortChange={setSortKey}
        filterState={filterState}
        onFilterChange={setFilterState}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        copyStatus={copyStatus}
        onExport={handleExport}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        <ResultsDisplay
          result={result}
          runStatus={runStatus}
          displayCandidates={displayCandidates}
          viewMode={viewMode}
          expandedCards={expandedCards}
          onToggleCard={toggleCard}
          visionResults={visionResults}
          cropResults={cropResults}
          copyStatus={copyStatus}
          fallbackJson={fallbackJson}
        />
      </div>
    </div>
  );
}
