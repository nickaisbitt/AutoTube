// Feature: codebase-refactor, Property 2: State slice isolation
//
// For any state slice action invocation, only the state fields belonging to
// that slice SHALL change — all other slice state fields SHALL remain strictly
// equal (by reference) to their values before the action.
//
// **Validates: Requirements 2.5**

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';
import { useProjectSlice } from '../slices/projectSlice';
import { usePipelineSlice } from '../slices/pipelineSlice';
import { useConfigSlice } from '../slices/configSlice';
import { useNarrationSlice } from '../slices/narrationSlice';
import { useUISlice } from '../slices/uiSlice';
import type { ScriptSegment, VideoProject, PipelineStep, StepStatus } from '../../types';

// ── Mocks ──

vi.mock('../../services/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  subscribeToLogs: vi.fn(() => () => {}),
}));

vi.mock('../../utils/secureStorage', () => ({
  hasEncryptedConfig: vi.fn(() => false),
  loadEncryptedBlob: vi.fn(() => null),
  loadConfigFromSession: vi.fn(() => null),
  saveConfigToSession: vi.fn(),
  clearEncryptedConfig: vi.fn(),
  clearSessionConfig: vi.fn(),
  persistEncryptedConfig: vi.fn(),
  decryptConfig: vi.fn(),
}));

// ── Arbitraries ──

const segmentArb: fc.Arbitrary<ScriptSegment> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('intro', 'section', 'transition', 'outro') as fc.Arbitrary<ScriptSegment['type']>,
  title: fc.string({ minLength: 1, maxLength: 50 }),
  narration: fc.string({ minLength: 1, maxLength: 200 }),
  visualNote: fc.string({ minLength: 0, maxLength: 100 }),
  duration: fc.integer({ min: 1, max: 30 }),
});

const projectArb: fc.Arbitrary<VideoProject> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  topic: fc.string({ minLength: 1, maxLength: 100 }),
  style: fc.constantFrom('business_insider', 'warfront', 'documentary', 'explainer'),
  script: fc.array(segmentArb, { minLength: 1, maxLength: 5 }),
  media: fc.constant([]),
  narration: fc.constant([]),
  status: fc.constantFrom('draft', 'complete'),
  createdAt: fc.constant(new Date().toISOString()),
  version: fc.constant(1),
  targetDuration: fc.integer({ min: 1, max: 60 }),
}) as unknown as fc.Arbitrary<VideoProject>;

const pipelineStepArb: fc.Arbitrary<PipelineStep> = fc.constantFrom(
  'topic', 'script', 'media', 'narration', 'ai_edit', 'assembly', 'preview',
);

const stepStatusArb: fc.Arbitrary<StepStatus> = fc.constantFrom(
  'idle', 'active', 'processing', 'complete', 'error',
);

// ── Tests ──

