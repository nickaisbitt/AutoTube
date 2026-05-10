import { useRef } from 'react';
import { X, Search, AlertTriangle, Grid3X3, List, Copy, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunStatus = 'idle' | 'running' | 'complete' | 'error';
type SortKey = 'finalScore' | 'baseScore' | 'resolution' | 'source';
type ViewMode = 'grid' | 'list';

interface FilterState {
  source: string | null;
  mediaType: 'image' | 'video' | null;
}

export interface TestRunnerProps {
  // Header
  onClose: () => void;

  // Search
  query: string;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  onCancel: () => void;
  runStatus: RunStatus;
  hasApiKey: boolean;

  // Progress
  currentStage: string;

  // Error
  errorMsg: string;

  // Controls (only shown when results exist)
  hasResults: boolean;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  filterState: FilterState;
  onFilterChange: (filter: FilterState) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;

  // Export
  copyStatus: 'idle' | 'copied' | 'fallback';
  onExport: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCES = ['DuckDuckGo', 'Wikimedia', 'Flickr', 'GovPress', 'Picsum'];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'finalScore', label: 'Final Score' },
  { key: 'baseScore', label: 'Base Score' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'source', label: 'Source' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the test execution controls: header, search bar, progress indicator,
 * error/notice banners, and the controls bar (sort, filter, view toggle, export).
 */
export default function TestRunner({
  onClose,
  query,
  onQueryChange,
  onRun,
  onCancel,
  runStatus,
  hasApiKey,
  currentStage,
  errorMsg,
  hasResults,
  sortKey,
  onSortChange,
  filterState,
  onFilterChange,
  viewMode,
  onViewModeChange,
  copyStatus,
  onExport,
}: TestRunnerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRun();
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-surface-700 bg-surface-900 px-6 py-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-brand-500">
          ASSET TESTER
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="border-2 border-surface-700 p-1 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
          aria-label="Close asset tester"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 border-b-2 border-surface-700 bg-surface-900 px-6 py-3">
        <Search className="h-4 w-4 text-surface-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter search query..."
          autoFocus
          className="flex-1 border-2 border-surface-700 bg-surface-800 px-3 py-2 text-xs text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none"
          data-testid="asset-tester-query"
        />
        {runStatus === 'running' ? (
          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-red-500 bg-red-900 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500 hover:text-black"
            data-testid="asset-tester-cancel"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={!query.trim() || !hasApiKey}
            className="bg-brand-500 px-4 py-2 text-xs font-bold uppercase text-black shadow-[2px_2px_0px_#ff5500] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="asset-tester-run"
          >
            Test Harvest
          </button>
        )}
      </div>

      {/* Progress bar */}
      {runStatus === 'running' && currentStage && (
        <div className="border-b-2 border-surface-700 bg-surface-900 px-6 py-2" data-testid="asset-tester-progress">
          <div className="flex items-center gap-2 text-xs text-brand-400">
            <div className="h-2 w-2 bg-brand-500 animate-ping" />
            <span>Running: {currentStage}</span>
          </div>
        </div>
      )}

      {/* API key required notice */}
      {!hasApiKey && (
        <div className="flex items-center gap-2 border-b-2 border-red-500 bg-red-900 px-6 py-2 text-[11px] text-red-300" data-testid="asset-tester-api-notice">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>OpenRouter API key required. Add it in Settings to use the Asset Tester.</span>
        </div>
      )}

      {/* Error */}
      {runStatus === 'error' && errorMsg && (
        <div className="flex items-center gap-2 border-b-2 border-red-500 bg-red-900 px-6 py-2 text-[11px] text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Error: {errorMsg}</span>
        </div>
      )}

      {/* Controls bar — only shown when results exist */}
      {hasResults && (
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-surface-700 bg-surface-900 px-6 py-3" data-testid="asset-tester-controls">
          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="border-2 border-surface-700 bg-surface-800 px-2 py-1.5 text-[11px] text-white focus:border-brand-500 focus:outline-none"
            data-testid="asset-tester-sort"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          {/* Source filter */}
          <select
            value={filterState.source ?? ''}
            onChange={(e) =>
              onFilterChange({ ...filterState, source: e.target.value || null })
            }
            className="border-2 border-surface-700 bg-surface-800 px-2 py-1.5 text-[11px] text-white focus:border-brand-500 focus:outline-none"
            data-testid="asset-tester-source-filter"
          >
            <option value="">All Sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={filterState.mediaType ?? ''}
            onChange={(e) =>
              onFilterChange({
                ...filterState,
                mediaType: (e.target.value || null) as 'image' | 'video' | null,
              })
            }
            className="border-2 border-surface-700 bg-surface-800 px-2 py-1.5 text-[11px] text-white focus:border-brand-500 focus:outline-none"
            data-testid="asset-tester-type-filter"
          >
            <option value="">All Types</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>

          {/* View toggle */}
          <div className="flex border-2 border-surface-700">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 ${viewMode === 'grid' ? 'bg-brand-500 text-black' : 'text-surface-400 hover:bg-surface-800'}`}
              data-testid="asset-tester-grid-toggle"
              aria-label="Grid view"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={`p-1.5 ${viewMode === 'list' ? 'bg-brand-500 text-black' : 'text-surface-400 hover:bg-surface-800'}`}
              data-testid="asset-tester-list-toggle"
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Export */}
          <button
            type="button"
            onClick={onExport}
            className="ml-auto flex items-center gap-1.5 border-2 border-surface-700 px-3 py-1.5 text-[11px] font-semibold text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            data-testid="asset-tester-export"
          >
            {copyStatus === 'copied' ? (
              <>
                <Check className="h-3 w-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Export JSON
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
