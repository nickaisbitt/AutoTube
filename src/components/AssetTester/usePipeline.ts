import { useState, useRef, useCallback } from 'react';
import type { AppConfig, TopicContext } from '../../types';
import type { MediaCandidate } from '../../services/media';
import { scoreCandidate } from '../../services/media';
import { filterCandidates } from '../../services/domainFilter';
import { queryAllProviders } from '../../services/sourceProviders';
import { batchVisionCheck, type VisionCheckResult } from '../../services/visionCheck';
import { batchResolve } from '../../services/fullResResolver';
import { batchScoreQuality } from '../../services/qualityScorer';
import { focalCrop, needsCropping, type CropMetadata } from '../../services/focalCropper';

// ---------------------------------------------------------------------------
// Types (shared with other sub-components)
// ---------------------------------------------------------------------------

export type RunStatus = 'idle' | 'running' | 'complete' | 'error';

export interface StageTimingEntry {
  stage: string;
  durationMs: number | null;
}

export interface RejectedCandidate {
  candidate: MediaCandidate;
  reason: 'domain-filter' | 'vision-check';
  pattern?: string;
  category?: string;
  issues?: string[];
}

export interface TestRunResult {
  query: string;
  accepted: MediaCandidate[];
  rejected: RejectedCandidate[];
  timing: StageTimingEntry[];
  totalTimeMs: number;
  timestamp: string;
}

export type VisionMap = Map<string, VisionCheckResult>;
export type CropMap = Map<string, CropMetadata>;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePipeline(appConfig: AppConfig) {
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [query, setQuery] = useState('');
  const [currentStage, setCurrentStage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [visionResults, setVisionResults] = useState<VisionMap>(new Map());
  const [cropResults, setCropResults] = useState<CropMap>(new Map());

  const abortRef = useRef<AbortController | null>(null);
  const hasApiKey = Boolean(appConfig.openRouterKey);

  const runPipeline = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || runStatus === 'running') return;

    setResult(null);
    setVisionResults(new Map());
    setCropResults(new Map());
    setErrorMsg('');

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setRunStatus('running');
    const timing: StageTimingEntry[] = [];
    const rejected: RejectedCandidate[] = [];
    const totalStart = performance.now();

    const minimalTopicContext: TopicContext = {
      topic: trimmed,
      coreSubject: trimmed,
      subjectCandidates: [trimmed],
      kind: 'concept',
      description: trimmed,
      entities: trimmed.split(/\s+/).filter((w) => w.length > 2),
      parseReasoning: 'Asset Tester',
    };

    try {
      // Stage 1: Search
      setCurrentStage('Search');
      let t0 = performance.now();
      const rawCandidates = await queryAllProviders(trimmed, appConfig, signal);
      timing.push({ stage: 'Search', durationMs: performance.now() - t0 });

      // Stage 2: Domain Filter
      setCurrentStage('Domain Filter');
      t0 = performance.now();
      const filtered = filterCandidates(rawCandidates);
      for (const r of filtered.rejected) {
        rejected.push({
          candidate: r.candidate,
          reason: 'domain-filter',
          pattern: r.pattern,
          category: r.category,
        });
      }
      timing.push({ stage: 'Domain Filter', durationMs: performance.now() - t0 });

      // Stage 3: Score
      setCurrentStage('Scoring');
      t0 = performance.now();
      const scored = filtered.accepted.map((c) => ({
        ...c,
        finalScore: scoreCandidate(c, minimalTopicContext, undefined, appConfig.sourceType),
      }));
      scored.sort((a, b) => b.finalScore - a.finalScore);
      timing.push({ stage: 'Scoring', durationMs: performance.now() - t0 });

      const top3 = scored.slice(0, 3);

      // Stage 4: Vision Check
      setCurrentStage('Vision Check');
      t0 = performance.now();
      if (top3.length > 0) {
        try {
          const vResults = await batchVisionCheck(top3, appConfig.openRouterKey, { signal });
          const newVisionMap = new Map<string, VisionCheckResult>();
          for (const c of top3) {
            const vr = vResults.get(c.url);
            if (vr) {
              newVisionMap.set(c.url, vr);
              if (!vr.pass) {
                const idx = scored.findIndex((s) => s.url === c.url);
                if (idx !== -1) {
                  scored.splice(idx, 1);
                  rejected.push({ candidate: c, reason: 'vision-check', issues: vr.issues });
                }
              }
            }
          }
          setVisionResults(newVisionMap);
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
        }
      }
      timing.push({ stage: 'Vision Check', durationMs: performance.now() - t0 });

      // Re-sort after vision filtering
      scored.sort((a, b) => b.finalScore - a.finalScore);
      const top3AfterVision = scored.slice(0, 3);

      // Stage 5: Resolve
      setCurrentStage('Resolution');
      t0 = performance.now();
      if (top3AfterVision.length > 0) {
        try {
          const resolveResults = await batchResolve(top3AfterVision, { signal });
          for (const c of top3AfterVision) {
            const rr = resolveResults.get(c.url);
            if (rr && rr.changed) {
              const idx = scored.findIndex((s) => s.url === c.url);
              if (idx !== -1) {
                scored[idx] = { ...scored[idx], resolvedUrl: rr.resolvedUrl, resolvedWidth: rr.width, resolvedHeight: rr.height };
              }
            }
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
        }
      }
      timing.push({ stage: 'Resolution', durationMs: performance.now() - t0 });

      // Stage 6: Quality Score
      setCurrentStage('Quality Scoring');
      t0 = performance.now();
      if (top3AfterVision.length > 0) {
        try {
          const qResults = await batchScoreQuality(top3AfterVision, '', appConfig.openRouterKey, { signal });
          for (const c of top3AfterVision) {
            const qr = qResults.get(c.url);
            if (qr) {
              const idx = scored.findIndex((s) => s.url === c.url);
              if (idx !== -1) {
                scored[idx] = { ...scored[idx], qualityFactors: qr.factors, qualityCompositeScore: qr.compositeScore };
              }
            }
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
        }
      }
      timing.push({ stage: 'Quality Scoring', durationMs: performance.now() - t0 });

      // Stage 7: Focal Crop
      setCurrentStage('Focal Crop');
      t0 = performance.now();
      const newCropMap = new Map<string, CropMetadata>();
      try {
        for (const c of top3AfterVision) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const w = c.resolvedWidth ?? c.width;
          const h = c.resolvedHeight ?? c.height;
          if (w && h && needsCropping(w, h)) {
            const cropResult = await focalCrop(c.resolvedUrl ?? c.url, w, h, appConfig.openRouterKey, { signal });
            newCropMap.set(c.url, cropResult.crop);
          }
        }
        setCropResults(newCropMap);
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        setCropResults(newCropMap);
      }
      timing.push({ stage: 'Focal Crop', durationMs: performance.now() - t0 });

      const totalTimeMs = performance.now() - totalStart;
      setResult({ query: trimmed, accepted: scored, rejected, timing, totalTimeMs, timestamp: new Date().toISOString() });
      setRunStatus('complete');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setRunStatus('idle');
        setResult(null);
        return;
      }
      setErrorMsg((err as Error).message || 'Pipeline failed');
      setRunStatus('error');
    } finally {
      setCurrentStage('');
      abortRef.current = null;
    }
  }, [query, runStatus, appConfig, hasApiKey]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
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
  };
}
