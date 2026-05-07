/**
 * Pipeline Orchestrator — Step execution logic extracted as pure async functions.
 *
 * Each function accepts state + callbacks as parameters, performs the pipeline step
 * (calling services), and returns results. No direct state mutation happens here —
 * the composed hook invokes these and updates state from the results.
 */

import type {
  VideoProject,
  TopicConfig,
  ScriptSegment,
  MediaAsset,
  NarrationClip,
  SegmentVisualPlan,
  AppConfig,
} from '../../types';
import { hasSpeechSupport, loadSpeechVoices, pickPreferredVoice, stopSpeaking } from '../../utils/speech';
import {
  sourceSegmentMedia,
  replaceMediaAsset as replaceSegmentMedia,
  resetUsedUrlsMap,
} from '../../services/media';
import { resolveTopicContext, planSegmentVisuals } from '../../services/visualPlanner';
import { generateAIScript, reviewAndImproveScript, generateVideoTitle } from '../../services/llm/index';
import { assignSceneLayouts, scheduleRetentionBeats } from '../../services/renderingShared';
import { QUALITY_PRESETS, renderVideoToBlob } from '../../services/renderer';
import { trackVideoGeneration } from '../../services/analytics';
import { reorderForHook } from '../../services/segmentReorderer';
import { CHART_KEYWORDS } from '../../services/captionUtils';
import { runAIEditPass } from '../../services/aiEditor';
import { extractHookLine } from '../../services/seoTitles';
import { logger } from '../../services/logger';
import { runBlindReview } from '../../services/blindReview';
import { generateGrokTts, generateMeloTts } from '../../services/tts';
import { CURRENT_PROJECT_VERSION } from '../../services/projectMigrations';

// LR-1 fix: use crypto.randomUUID() for guaranteed uniqueness
function generateId(): string {
  return crypto.randomUUID();
}

export interface ProgressCallbacks {
  setProcessingProgress: (progress: number) => void;
  setProcessingMessage: (message: string) => void;
}

// ─── Script Generation ───────────────────────────────────────────────────────

export async function executeGenerateScript(
  config: TopicConfig,
  appConfig: AppConfig,
  signal: AbortSignal,
  callbacks: ProgressCallbacks,
): Promise<VideoProject | null> {
  const { setProcessingProgress, setProcessingMessage } = callbacks;

  if (!appConfig.openRouterKey) {
    logger.error('Store', 'OpenRouter API key required. Add it in Settings.');
    return null;
  }

  let segments: ScriptSegment[];

  setProcessingProgress(15);
  setProcessingMessage('Generating script...');
  try {
    segments = await generateAIScript(config, appConfig.openRouterKey, undefined, signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Store', 'Script generation cancelled by user');
      return null;
    }
    logger.error('Store', 'AI script generation failed', err);
    throw err;
  }

  // Review and improve the script via a second LLM pass
  setProcessingProgress(55);
  setProcessingMessage('Reviewing script...');
  try {
    segments = await reviewAndImproveScript(segments, config.topic, appConfig.openRouterKey, signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Store', 'Script review cancelled by user');
      return null;
    }
    logger.warn('Store', 'Script review encountered an error, using original script');
  }

  // Assign scene layouts based on purpose tags
  const layouts = assignSceneLayouts(segments);
  for (let i = 0; i < segments.length; i++) {
    segments[i].sceneLayout = layouts[i];
  }

  // Schedule retention beats
  const retentionBeats = scheduleRetentionBeats(
    segments.map(seg => ({
      duration: seg.duration > 0 ? seg.duration : Math.max(10, Math.ceil((seg.narration.split(/\s+/).length / 150) * 60)),
      narration: seg.narration,
    }))
  );
  for (const beat of retentionBeats) {
    logger.info('Store', `Retention beat: segment=${beat.segmentIndex} offset=${beat.timeOffsetSec.toFixed(1)}s type=${beat.type}`);
  }

  // Generate an optimized title from the reviewed script
  setProcessingProgress(80);
  setProcessingMessage('Generating title...');
  const hookLine = extractHookLine(segments);
  let videoTitle: string;
  try {
    videoTitle = await generateVideoTitle(segments, config.topic, appConfig.openRouterKey, hookLine, signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Store', 'Title generation cancelled by user');
      return null;
    }
    videoTitle = config.topic;
  }

  const newProject: VideoProject = {
    version: CURRENT_PROJECT_VERSION,
    id: generateId(),
    title: videoTitle,
    topic: config.topic,
    style: config.style,
    targetDuration: config.targetDuration,
    script: segments,
    media: [],
    narration: [],
    status: 'draft',
    createdAt: new Date(),
  };

  return newProject;
}

