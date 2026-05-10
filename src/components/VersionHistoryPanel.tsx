import { useState, useCallback } from 'react';
import { History, RotateCcw, Trash2, GitCompare, X } from 'lucide-react';
import type { VideoProject } from '../types';
import {
  saveVersion,
  getVersions,
  restoreVersion,
  deleteVersion,
  compareVersions,
  type VersionEntry,
} from '../services/versionHistory';
import VideoComparison from './VideoComparison';

interface VersionHistoryPanelProps {
  project: VideoProject | null;
  onRestore: (project: VideoProject) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function VersionHistoryPanel({ project, onRestore, isOpen, onClose }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionEntry[]>(() =>
    project ? getVersions(project.id) : [],
  );
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [diffSummary, setDiffSummary] = useState<string[]>([]);
  const [showVideoComparison, setShowVideoComparison] = useState(false);

  const refreshVersions = useCallback(() => {
    if (project) {
      setVersions(getVersions(project.id));
    }
  }, [project]);

  const handleSaveVersion = () => {
    if (!project) return;
    const label = `Auto-save ${new Date().toLocaleString()}`;
    saveVersion(project, label);
    refreshVersions();
  };

  const handleRestore = (versionId: string) => {
    if (!project) return;
    const restored = restoreVersion(versionId, project.id);
    if (restored) {
      onRestore(restored);
    }
  };

  const handleDelete = (versionId: string) => {
    if (!project) return;
    deleteVersion(versionId, project.id);
    refreshVersions();
  };

  const handleCompare = () => {
    if (!project || !compareA || !compareB) return;
    const entryA = versions.find((v) => v.id === compareA);
    const entryB = versions.find((v) => v.id === compareB);
    if (entryA && entryB) {
      setDiffSummary(compareVersions(entryA.snapshot, entryB.snapshot));
    }
  };

  const handleVideoCompare = () => {
    if (!compareA || !compareB) return;
    setShowVideoComparison(true);
  };

  const versionA = compareA ? versions.find(v => v.id === compareA)?.snapshot || null : null;
  const versionB = compareB ? versions.find(v => v.id === compareB)?.snapshot || null : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="version-history-modal">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden border-2 border-surface-700 bg-surface-900 shadow-[4px_4px_0px_#ff5500] flex flex-col">
        <div className="flex items-center justify-between border-b-2 border-surface-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-brand-500" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-white">Version History</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveVersion}
              disabled={!project}
              className="flex items-center gap-1 border-2 border-brand-500 px-3 py-1 text-xs font-mono text-brand-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black disabled:opacity-50"
            >
              Save Current
            </button>
            <button
              onClick={onClose}
              className="border-2 border-surface-700 p-1 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
              aria-label="Close version history"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareA(null);
                setCompareB(null);
                setDiffSummary([]);
              }}
              className={`flex items-center gap-2 border-2 px-3 py-1.5 text-xs font-mono ${
                compareMode
                  ? 'border-brand-500 bg-brand-500 text-black'
                  : 'border-surface-700 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
              }`}
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare Versions
            </button>
          </div>

          {compareMode && diffSummary.length > 0 && (
            <div className="mb-4 rounded border-2 border-surface-700 bg-surface-950 p-3">
              <h4 className="text-xs font-mono font-semibold text-brand-400 mb-2">Diff Summary</h4>
              <ul className="space-y-1">
                {diffSummary.map((d, i) => (
                  <li key={i} className="text-xs font-mono text-surface-300">- {d}</li>
                ))}
              </ul>
            </div>
          )}

          {versions.length === 0 && (
            <p className="text-sm font-mono text-surface-500">No saved versions yet. Click "Save Current" to create one.</p>
          )}

          <div className="space-y-2">
            {versions
              .slice()
              .reverse()
              .map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center gap-3 rounded border-2 p-3 ${
                    compareMode
                      ? 'border-surface-600 bg-surface-950'
                      : 'border-surface-700 bg-surface-950'
                  }`}
                >
                  {compareMode && (
                    <div className="flex flex-col gap-1">
                      <input
                        type="radio"
                        name="compareA"
                        checked={compareA === v.id}
                        onChange={() => setCompareA(v.id)}
                        className="sr-only"
                      />
                      <label
                        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-2 text-[8px] font-bold ${
                          compareA === v.id ? 'border-brand-500 bg-brand-500 text-black' : 'border-surface-600 text-transparent'
                        }`}
                      >
                        A
                      </label>
                    </div>
                  )}
                  {compareMode && (
                    <div className="flex flex-col gap-1">
                      <input
                        type="radio"
                        name="compareB"
                        checked={compareB === v.id}
                        onChange={() => setCompareB(v.id)}
                        className="sr-only"
                      />
                      <label
                        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-2 text-[8px] font-bold ${
                          compareB === v.id ? 'border-brand-500 bg-brand-500 text-black' : 'border-surface-600 text-transparent'
                        }`}
                      >
                        B
                      </label>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-semibold text-white truncate">{v.label}</p>
                    <p className="text-[10px] font-mono text-surface-500">
                      {new Date(v.timestamp).toLocaleString()} - {v.snapshot.script.length} segments
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!compareMode && (
                      <button
                        onClick={() => handleRestore(v.id)}
                        className="flex items-center gap-1 border-2 border-surface-700 px-2 py-1 text-[10px] font-mono text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
                        aria-label="Restore this version"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="flex items-center gap-1 border-2 border-surface-700 px-2 py-1 text-[10px] font-mono text-surface-400 hover:bg-red-500 hover:text-black"
                      aria-label="Delete this version"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {compareMode && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleCompare}
                disabled={!compareA || !compareB}
                className="flex items-center gap-2 bg-brand-500 px-4 py-2 text-xs font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitCompare className="h-4 w-4" />
                Compare Selected
              </button>
              <button
                onClick={handleVideoCompare}
                disabled={!compareA || !compareB}
                className="flex items-center gap-2 border-2 border-brand-500 px-4 py-2 text-xs font-bold text-brand-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitCompare className="h-4 w-4" />
                Video Compare
              </button>
            </div>
          )}
        </div>
      </div>

      <VideoComparison
        isOpen={showVideoComparison}
        onClose={() => setShowVideoComparison(false)}
        versionA={versionA}
        versionB={versionB}
        labelA={versions.find(v => v.id === compareA)?.label || 'Version A'}
        labelB={versions.find(v => v.id === compareB)?.label || 'Version B'}
      />
    </div>
  );
}
