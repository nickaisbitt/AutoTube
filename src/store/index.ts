/**
 * Composed Store Hook — combines all slices into the single `useVideoProject()` hook.
 *
 * Maintains the exact same return shape as the original `src/store.ts` for
 * backward compatibility. Components continue working unchanged.
 */

import { useCallback, useEffect } from 'react';
import type {
  PipelineStep,
  StepStatus,
  VideoProject,
  TopicConfig,
} from '../types';
import { useProjectSlice } from './slices/projectSlice';
import { usePipelineSlice, PIPELINE_STEPS } from './slices/pipelineSlice';
import { useConfigSlice } from './slices/configSlice';
import { useNarrationSlice } from './slices/narrationSlice';
import { useUISlice } from './slices/uiSlice';
import {
  executeGenerateScript,
  executeSourceMedia,
  executeReplaceMediaAsset,
  executeGenerateNarration,
  executeRunAIEdit,
  executeAssembleVideo,
  resetUsedUrlsMap,
  stopSpeaking,
} from './pipeline/orchestrator';
import { logger } from '../services/logger';
import { migrateProject } from '../services/projectMigrations';

// ─── Validation (re-exported for tests) ──────────────────────────────────────

const REQUIRED_PROJECT_FIELDS = ['id', 'title', 'topic', 'script', 'media', 'narration', 'status'] as const;

/**
 * Validates a stored project blob from localStorage.
 * Returns a sanitised object with project, stepStatuses, currentStep, and topicConfig,
 * or null if the data is invalid / corrupted.
 */
export function validateStoredProject(
  data: unknown,
): {
  project: VideoProject;
  stepStatuses: Record<PipelineStep, StepStatus>;
  currentStep: PipelineStep;
  topicConfig: TopicConfig;
} | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  if (!d.project || typeof d.project !== 'object') return null;
  const proj = d.project as Record<string, unknown>;

  for (const field of REQUIRED_PROJECT_FIELDS) {
    if (proj[field] === undefined || proj[field] === null) return null;
  }

  if (typeof proj.id !== 'string' || typeof proj.title !== 'string' || typeof proj.topic !== 'string') return null;
  if (!Array.isArray(proj.script) || !Array.isArray(proj.media) || !Array.isArray(proj.narration)) return null;
  if (typeof proj.status !== 'string') return null;

  // Run project migrations (v0 → current)
  const migrated = migrateProject(proj) as Record<string, unknown>;
  Object.assign(proj, migrated);

  const project = proj as unknown as VideoProject;

  // Staleness check: discard projects older than 24 hours
  if (project.createdAt) {
    const createdTime = new Date(project.createdAt).getTime();
    if (!Number.isNaN(createdTime) && Date.now() - createdTime > 24 * 60 * 60 * 1000) {
      return null;
    }
  }

  // Validate / sanitise step statuses
  const validStatuses: StepStatus[] = ['idle', 'active', 'processing', 'complete', 'error'];
  let stepStatuses: Record<PipelineStep, StepStatus>;

  if (d.stepStatuses && typeof d.stepStatuses === 'object') {
    const raw = d.stepStatuses as Record<string, unknown>;
    stepStatuses = {} as Record<PipelineStep, StepStatus>;
    for (const step of PIPELINE_STEPS) {
      const val = raw[step];
      if (typeof val === 'string' && validStatuses.includes(val as StepStatus)) {
        stepStatuses[step] = val as StepStatus;
      } else {
        stepStatuses[step] = 'idle';
      }
    }
  } else {
    stepStatuses = {
      topic: 'complete',
      script: 'complete',
      media: 'complete',
      narration: 'complete',
      ai_edit: 'complete',
      assembly: 'complete',
      preview: 'active',
    };
  }

  // Reset any 'processing' steps to 'active'
  for (const step of PIPELINE_STEPS) {
    if (stepStatuses[step] === 'processing') {
      stepStatuses[step] = 'active';
    }
  }

  // Validate currentStep
  let currentStep: PipelineStep = 'topic';
  if (typeof d.currentStep === 'string' && PIPELINE_STEPS.includes(d.currentStep as PipelineStep)) {
    currentStep = d.currentStep as PipelineStep;
  }

  if (project.status === 'complete') {
    currentStep = 'preview';
    stepStatuses.preview = 'active';
  }

  // Validate topicConfig
  const defaultTopicConfig: TopicConfig = {
    topic: project.topic || '',
    style: project.style || 'business_insider',
    targetDuration: 3,
    tone: 'informative',
    audience: 'General audience interested in current events',
  };

  let topicConfig: TopicConfig;
  if (d.topicConfig && typeof d.topicConfig === 'object') {
    const raw = d.topicConfig as Record<string, unknown>;
    topicConfig = {
      topic: typeof raw.topic === 'string' ? raw.topic : defaultTopicConfig.topic,
      style: typeof raw.style === 'string' ? raw.style as TopicConfig['style'] : defaultTopicConfig.style,
      targetDuration: typeof raw.targetDuration === 'number' ? raw.targetDuration : defaultTopicConfig.targetDuration,
      tone: typeof raw.tone === 'string' ? raw.tone as TopicConfig['tone'] : defaultTopicConfig.tone,
      audience: typeof raw.audience === 'string' ? raw.audience : defaultTopicConfig.audience,
    };
  } else {
    topicConfig = defaultTopicConfig;
  }

  return { project, stepStatuses, currentStep, topicConfig };
}