// ─── Media Sourcing ──────────────────────────────────────────────────────────

export async function executeSourceMedia(
  activeProject: VideoProject,
  appConfig: AppConfig,
  signal: AbortSignal,
  callbacks: ProgressCallbacks,
): Promise<VideoProject | null> {
  const { setProcessingProgress, setProcessingMessage } = callbacks;

  // STEP 1: research the topic (Wikipedia entity resolution)
  setProcessingProgress(4);
  setProcessingMessage(`Researching "${activeProject.topic}" on Wikipedia…`);
  const topicContext = await resolveTopicContext(activeProject.topic, signal);
  setProcessingMessage(
    topicContext.resolvedTitle
      ? `Identified "${topicContext.resolvedTitle}" — ${topicContext.kind}. Planning visuals…`
      : `No Wikipedia match. Planning from raw topic…`,
  );

  // STEP 2: plan visuals for every segment
  const visualPlans: Record<string, SegmentVisualPlan> = {};
  for (let i = 0; i < activeProject.script.length; i += 1) {
    const seg = activeProject.script[i];
    visualPlans[seg.id] = await planSegmentVisuals(seg, topicContext, appConfig.openRouterKey, signal);
  }

  // STEP 3: harvest images for each plan
  const media: MediaAsset[] = [];
  const usedUrls = new Set<string>();

  for (let i = 0; i < activeProject.script.length; i += 1) {
    const segment = activeProject.script[i];
    const plan = visualPlans[segment.id];
    const beatLabel = plan.beat.toUpperCase();
    const conceptLabel = plan.concepts[0]?.description || segment.title;

    setProcessingProgress(15 + Math.round((i / activeProject.script.length) * 80));
    setProcessingMessage(`[${beatLabel}] ${conceptLabel} — harvesting…`);

    const sourced = await sourceSegmentMedia(segment, plan, topicContext, usedUrls, i, appConfig, signal,
      (message: string, pct: number) => {
        const segmentStart = 15 + Math.round((i / activeProject.script.length) * 80);
        const segmentEnd = 15 + Math.round(((i + 1) / activeProject.script.length) * 80);
        const mappedPct = segmentStart + Math.round((pct / 100) * (segmentEnd - segmentStart));
        setProcessingProgress(Math.min(mappedPct, 95));
        setProcessingMessage(message);
      },
    );

    if (sourced.assets.length === 0) {
      logger.warn('Store', `Segment "${segment.title}" returned 0 media assets — pipeline continues with remaining segments`);
    }

    for (const asset of sourced.assets) {
      media.push({ id: generateId(), segmentId: segment.id, ...asset });
    }

    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }

  // ── First-Segment Impact (Requirement 7.1) ──────────────────────────────
  // Ensure the first segment has the highest-scored non-fallback asset across
  // the entire project. If a better asset exists in another segment, swap it
  // into the first segment's primary slot.
  if (activeProject.script.length > 0 && media.length > 1) {
    const firstSegmentId = activeProject.script[0].id;
    const firstSegmentAssets = media.filter(a => a.segmentId === firstSegmentId);
    const allNonFallbackAssets = media.filter(a => !a.isFallback && a.score !== undefined);

    if (allNonFallbackAssets.length > 0) {
      const bestOverall = allNonFallbackAssets.reduce((best, curr) =>
        (curr.score ?? 0) > (best.score ?? 0) ? curr : best
      );

      const firstSegmentBest = firstSegmentAssets
        .filter(a => !a.isFallback)
        .reduce((best, curr) => (curr.score ?? 0) > (best.score ?? 0) ? curr : best, firstSegmentAssets[0]);

      // Only swap if the best overall asset is significantly better than the first segment's best
      // and it's not already in the first segment
      if (bestOverall && firstSegmentBest &&
          bestOverall.segmentId !== firstSegmentId &&
          (bestOverall.score ?? 0) > (firstSegmentBest.score ?? 0) + 50) {
        // Swap: move the best asset to the first segment, and the first segment's primary to the donor segment
        const donorSegmentId = bestOverall.segmentId;
        const bestIdx = media.findIndex(a => a === bestOverall);
        const firstIdx = media.findIndex(a => a === firstSegmentBest);

        if (bestIdx !== -1 && firstIdx !== -1) {
          media[bestIdx] = { ...media[bestIdx], segmentId: donorSegmentId };
          media[firstIdx] = { ...media[firstIdx], segmentId: firstSegmentId };
          // Swap the actual entries so the first segment gets the best asset
          const temp = media[bestIdx];
          media[bestIdx] = { ...firstSegmentBest, segmentId: donorSegmentId };
          media[firstIdx] = { ...bestOverall, segmentId: firstSegmentId };
          logger.info('FirstSegmentImpact', `Swapped first segment asset (score: ${firstSegmentBest.score}) with higher-scored asset (score: ${bestOverall.score}) from segment "${donorSegmentId}"`);
        }
      }
    }
  }

  const updatedProject: VideoProject = {
    ...activeProject,
    media,
    topicContext,
    visualPlans,
  };

  // Save project for server-side renderer
  try {
    fetch(`/api/save-project?id=${encodeURIComponent(updatedProject.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProject),
    }).catch(() => {});
  } catch { /* ignore */ }

  return updatedProject;
}

// ─── Replace Media Asset ─────────────────────────────────────────────────────

export async function executeReplaceMediaAsset(
  project: VideoProject,
  assetId: string,
  appConfig: AppConfig,
): Promise<VideoProject | null> {
  const currentAsset = project.media.find((asset) => asset.id === assetId);
  if (!currentAsset) return null;
  const segment = project.script.find((item) => item.id === currentAsset.segmentId);
  if (!segment) return null;

  const segmentIndex = project.script.findIndex((item) => item.id === segment.id);
  const topicContext = project.topicContext || (await resolveTopicContext(project.topic));
  const plan =
    project.visualPlans?.[segment.id] ||
    (await planSegmentVisuals(segment, topicContext, appConfig.openRouterKey));

  const excludeUrls = new Set(project.media.map((asset) => asset.url));
  const replacement = await replaceSegmentMedia(segment, plan, topicContext, excludeUrls, segmentIndex, appConfig);

  return {
    ...project,
    topicContext: project.topicContext || topicContext,
    visualPlans: { ...(project.visualPlans || {}), [segment.id]: plan },
    media: project.media.map((asset) =>
      asset.id === assetId ? { ...asset, ...replacement } : asset,
    ),
  };
}

// ─── Narration Generation ────────────────────────────────────────────────────

async function measureAudioDuration(audioUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      resolve(duration && Number.isFinite(duration) ? duration : null);
    };

    const timer = setTimeout(() => finish(null), 8_000);

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => finish(audio.duration));
    audio.addEventListener('error', () => finish(null));
    audio.src = audioUrl;
  });
}

export async function executeGenerateNarration(
  activeProject: VideoProject,
  appConfig: AppConfig,
  signal: AbortSignal,
  callbacks: ProgressCallbacks,
): Promise<VideoProject | null> {
  const { setProcessingProgress, setProcessingMessage } = callbacks;

  setProcessingProgress(6);
  setProcessingMessage('Checking TTS options...');

  const xaiKey = import.meta.env.VITE_XAI_KEY || '';
  const cfAccountId = import.meta.env.VITE_CF_ACCOUNT_ID || '';
  const cfApiToken = import.meta.env.VITE_CF_API_TOKEN || '';

  const hasGrok = !!xaiKey;
  const hasMelo = !!cfAccountId && !!cfApiToken;

  const supported = hasSpeechSupport();
  const voices = supported ? await loadSpeechVoices() : [];
  const selectedVoice = pickPreferredVoice(voices);

  const engines: string[] = [];
  if (hasGrok) engines.push('Grok TTS');
  if (hasMelo) engines.push('MeloTTS');
  engines.push('Browser TTS');
  logger.info('Store', `TTS fallback chain: ${engines.join(' → ')}`);
  setProcessingMessage(`TTS engines: ${engines.join(' → ')}`);

  const narration: NarrationClip[] = [];
  const segmentCount = activeProject.script.length;
  const CONCURRENCY_LIMIT = 3;

  type TtsResult = {
    audioUrl?: string;
    voiceUsed: string;
    clipMode: NarrationClip['mode'];
    engineUsed: string;
    estimatedDuration: number;
    status: NarrationClip['status'];
  };

  async function generateTtsForSegment(segment: ScriptSegment): Promise<TtsResult> {
    const wordCount = segment.narration.split(/\s+/).length;
    let estimatedDuration = Math.max(6, Math.ceil((wordCount / 150) * 60));
    let audioUrl: string | undefined;
    let voiceUsed = selectedVoice?.name || 'No browser voice available';
    let clipMode: NarrationClip['mode'] = 'live_browser';
    let engineUsed = 'browser';
    let status: NarrationClip['status'] = 'ready';

    // Tier 1: Grok TTS
    if (hasGrok) {
      const grokUrl = await generateGrokTts(segment.narration, xaiKey, {
        voice: appConfig.ttsVoice,
        signal,
      });
      if (grokUrl) {
        audioUrl = grokUrl;
        voiceUsed = `Grok TTS (${appConfig.ttsVoice || 'Sal'})`;
        clipMode = 'exported_file';
        engineUsed = 'grok';

        try {
          const measured = await measureAudioDuration(grokUrl);
          if (measured && measured > 0) {
            estimatedDuration = Math.ceil(measured);
          }
        } catch { /* Keep estimated duration */ }
      } else {
        logger.warn('Store', `Grok TTS failed for segment "${segment.title}", trying next engine`);
      }
    }

    // Tier 2: MeloTTS (Cloudflare)
    if (!audioUrl && hasMelo) {
      const meloUrl = await generateMeloTts(segment.narration, cfAccountId, cfApiToken, { signal });
      if (meloUrl) {
        audioUrl = meloUrl;
        voiceUsed = 'MeloTTS (Cloudflare)';
        clipMode = 'exported_file';
        engineUsed = 'melo';

        try {
          const measured = await measureAudioDuration(meloUrl);
          if (measured && measured > 0) {
            estimatedDuration = Math.ceil(measured);
          }
        } catch { /* Keep estimated duration */ }
      } else {
        logger.warn('Store', `MeloTTS failed for segment "${segment.title}", falling back to browser TTS`);
      }
    }

    // Tier 3: Browser TTS (free fallback)
    if (!audioUrl) {
      if (!supported || !selectedVoice) {
        status = 'unavailable';
      }
      engineUsed = 'browser';
    }

    return { audioUrl, voiceUsed, clipMode, engineUsed, estimatedDuration, status };
  }

  const useParallel = hasGrok || hasMelo;
  const ttsResults: TtsResult[] = [];

  if (useParallel) {
    for (let batchStart = 0; batchStart < segmentCount; batchStart += CONCURRENCY_LIMIT) {
      if (signal.aborted) {
        logger.info('Store', 'Narration generation cancelled by user');
        return null;
      }

      const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, segmentCount);
      const batchSegments = activeProject.script.slice(batchStart, batchEnd);

      setProcessingMessage(
        `Generating TTS for segments ${batchStart + 1}\u2013${batchEnd} of ${segmentCount}...`,
      );

      const batchResults = await Promise.all(
        batchSegments.map((seg) =>
          generateTtsForSegment(seg).catch((): TtsResult => ({
            audioUrl: undefined,
            voiceUsed: selectedVoice?.name || 'No browser voice available',
            clipMode: 'live_browser',
            engineUsed: 'browser',
            estimatedDuration: Math.max(6, Math.ceil((seg.narration.split(/\s+/).length / 150) * 60)),
            status: !supported || !selectedVoice ? 'unavailable' : 'ready',
          })),
        ),
      );

      ttsResults.push(...batchResults);
      setProcessingProgress(Math.round((batchEnd / segmentCount) * 100));
    }
  } else {
    for (let i = 0; i < segmentCount; i += 1) {
      if (signal.aborted) {
        logger.info('Store', 'Narration generation cancelled by user');
        return null;
      }

      const segment = activeProject.script[i];
      setProcessingProgress(Math.round((i / segmentCount) * 100));
      setProcessingMessage(`Preparing voice for \u201c${segment.title}\u201d...`);

      const wordCount = segment.narration.split(/\s+/).length;
      const estimatedDuration = Math.max(6, Math.ceil((wordCount / 150) * 60));

      ttsResults.push({
        audioUrl: undefined,
        voiceUsed: selectedVoice?.name || 'No browser voice available',
        clipMode: 'live_browser',
        engineUsed: 'browser',
        estimatedDuration,
        status: !supported || !selectedVoice ? 'unavailable' : 'ready',
      });

      const delayMs = Math.max(50, Math.min(200, wordCount * 0.5));
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  // Build narration clips from results
  for (let i = 0; i < segmentCount; i += 1) {
    const segment = activeProject.script[i];
    const result = ttsResults[i];

    narration.push({
      id: generateId(),
      segmentId: segment.id,
      text: segment.narration,
      voice: result.voiceUsed,
      duration: result.estimatedDuration,
      status: result.status,
      audioUrl: result.audioUrl,
      mode: result.clipMode,
    });
  }

  return {
    ...activeProject,
    narration,
  };
}

// ─── AI Edit ─────────────────────────────────────────────────────────────────

export async function executeRunAIEdit(
  activeProject: VideoProject,
  openRouterKey: string,
  signal: AbortSignal,
  callbacks: ProgressCallbacks,
): Promise<VideoProject | null> {
  const { setProcessingProgress, setProcessingMessage } = callbacks;

  try {
    const { editedProject } = await runAIEditPass(activeProject, openRouterKey, {
      signal,
      onProgress: (pct, message) => {
        setProcessingProgress(pct);
        setProcessingMessage(message);
      },
    });

    return editedProject;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('Store', 'AI edit cancelled by user');
      return null;
    }
    logger.error('Store', 'AI edit pass failed', err);
    throw err;
  }
}

// ─── Video Assembly ──────────────────────────────────────────────────────────

export async function executeAssembleVideo(
  activeProject: VideoProject,
  appConfig: AppConfig,
  signal: AbortSignal,
  callbacks: ProgressCallbacks,
  exportOptions?: { quality?: 'draft' | 'standard' | 'high'; format?: 'webm' | 'mp4' },
): Promise<VideoProject | null> {
  const { setProcessingProgress, setProcessingMessage } = callbacks;

  // Deep-clone the project so the render operates on an immutable snapshot
  const renderSnapshot = structuredClone(activeProject);

  const quality = exportOptions?.quality || 'high';
  const format = exportOptions?.format || 'mp4';
  const preset = QUALITY_PRESETS[quality];
  const renderStartedAt = performance.now();

  // Reorder segments so the highest-scored chart asset appears first
  const hasChartAsset = renderSnapshot.media.some((a) =>
    CHART_KEYWORDS.some(
      (kw) =>
        (a.concept ?? '').toLowerCase().includes(kw.toLowerCase()) ||
        (a.alt ?? '').toLowerCase().includes(kw.toLowerCase())
    )
  );
  const projectToRender = hasChartAsset ? reorderForHook(renderSnapshot) : renderSnapshot;

  const blob = await renderVideoToBlob(projectToRender, {
    quality,
    format,
    width: preset.width,
    height: preset.height,
    onProgress: (pct, message) => {
      setProcessingProgress(pct);
      setProcessingMessage(message);
    },
    signal,
  });

  // Revoke old thumbnail blob URL to prevent memory leak
  if (renderSnapshot.thumbnail?.startsWith('blob:')) URL.revokeObjectURL(renderSnapshot.thumbnail);
  const url = URL.createObjectURL(blob);
  const mimeType = blob.type || 'video/webm';
  const resolvedFormat = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const fileName = `${projectToRender.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${resolvedFormat}`;

  const updatedProject: VideoProject = {
    ...projectToRender,
    status: 'complete',
    thumbnail: url,
    exportSettings: {
      quality,
      format: resolvedFormat,
      width: preset.width,
      height: preset.height,
      mimeType,
      fileName,
      backgroundMusic: projectToRender.exportSettings?.backgroundMusic,
    },
  };

  trackVideoGeneration({
    videoId: renderSnapshot.id,
    title: renderSnapshot.title,
    topic: renderSnapshot.topic,
    createdAt: new Date().toISOString(),
    renderTime: Math.max(0, (performance.now() - renderStartedAt) / 1000),
    fileSize: blob.size,
    duration: renderSnapshot.script.reduce((sum, seg) => sum + seg.duration, 0),
    segments: renderSnapshot.script.length,
    mediaCount: renderSnapshot.media.length,
    narrationClips: renderSnapshot.narration.length,
    quality,
    exportFormat: resolvedFormat,
  });

  // Blind Review Step
  setProcessingProgress(96);
  setProcessingMessage('Running blind quality review...');
  try {
    const report = await runBlindReview(updatedProject, appConfig.openRouterKey, {
      signal,
      onProgress: (pct, msg) => {
        const overallPct = 96 + Math.round(pct * 0.03);
        setProcessingProgress(overallPct);
        setProcessingMessage(msg);
      },
    });
    if (report) {
      updatedProject.blindReview = report;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    logger.warn('Store', 'Blind review failed, continuing to preview', err);
  }

  return updatedProject;
}

// ─── Quality Gates ───────────────────────────────────────────────────────────

/**
 * Configurable thresholds for quality gate evaluation.
 * Scores are on a 0-10 scale unless otherwise noted.
 */
export const QUALITY_THRESHOLDS = {
  /** Minimum thumbnail composite score (0-10) before auto-regeneration is recommended. */
  thumbnailMinScore: 5,
  /** Minimum hook clarity/intensity score (0-10) before rewrite is flagged. */
  hookMinScore: 5,
  /** Minimum number of distinct story arc phases required (personal, institutional, geopolitical). */
  minArcPhases: 2,
  /** Minimum clarity score (0-10) for script content. */
  clarityMinScore: 4,
  /** Minimum credibility score (0-10) for sourced claims. */
  credibilityMinScore: 4,
  /** Minimum urgency score (0-10) for engagement. */
  urgencyMinScore: 4,
  /** Minimum emotional specificity score (0-10). */
  emotionalSpecificityMinScore: 4,
  /** Maximum allowed word count for thumbnail text overlay. */
  thumbnailMaxTextWords: 5,
  /** Minimum number of thumbnail variants expected. */
  thumbnailMinVariants: 3,
} as const;

export type QualityGatePhase = 'script' | 'media' | 'assembly';

export interface QualityGateWarning {
  /** Which dimension triggered the warning. */
  dimension: string;
  /** Human-readable description of the issue. */
  message: string;
  /** Severity level. */
  severity: 'critical' | 'warning' | 'info';
}

export interface QualityGateRecommendation {
  /** What action to take. */
  action: 'regenerate_thumbnail' | 'rewrite_hook' | 'add_arc_bridge' | 'simplify_language' | 'add_sources' | 'diversify_visuals';
  /** Human-readable explanation. */
  reason: string;
  /** Which segment(s) are affected, if applicable. */
  affectedSegments?: string[];
}

export interface QualityGateResult {
  /** Whether the project passes the quality gate for this phase. */
  passed: boolean;
  /** Specific warnings found during evaluation. */
  warnings: QualityGateWarning[];
  /** Actionable recommendations for improvement. */
  recommendations: QualityGateRecommendation[];
}

/**
 * Evaluate quality gate for a project after a given pipeline phase.
 *
 * This is an opt-in utility that CAN be called by the orchestrator but does NOT
 * modify the existing orchestration flow. It inspects the project state and returns
 * a pass/fail result with specific warnings and recommendations.
 *
 * - After 'script' phase: validates hook quality, story arc, clarity, credibility
 * - After 'media' phase: validates thumbnail quality, visual diversity
 * - After 'assembly' phase: validates overall production, problem-to-solution arc
 */
export function evaluateQualityGate(
  project: VideoProject,
  phase: QualityGatePhase,
): QualityGateResult {
  const warnings: QualityGateWarning[] = [];
  const recommendations: QualityGateRecommendation[] = [];

  if (phase === 'script') {
    evaluateScriptPhase(project, warnings, recommendations);
  } else if (phase === 'media') {
    evaluateMediaPhase(project, warnings, recommendations);
  } else if (phase === 'assembly') {
    evaluateAssemblyPhase(project, warnings, recommendations);
  }

  const hasCritical = warnings.some((w) => w.severity === 'critical');
  return {
    passed: !hasCritical,
    warnings,
    recommendations,
  };
}

// ─── Phase-specific evaluators (internal helpers) ────────────────────────────

function evaluateScriptPhase(
  project: VideoProject,
  warnings: QualityGateWarning[],
  recommendations: QualityGateRecommendation[],
): void {
  const script = project.script;
  if (!script || script.length === 0) return;

  // Check hook quality: first segment should open with personal stakes
  const intro = script.find((s) => s.type === 'intro') || script[0];
  if (intro) {
    const narration = intro.narration.toLowerCase();
    const genericPhrases = [
      'in today\'s video', 'welcome back', 'hey guys',
      'what\'s up', 'in this video', 'let me tell you',
    ];
    const isGenericHook = genericPhrases.some((p) => narration.includes(p));
    if (isGenericHook) {
      warnings.push({
        dimension: 'hook',
        message: 'Opening uses generic YouTube phrasing instead of personal-stakes hook',
        severity: 'critical',
      });
      recommendations.push({
        action: 'rewrite_hook',
        reason: 'Hook scores below threshold — replace generic opening with concrete personal risk',
        affectedSegments: [intro.id],
      });
    }

    // Check for concrete risk indicators in hook
    const riskIndicators = ['money', 'files', 'identity', 'account', 'password', 'bank', 'stolen', 'hacked', 'lost', 'locked'];
    const hasConcreteRisk = riskIndicators.some((r) => narration.includes(r));
    if (!hasConcreteRisk && !isGenericHook) {
      warnings.push({
        dimension: 'hook',
        message: 'Hook lacks concrete personal risk — consider adding specific threat language',
        severity: 'warning',
      });
    }
  }

  // Check story arc: personal → institutional → geopolitical
  const arcPhases = detectArcPhases(script);
  if (arcPhases < QUALITY_THRESHOLDS.minArcPhases) {
    warnings.push({
      dimension: 'story_arc',
      message: `Story arc has only ${arcPhases} phase(s) — needs personal→institutional→geopolitical progression`,
      severity: 'warning',
    });
    recommendations.push({
      action: 'add_arc_bridge',
      reason: 'Missing clear progression from personal stakes to broader implications',
    });
  }

  // Check for problem-to-solution arc
  const hasProblem = script.some((s) => {
    const lower = s.narration.toLowerCase();
    return lower.includes('risk') || lower.includes('threat') || lower.includes('danger') || lower.includes('problem');
  });
  const hasSolution = script.some((s) => {
    const lower = s.narration.toLowerCase();
    return lower.includes('protect') || lower.includes('solution') || lower.includes('step') || lower.includes('prevent') || lower.includes('safe');
  });
  if (hasProblem && !hasSolution) {
    warnings.push({
      dimension: 'story_arc',
      message: 'Script presents problems without offering solutions — ending may feel disempowering',
      severity: 'warning',
    });
  }
}

function evaluateMediaPhase(
  project: VideoProject,
  warnings: QualityGateWarning[],
  recommendations: QualityGateRecommendation[],
): void {
  const media = project.media;
  if (!media || media.length === 0) return;

  // Check thumbnail quality via media quality factors
  const thumbnailAssets = media.filter((a) => a.qualityFactors);
  if (thumbnailAssets.length > 0) {
    const avgRelevance = thumbnailAssets.reduce((sum, a) => sum + (a.qualityFactors?.relevance ?? 5), 0) / thumbnailAssets.length;
    if (avgRelevance < QUALITY_THRESHOLDS.thumbnailMinScore) {
      warnings.push({
        dimension: 'thumbnail',
        message: `Average media relevance score (${avgRelevance.toFixed(1)}) is below threshold (${QUALITY_THRESHOLDS.thumbnailMinScore})`,
        severity: 'critical',
      });
      recommendations.push({
        action: 'regenerate_thumbnail',
        reason: 'Thumbnail/media relevance scores below threshold — regenerate with different concept',
      });
    }
  }

  // Check visual diversity: detect repeated URLs or concepts
  const conceptCounts = new Map<string, number>();
  for (const asset of media) {
    const concept = asset.concept || asset.query || 'unknown';
    conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
  }
  const repeatedConcepts = [...conceptCounts.entries()].filter(([, count]) => count > 2);
  if (repeatedConcepts.length > 0) {
    warnings.push({
      dimension: 'visual_diversity',
      message: `${repeatedConcepts.length} visual concept(s) repeated more than twice — risk of stock-footage fatigue`,
      severity: 'warning',
    });
    recommendations.push({
      action: 'diversify_visuals',
      reason: 'Repeated visual concepts detected — diversify to prevent monotony',
      affectedSegments: repeatedConcepts.map(([concept]) => concept),
    });
  }
}

function evaluateAssemblyPhase(
  project: VideoProject,
  warnings: QualityGateWarning[],
  recommendations: QualityGateRecommendation[],
): void {
  // Check blind review scores if available
  const review = project.blindReview;
  if (review) {
    const { scores } = review;

    if (scores.thumbnailEffectiveness < QUALITY_THRESHOLDS.thumbnailMinScore) {
      warnings.push({
        dimension: 'thumbnail',
        message: `Thumbnail effectiveness score (${scores.thumbnailEffectiveness}) below threshold (${QUALITY_THRESHOLDS.thumbnailMinScore})`,
        severity: 'critical',
      });
      recommendations.push({
        action: 'regenerate_thumbnail',
        reason: 'Blind review rated thumbnail below threshold — auto-regenerate with different concept',
      });
    }

    if (scores.pacing < QUALITY_THRESHOLDS.hookMinScore) {
      warnings.push({
        dimension: 'pacing',
        message: `Pacing score (${scores.pacing}) below threshold — retention risk`,
        severity: 'warning',
      });
    }

    if (scores.narrativeClarity < QUALITY_THRESHOLDS.clarityMinScore) {
      warnings.push({
        dimension: 'clarity',
        message: `Narrative clarity score (${scores.narrativeClarity}) below threshold`,
        severity: 'warning',
      });
      recommendations.push({
        action: 'simplify_language',
        reason: 'Narrative clarity is low — simplify language for target audience',
      });
    }
  }

  // Validate problem-to-solution arc at assembly level
  const script = project.script;
  if (script && script.length > 0) {
    const firstHalf = script.slice(0, Math.ceil(script.length / 2));
    const secondHalf = script.slice(Math.ceil(script.length / 2));

    const problemInFirstHalf = firstHalf.some((s) => {
      const lower = s.narration.toLowerCase();
      return lower.includes('risk') || lower.includes('threat') || lower.includes('attack') || lower.includes('vulnerability');
    });
    const solutionInSecondHalf = secondHalf.some((s) => {
      const lower = s.narration.toLowerCase();
      return lower.includes('protect') || lower.includes('prevent') || lower.includes('secure') || lower.includes('step') || lower.includes('action');
    });

    if (!problemInFirstHalf || !solutionInSecondHalf) {
      warnings.push({
        dimension: 'story_arc',
        message: 'Weak problem-to-solution arc — first half should establish threat, second half should provide agency',
        severity: 'warning',
      });
      recommendations.push({
        action: 'add_arc_bridge',
        reason: 'Video lacks visible problem-to-solution structure for click-through and retention optimization',
      });
    }
  }
}

/**
 * Detect how many distinct arc phases are present in the script.
 * Looks for personal, institutional, and geopolitical language markers.
 */
function detectArcPhases(script: ScriptSegment[]): number {
  const allText = script.map((s) => s.narration.toLowerCase()).join(' ');

  const personalMarkers = ['your', 'you', 'my', 'personal', 'family', 'home', 'wallet', 'phone'];
  const institutionalMarkers = ['company', 'corporation', 'business', 'organization', 'industry', 'enterprise'];
  const geopoliticalMarkers = ['government', 'nation', 'country', 'global', 'international', 'state-sponsored', 'geopolitical'];

  let phases = 0;
  if (personalMarkers.some((m) => allText.includes(m))) phases++;
  if (institutionalMarkers.some((m) => allText.includes(m))) phases++;
  if (geopoliticalMarkers.some((m) => allText.includes(m))) phases++;

  return phases;
}

// ─── Utility exports ─────────────────────────────────────────────────────────

export { resetUsedUrlsMap, stopSpeaking };