describe('Property 2: State slice isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('projectSlice actions do not affect pipeline/config/narration/ui slices', async () => {
    await fc.assert(
      fc.asyncProperty(projectArb, segmentArb, async (proj, segment) => {
        // Render all slices together in a single hook to simulate shared context
        const { result } = renderHook(() => ({
          project: useProjectSlice(),
          pipeline: usePipelineSlice(),
          config: useConfigSlice(),
          narration: useNarrationSlice(),
          ui: useUISlice(),
        }));

        // Capture state of other slices before project actions
        const pipelineBefore = {
          currentStep: result.current.pipeline.currentStep,
          stepStatuses: result.current.pipeline.stepStatuses,
          processingProgress: result.current.pipeline.processingProgress,
          processingMessage: result.current.pipeline.processingMessage,
        };
        const configBefore = {
          appConfig: result.current.config.appConfig,
          isUnlocked: result.current.config.isUnlocked,
          hasEncryptedKeys: result.current.config.hasEncryptedKeys,
          pinError: result.current.config.pinError,
        };
        const narrationBefore = {
          sourcingRef: result.current.narration.sourcingRef.current,
        };
        const uiBefore = {
          logs: result.current.ui.logs,
          batchJobs: result.current.ui.batchJobs,
          isBatchProcessing: result.current.ui.isBatchProcessing,
        };

        // Execute project slice actions
        act(() => {
          result.current.project.setProject(proj);
        });
        act(() => {
          result.current.project.setTopicConfig({
            topic: 'test topic',
            style: 'documentary',
            targetDuration: 5,
            tone: 'dramatic',
            audience: 'tech enthusiasts',
          });
        });
        act(() => {
          result.current.project.updateSegment(proj.script[0].id, { title: segment.title });
        });

        // Verify other slices are unchanged
        const pipelineAfter = {
          currentStep: result.current.pipeline.currentStep,
          stepStatuses: result.current.pipeline.stepStatuses,
          processingProgress: result.current.pipeline.processingProgress,
          processingMessage: result.current.pipeline.processingMessage,
        };
        const configAfter = {
          appConfig: result.current.config.appConfig,
          isUnlocked: result.current.config.isUnlocked,
          hasEncryptedKeys: result.current.config.hasEncryptedKeys,
          pinError: result.current.config.pinError,
        };
        const narrationAfter = {
          sourcingRef: result.current.narration.sourcingRef.current,
        };
        const uiAfter = {
          logs: result.current.ui.logs,
          batchJobs: result.current.ui.batchJobs,
          isBatchProcessing: result.current.ui.isBatchProcessing,
        };

        expect(pipelineAfter.currentStep).toBe(pipelineBefore.currentStep);
        expect(pipelineAfter.stepStatuses).toBe(pipelineBefore.stepStatuses);
        expect(pipelineAfter.processingProgress).toBe(pipelineBefore.processingProgress);
        expect(pipelineAfter.processingMessage).toBe(pipelineBefore.processingMessage);
        expect(configAfter.appConfig).toBe(configBefore.appConfig);
        expect(configAfter.isUnlocked).toBe(configBefore.isUnlocked);
        expect(configAfter.hasEncryptedKeys).toBe(configBefore.hasEncryptedKeys);
        expect(configAfter.pinError).toBe(configBefore.pinError);
        expect(narrationAfter.sourcingRef).toBe(narrationBefore.sourcingRef);
        expect(uiAfter.logs).toBe(uiBefore.logs);
        expect(uiAfter.batchJobs).toBe(uiBefore.batchJobs);
        expect(uiAfter.isBatchProcessing).toBe(uiBefore.isBatchProcessing);
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it('pipelineSlice actions do not affect project/config/narration/ui slices', async () => {
    await fc.assert(
      fc.asyncProperty(pipelineStepArb, stepStatusArb, async (step, status) => {
        const { result } = renderHook(() => ({
          project: useProjectSlice(),
          pipeline: usePipelineSlice(),
          config: useConfigSlice(),
          narration: useNarrationSlice(),
          ui: useUISlice(),
        }));

        // Capture state of other slices before pipeline actions
        const projectBefore = {
          project: result.current.project.project,
          topicConfig: result.current.project.topicConfig,
        };
        const configBefore = {
          appConfig: result.current.config.appConfig,
          isUnlocked: result.current.config.isUnlocked,
          hasEncryptedKeys: result.current.config.hasEncryptedKeys,
          pinError: result.current.config.pinError,
        };
        const narrationBefore = {
          sourcingRef: result.current.narration.sourcingRef.current,
        };
        const uiBefore = {
          logs: result.current.ui.logs,
          batchJobs: result.current.ui.batchJobs,
          isBatchProcessing: result.current.ui.isBatchProcessing,
        };

        // Execute pipeline slice actions
        act(() => {
          result.current.pipeline.setCurrentStep(step);
        });
        act(() => {
          result.current.pipeline.updateStepStatus(step, status);
        });

        // Verify other slices are unchanged
        expect(result.current.project.project).toBe(projectBefore.project);
        expect(result.current.project.topicConfig).toBe(projectBefore.topicConfig);
        expect(result.current.config.appConfig).toBe(configBefore.appConfig);
        expect(result.current.config.isUnlocked).toBe(configBefore.isUnlocked);
        expect(result.current.config.hasEncryptedKeys).toBe(configBefore.hasEncryptedKeys);
        expect(result.current.config.pinError).toBe(configBefore.pinError);
        expect(result.current.narration.sourcingRef.current).toBe(narrationBefore.sourcingRef);
        expect(result.current.ui.logs).toBe(uiBefore.logs);
        expect(result.current.ui.batchJobs).toBe(uiBefore.batchJobs);
        expect(result.current.ui.isBatchProcessing).toBe(uiBefore.isBatchProcessing);
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it('configSlice actions do not affect project/pipeline/narration/ui slices', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (key) => {
        const { result } = renderHook(() => ({
          project: useProjectSlice(),
          pipeline: usePipelineSlice(),
          config: useConfigSlice(),
          narration: useNarrationSlice(),
          ui: useUISlice(),
        }));

        // Capture state of other slices before config actions
        const projectBefore = {
          project: result.current.project.project,
          topicConfig: result.current.project.topicConfig,
        };
        const pipelineBefore = {
          currentStep: result.current.pipeline.currentStep,
          stepStatuses: result.current.pipeline.stepStatuses,
          processingProgress: result.current.pipeline.processingProgress,
          processingMessage: result.current.pipeline.processingMessage,
        };
        const narrationBefore = {
          sourcingRef: result.current.narration.sourcingRef.current,
        };
        const uiBefore = {
          logs: result.current.ui.logs,
          batchJobs: result.current.ui.batchJobs,
          isBatchProcessing: result.current.ui.isBatchProcessing,
        };

        // Execute config slice action
        await act(async () => {
          await result.current.config.setAppConfig({
            openRouterKey: key,
            sourceType: 'stock',
            flickrKey: '',
            ttsVoice: 'af_heart',
          });
        });

        // Verify other slices are unchanged
        expect(result.current.project.project).toBe(projectBefore.project);
        expect(result.current.project.topicConfig).toBe(projectBefore.topicConfig);
        expect(result.current.pipeline.currentStep).toBe(pipelineBefore.currentStep);
        expect(result.current.pipeline.stepStatuses).toBe(pipelineBefore.stepStatuses);
        expect(result.current.pipeline.processingProgress).toBe(pipelineBefore.processingProgress);
        expect(result.current.pipeline.processingMessage).toBe(pipelineBefore.processingMessage);
        expect(result.current.narration.sourcingRef.current).toBe(narrationBefore.sourcingRef);
        expect(result.current.ui.logs).toBe(uiBefore.logs);
        expect(result.current.ui.batchJobs).toBe(uiBefore.batchJobs);
        expect(result.current.ui.isBatchProcessing).toBe(uiBefore.isBatchProcessing);
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it('uiSlice actions do not affect project/pipeline/config/narration slices', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          id: fc.uuid(),
          level: fc.constantFrom('info', 'warn', 'error', 'success') as fc.Arbitrary<'info' | 'warn' | 'error' | 'success'>,
          source: fc.string({ minLength: 1, maxLength: 20 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
          timestamp: fc.constant(new Date().toISOString()),
        }), { minLength: 0, maxLength: 5 }),
        async (logs) => {
          const { result } = renderHook(() => ({
            project: useProjectSlice(),
            pipeline: usePipelineSlice(),
            config: useConfigSlice(),
            narration: useNarrationSlice(),
            ui: useUISlice(),
          }));

          // Capture state of other slices before UI actions
          const projectBefore = {
            project: result.current.project.project,
            topicConfig: result.current.project.topicConfig,
          };
          const pipelineBefore = {
            currentStep: result.current.pipeline.currentStep,
            stepStatuses: result.current.pipeline.stepStatuses,
            processingProgress: result.current.pipeline.processingProgress,
            processingMessage: result.current.pipeline.processingMessage,
          };
          const configBefore = {
            appConfig: result.current.config.appConfig,
            isUnlocked: result.current.config.isUnlocked,
            hasEncryptedKeys: result.current.config.hasEncryptedKeys,
            pinError: result.current.config.pinError,
          };
          const narrationBefore = {
            sourcingRef: result.current.narration.sourcingRef.current,
          };

          // Execute UI slice actions
          act(() => {
            result.current.ui.setLogs(logs);
          });
          act(() => {
            result.current.ui.setBatchJobs([]);
          });
          act(() => {
            result.current.ui.setIsBatchProcessing(true);
          });

          // Verify other slices are unchanged
          expect(result.current.project.project).toBe(projectBefore.project);
          expect(result.current.project.topicConfig).toBe(projectBefore.topicConfig);
          expect(result.current.pipeline.currentStep).toBe(pipelineBefore.currentStep);
          expect(result.current.pipeline.stepStatuses).toBe(pipelineBefore.stepStatuses);
          expect(result.current.pipeline.processingProgress).toBe(pipelineBefore.processingProgress);
          expect(result.current.pipeline.processingMessage).toBe(pipelineBefore.processingMessage);
          expect(result.current.config.appConfig).toBe(configBefore.appConfig);
          expect(result.current.config.isUnlocked).toBe(configBefore.isUnlocked);
          expect(result.current.config.hasEncryptedKeys).toBe(configBefore.hasEncryptedKeys);
          expect(result.current.config.pinError).toBe(configBefore.pinError);
          expect(result.current.narration.sourcingRef.current).toBe(narrationBefore.sourcingRef);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