// ─── Composed Hook ───────────────────────────────────────────────────────────

export function useVideoProject() {
  // ── Slices ──
  const projectSlice = useProjectSlice();
  const pipelineSlice = usePipelineSlice();
  const configSlice = useConfigSlice();
  const narrationSlice = useNarrationSlice();
  const uiSlice = useUISlice();

  // Destructure for convenience
  const { project, setProject, topicConfig, setTopicConfig, updateNarrationText } = projectSlice;
  const {
    currentStep, setCurrentStep, stepStatuses, setStepStatuses,
    updateStepStatus, processingProgress, processingMessage,
    setProcessingProgress, setProcessingMessage,
    renderAbortRef, scriptAbortRef, mediaAbortRef, narrationAbortRef, aiEditAbortRef,
  } = pipelineSlice;
  const { appConfig, setAppConfig, isUnlocked, hasEncryptedKeys, pinError, unlockConfig, clearSavedKeys } = configSlice;
  const { sourcingRef } = narrationSlice;
  const { logs, batchJobs, setBatchJobs, isBatchProcessing, setIsBatchProcessing } = uiSlice;

  // ── Progress callbacks (shared by all pipeline steps) ──
  const getProgressCallbacks = useCallback(() => ({
    setProcessingProgress,
    setProcessingMessage,
  }), [setProcessingProgress, setProcessingMessage]);



  // ── Pipeline Actions ──

  const generateScript = useCallback(async (config: TopicConfig) => {
    updateStepStatus('topic', 'complete');
    updateStepStatus('script', 'processing');
    updateStepStatus('media', 'idle');
    updateStepStatus('narration', 'idle');
    updateStepStatus('ai_edit', 'idle');
    updateStepStatus('assembly', 'idle');
    updateStepStatus('preview', 'idle');
    setCurrentStep('script');

    scriptAbortRef.current = new AbortController();
    const signal = scriptAbortRef.current.signal;

    if (!appConfig.openRouterKey) {
      logger.error('Store', 'OpenRouter API key required. Add it in Settings.');
      updateStepStatus('script', 'error');
      setProcessingMessage('OpenRouter API key required. Add it in Settings.');
      setProcessingProgress(0);
      return null;
    }

    try {
      const newProject = await executeGenerateScript(config, appConfig, signal, getProgressCallbacks());
      if (!newProject) {
        // Cancelled
        updateStepStatus('script', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }

      setProject(newProject);
      updateStepStatus('script', 'complete');
      updateStepStatus('media', 'active');
      setProcessingProgress(0);
      setProcessingMessage('');
      return newProject;
    } catch (err) {
      updateStepStatus('script', 'error');
      setProcessingMessage(`Script generation failed: ${(err as Error).message}`);
      setProcessingProgress(0);
      return null;
    }
  }, [updateStepStatus, appConfig, setCurrentStep, setProject, setProcessingProgress, setProcessingMessage, getProgressCallbacks, scriptAbortRef]);

  const sourceMedia = useCallback(async (projectOverride?: VideoProject) => {
    const activeProject = projectOverride ?? project;
    if (!activeProject || sourcingRef.current) return null;
    sourcingRef.current = true;

    // Safety timeout — reset sourcingRef if stuck for >60s
    const sourcingTimeout = window.setTimeout(() => {
      if (sourcingRef.current) {
        logger.warn('Store', 'sourcingRef safety timeout: resetting after 60s');
        sourcingRef.current = false;
      }
    }, 60_000);

    mediaAbortRef.current = new AbortController();
    const signal = mediaAbortRef.current.signal;

    try {
      updateStepStatus('media', 'processing');
      setCurrentStep('media');

      const updatedProject = await executeSourceMedia(activeProject, appConfig, signal, getProgressCallbacks());
      if (!updatedProject) {
        updateStepStatus('media', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }

      setProject((prev) => (prev ? {
        ...prev,
        media: updatedProject.media,
        topicContext: updatedProject.topicContext,
        visualPlans: updatedProject.visualPlans,
      } : updatedProject));
      updateStepStatus('media', 'complete');
      updateStepStatus('narration', 'active');
      setProcessingProgress(0);
      setProcessingMessage('');

      return updatedProject;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.info('Store', 'Media sourcing cancelled by user');
        sourcingRef.current = false;
        updateStepStatus('media', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }
      logger.error('Store', 'sourceMedia failed', err);
      updateStepStatus('media', 'error');
      setProcessingMessage(`Media sourcing failed: ${(err as Error).message}`);
      return null;
    } finally {
      sourcingRef.current = false;
      window.clearTimeout(sourcingTimeout);
    }
  }, [project, updateStepStatus, appConfig, setCurrentStep, setProject, setProcessingProgress, setProcessingMessage, getProgressCallbacks, sourcingRef, mediaAbortRef]);

  const replaceMediaAsset = useCallback(async (assetId: string) => {
    if (!project) return;

    try {
      const updatedProject = await executeReplaceMediaAsset(project, assetId, appConfig);
      if (updatedProject) {
        setProject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            topicContext: updatedProject.topicContext,
            visualPlans: updatedProject.visualPlans,
            media: updatedProject.media,
          };
        });
      }
    } catch (err) {
      logger.error('Store', 'replaceMediaAsset failed', err);
    }
  }, [project, appConfig, setProject]);

  const generateNarration = useCallback(async (projectOverride?: VideoProject) => {
    const activeProject = projectOverride ?? project;
    if (!activeProject) return null;

    updateStepStatus('narration', 'processing');
    setCurrentStep('narration');

    narrationAbortRef.current = new AbortController();
    const signal = narrationAbortRef.current.signal;

    try {
      const updatedProject = await executeGenerateNarration(activeProject, appConfig, signal, getProgressCallbacks());
      if (!updatedProject) {
        updateStepStatus('narration', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }

      setProject((prev) => {
        if (!prev) return updatedProject;
        // Revoke old narration blob URLs
        prev.narration.forEach((clip) => {
          if (clip.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(clip.audioUrl);
        });
        return { ...prev, narration: updatedProject.narration };
      });
      updateStepStatus('narration', 'complete');
      updateStepStatus('ai_edit', 'active');
      setProcessingProgress(0);
      setProcessingMessage('Narration ready. Audio generated for all segments.');
      return updatedProject;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.info('Store', 'Narration generation cancelled by user');
        updateStepStatus('narration', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }
      logger.error('Store', 'Narration generation failed', err);
      updateStepStatus('narration', 'error');
      setProcessingMessage(`Narration failed: ${(err as Error).message}`);
      setProcessingProgress(0);
      return null;
    }
  }, [project, updateStepStatus, appConfig, setCurrentStep, setProject, setProcessingProgress, setProcessingMessage, getProgressCallbacks, narrationAbortRef]);

  const runAIEdit = useCallback(async (projectOverride?: VideoProject) => {
    const activeProject = projectOverride ?? project;
    if (!activeProject) return null;

    updateStepStatus('ai_edit', 'processing');
    setCurrentStep('ai_edit');

    aiEditAbortRef.current = new AbortController();
    const signal = aiEditAbortRef.current.signal;

    try {
      const editedProject = await executeRunAIEdit(activeProject, appConfig.openRouterKey, signal, getProgressCallbacks());
      if (!editedProject) {
        updateStepStatus('ai_edit', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }

      setProject((prev) => (prev ? { ...prev, ...editedProject } : editedProject));
      updateStepStatus('ai_edit', 'complete');
      updateStepStatus('assembly', 'active');
      setProcessingProgress(0);
      setProcessingMessage('');
      return editedProject;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.info('Store', 'AI edit cancelled by user');
        updateStepStatus('ai_edit', 'active');
        setProcessingProgress(0);
        setProcessingMessage('');
        return null;
      }
      logger.error('Store', 'AI edit pass failed', err);
      updateStepStatus('ai_edit', 'error');
      setProcessingMessage(`AI edit failed: ${(err as Error).message}`);
      setProcessingProgress(0);
      return null;
    }
  }, [project, appConfig.openRouterKey, updateStepStatus, setCurrentStep, setProject, setProcessingProgress, setProcessingMessage, getProgressCallbacks, aiEditAbortRef]);

  const skipAIEdit = useCallback(() => {
    updateStepStatus('ai_edit', 'complete');
    updateStepStatus('assembly', 'active');
    setCurrentStep('assembly');
  }, [updateStepStatus, setCurrentStep]);

  const assembleVideo = useCallback(async (exportOptions?: { quality?: 'draft' | 'standard' | 'high'; format?: 'webm' | 'mp4' }, projectOverride?: VideoProject) => {
    const activeProject = projectOverride ?? project;
    if (!activeProject) return null;

    updateStepStatus('assembly', 'processing');
    setCurrentStep('assembly');
    let renderSucceeded = false;
    let updatedProject: VideoProject | null = null;

    renderAbortRef.current = new AbortController();

    try {
      updatedProject = await executeAssembleVideo(
        activeProject,
        appConfig,
        renderAbortRef.current.signal,
        getProgressCallbacks(),
        exportOptions,
      );

      if (updatedProject) {
        setProject((prev) => (prev ? {
          ...prev,
          script: updatedProject!.script,
          status: 'complete',
          thumbnail: updatedProject!.thumbnail,
          exportSettings: updatedProject!.exportSettings,
          blindReview: updatedProject!.blindReview,
        } : updatedProject));

        updateStepStatus('assembly', 'complete');
        updateStepStatus('preview', 'active');
        setCurrentStep('preview');
        renderSucceeded = true;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if ((err as Error).name === 'AbortError' || msg === 'Cancelled') {
        logger.info('Store', 'Render cancelled by user');
        updateStepStatus('assembly', 'active');
        setProcessingProgress(0);
        setProcessingMessage('Render cancelled.');
      } else {
        logger.error('Store', 'Video render failed', err);
        updateStepStatus('assembly', 'error');
        setProcessingMessage(`Render failed: ${msg}`);
        setProcessingProgress(0);
      }
    }

    if (renderSucceeded) {
      setProcessingProgress(0);
      setProcessingMessage('');
    }
    return updatedProject;
  }, [project, updateStepStatus, appConfig, setCurrentStep, setProject, setProcessingProgress, setProcessingMessage, getProgressCallbacks, renderAbortRef]);

  const cancelRender = useCallback(() => {
    renderAbortRef.current?.abort();
    updateStepStatus('assembly', 'active');
    setProcessingProgress(0);
    setProcessingMessage('Render cancelled.');
  }, [updateStepStatus, setProcessingProgress, setProcessingMessage, renderAbortRef]);

  const cancelCurrentOperation = useCallback(() => {
    if (stepStatuses.script === 'processing') {
      scriptAbortRef.current?.abort();
      updateStepStatus('script', 'active');
    } else if (stepStatuses.media === 'processing') {
      mediaAbortRef.current?.abort();
      updateStepStatus('media', 'active');
    } else if (stepStatuses.narration === 'processing') {
      narrationAbortRef.current?.abort();
      updateStepStatus('narration', 'active');
    } else if (stepStatuses.ai_edit === 'processing') {
      aiEditAbortRef.current?.abort();
      updateStepStatus('ai_edit', 'active');
    } else if (stepStatuses.assembly === 'processing') {
      renderAbortRef.current?.abort();
      updateStepStatus('assembly', 'active');
    } else {
      return;
    }
    setProcessingProgress(0);
    setProcessingMessage('');
  }, [stepStatuses, updateStepStatus, setProcessingProgress, setProcessingMessage, scriptAbortRef, mediaAbortRef, narrationAbortRef, aiEditAbortRef, renderAbortRef]);

  const retryAssemble = useCallback(async (exportOptions?: { quality?: 'draft' | 'standard' | 'high'; format?: 'webm' | 'mp4' }) => {
    if (!project) return null;
    setProcessingProgress(0);
    setProcessingMessage('');
    return assembleVideo(exportOptions, project);
  }, [project, assembleVideo, setProcessingProgress, setProcessingMessage]);

  const resetProject = useCallback(() => {
    stopSpeaking();
    resetUsedUrlsMap();

    // Revoke blob URLs from the current project to free memory
    if (project) {
      if (project.thumbnail && project.thumbnail.startsWith('blob:')) {
        URL.revokeObjectURL(project.thumbnail);
      }
      for (const clip of project.narration) {
        if (clip.audioUrl && clip.audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(clip.audioUrl);
        }
      }
    }

    setProject(null);
    setCurrentStep('topic');
    setStepStatuses({
      topic: 'active',
      script: 'idle',
      media: 'idle',
      narration: 'idle',
      ai_edit: 'idle',
      assembly: 'idle',
      preview: 'idle',
    });
    setProcessingProgress(0);
    setProcessingMessage('');
    setTopicConfig({
      topic: '',
      style: 'business_insider',
      targetDuration: 8,
      tone: 'informative',
      audience: 'General audience interested in current events',
    });
  }, [project, setProject, setCurrentStep, setStepStatuses, setProcessingProgress, setProcessingMessage, setTopicConfig]);

  const saveProject = useCallback(() => {
    if (!project) return;
    try {
      const data = {
        project,
        topicConfig,
        stepStatuses,
        currentStep,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('autotube_project', JSON.stringify(data));
      logger.success('Store', 'Project saved to local storage');
    } catch (err) {
      logger.warn('Store', 'Failed to save project to localStorage (possible quota exceeded)', err);
    }
  }, [project, topicConfig, stepStatuses, currentStep]);

  // Debounced auto-save
  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      saveProject();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [project, topicConfig, stepStatuses, currentStep, saveProject]);

  // Persist project to /tmp/autotube-project-{id}.json via dev-server endpoint
  useEffect(() => {
    if (!project) return;
    fetch(`/api/save-project?id=${encodeURIComponent(project.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }).catch(() => {});
  }, [project]);

  const loadProject = useCallback(() => {
    try {
      const stored = localStorage.getItem('autotube_project');
      if (!stored) return false;

      let data: unknown;
      try {
        data = JSON.parse(stored);
      } catch {
        logger.warn('Store', 'localStorage contained invalid JSON for autotube_project — falling back to fresh state');
        return false;
      }

      const validated = validateStoredProject(data);
      if (!validated) {
        logger.warn('Store', 'Stored project failed validation — falling back to fresh state');
        return false;
      }

      const storedConfig = (data as Record<string, unknown>);
      setProject(validated.project);
      setTopicConfig(validated.topicConfig);
      setStepStatuses(validated.stepStatuses);
      setCurrentStep(validated.currentStep);

      // Check if any steps were reset from 'processing'
      const originalStatuses = (storedConfig.stepStatuses || {}) as Record<string, string>;
      const resetSteps = PIPELINE_STEPS.filter(
        (step) => originalStatuses[step] === 'processing' && validated.stepStatuses[step] === 'active',
      );
      if (resetSteps.length > 0) {
        logger.warn('Store', `Interrupted operations detected on reload — reset steps: ${resetSteps.join(', ')}`);
        setProcessingMessage(`Previous operation was interrupted. Reset steps: ${resetSteps.join(', ')}`);
      }

      logger.success('Store', 'Project loaded from local storage');
      return true;
    } catch (err) {
      logger.error('Store', 'Failed to load project', err);
    }
    return false;
  }, [setProject, setTopicConfig, setStepStatuses, setCurrentStep, setProcessingMessage]);

  // ── Batch processing ──
  const batchGenerate = useCallback(async (jobs: { topic: string; config: Omit<TopicConfig, 'topic'> }[]) => {
    const initialJobs: import('../services/batchProcessor').BatchJob[] = jobs.map((j, i) => ({
      id: `batch-${Date.now()}-${i}`,
      topic: j.topic,
      config: { ...j.config, topic: j.topic },
      status: 'pending' as const,
    }));
    setBatchJobs(initialJobs);
    setIsBatchProcessing(true);
    resetUsedUrlsMap();

    for (let i = 0; i < initialJobs.length; i++) {
      const job = initialJobs[i];

      initialJobs[i] = { ...job, status: 'running', startedAt: new Date() };
      setBatchJobs([...initialJobs]);

      try {
        const fullConfig: TopicConfig = { ...job.config };
        const scriptedProject = await generateScript(fullConfig);
        if (!scriptedProject) throw new Error('Script generation failed');
        const mediaProject = await sourceMedia(scriptedProject);
        if (!mediaProject) throw new Error('Media sourcing failed');
        const narrationProject = await generateNarration(mediaProject);
        if (!narrationProject) throw new Error('Narration generation failed');
        const editedProject = await runAIEdit(narrationProject);
        const assembled = await assembleVideo(
          { quality: 'high', format: 'mp4' },
          editedProject ?? narrationProject,
        );
        if (!assembled) throw new Error('Assembly failed');

        initialJobs[i] = { ...initialJobs[i], status: 'complete', project: assembled, completedAt: new Date() };
      } catch (err) {
        initialJobs[i] = { ...initialJobs[i], status: 'error', error: (err as Error).message, completedAt: new Date() };
      } finally {
        resetUsedUrlsMap();
      }
      setBatchJobs([...initialJobs]);
    }

    setIsBatchProcessing(false);
  }, [generateScript, sourceMedia, generateNarration, runAIEdit, assembleVideo, setBatchJobs, setIsBatchProcessing]);

  const generateFullVideo = useCallback(async (config: TopicConfig) => {
    resetUsedUrlsMap();

    const scriptedProject = await generateScript(config);
    if (!scriptedProject) return null;

    const mediaProject = await sourceMedia(scriptedProject);
    if (!mediaProject) return null;

    const narrationProject = await generateNarration(mediaProject);
    if (!narrationProject) return null;

    const editedProject = await runAIEdit(narrationProject);

    return await assembleVideo(
      { quality: 'high', format: 'mp4' },
      editedProject ?? narrationProject,
    );
  }, [generateScript, sourceMedia, generateNarration, runAIEdit, assembleVideo]);

  return {
    currentStep,
    setCurrentStep,
    stepStatuses,
    project,
    topicConfig,
    setTopicConfig,
    processingProgress,
    processingMessage,
    generateScript,
    sourceMedia,
    replaceMediaAsset,
    generateNarration,
    runAIEdit,
    skipAIEdit,
    assembleVideo,
    generateFullVideo,
    cancelRender,
    cancelCurrentOperation,
    retryAssemble,
    resetProject,
    saveProject,
    loadProject,
    logs,
    appConfig,
    setAppConfig,
    updateNarrationText,
    batchJobs,
    isBatchProcessing,
    batchGenerate,
    // CR-1: secure key management
    isUnlocked,
    hasEncryptedKeys,
    pinError,
    unlockConfig,
    clearSavedKeys,
  };
}

// Re-export for backward compatibility
export { DEFAULT_APP_CONFIG } from './slices/configSlice';
export { PIPELINE_STEPS } from './slices/pipelineSlice';
