import { queryAllProviders } from '../sourceProviders';
import { extractJsonLd, parseSrcset } from '../parsers';
import { splitIntoLayers, drawChromaticAberration } from '../visualFx';
import { computePanFilter, REVERB_PRESETS } from '../audioFx';
import { selectInterruptType, createTensionProfile } from '../hookFx';
import { predictCTR, COMMENT_BAIT_TEMPLATES } from '../growth';
import { checkContentLength, validateMimeType } from '../qualityValidation';
import { drawLowerThird, ASPECT_RATIO_DIMENSIONS } from '../advancedRender';
import { TOPIC_SEED_MAP, getTopicRelevantPicsumUrl, computeFallbackScore } from './picsumFallback';
import { resolveWikipediaHeroImage, resolveWikipediaHeroFromEntity } from './wikipediaHero';
import { computeDramaScore, reorderSegments } from './segmentReorder';
import { BEAT_EFFECT_MAP, getEffectsForBeat } from './beatIntegration';
import { SOUND_BED_PRESETS, selectSoundBedForSegment, computeSoundBedTransition } from './soundBedMapping';
import { createTransitionPlan, computeTransitionFrameCount } from './transitionRendering';
import { analyzeReviewFailure, computeRetryBudget } from './qualityRetry';
import { DRAFT_FX_PRESETS, shouldRenderEffect, getDraftConfig } from './draftModeFx';

export interface PipelineTestResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  modulesLoaded: number;
  modulesFailed: string[];
}

interface ModuleTest {
  name: string;
  test: () => void;
}

function testModule(moduleTest: ModuleTest, errors: string[], modulesFailed: string[]): boolean {
  try {
    moduleTest.test();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`${moduleTest.name}: ${message}`);
    modulesFailed.push(moduleTest.name);
    return false;
  }
}

export function runPipelineIntegrationTest(): PipelineTestResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const modulesFailed: string[] = [];
  let modulesLoaded = 0;

  const moduleTests: ModuleTest[] = [
    {
      name: 'sourceProviders',
      test: () => {
        if (typeof queryAllProviders !== 'function') {
          throw new Error('queryAllProviders not exported');
        }
      },
    },
    {
      name: 'parsers',
      test: () => {
        if (typeof extractJsonLd !== 'function') {
          throw new Error('extractJsonLd not exported');
        }
        if (typeof parseSrcset !== 'function') {
          throw new Error('parseSrcset not exported');
        }
      },
    },
    {
      name: 'visualFx',
      test: () => {
        if (typeof splitIntoLayers !== 'function') {
          throw new Error('splitIntoLayers not exported');
        }
        if (typeof drawChromaticAberration !== 'function') {
          throw new Error('drawChromaticAberration not exported');
        }
      },
    },
    {
      name: 'audioFx',
      test: () => {
        if (typeof computePanFilter !== 'function') {
          throw new Error('computePanFilter not exported');
        }
        if (typeof REVERB_PRESETS !== 'object') {
          throw new Error('REVERB_PRESETS not exported');
        }
      },
    },
    {
      name: 'hookFx',
      test: () => {
        if (typeof selectInterruptType !== 'function') {
          throw new Error('selectInterruptType not exported');
        }
        if (typeof createTensionProfile !== 'function') {
          throw new Error('createTensionProfile not exported');
        }
      },
    },
    {
      name: 'growth',
      test: () => {
        if (typeof predictCTR !== 'function') {
          throw new Error('predictCTR not exported');
        }
        if (typeof COMMENT_BAIT_TEMPLATES !== 'object') {
          throw new Error('COMMENT_BAIT_TEMPLATES not exported');
        }
      },
    },
    {
      name: 'qualityValidation',
      test: () => {
        if (typeof checkContentLength !== 'function') {
          throw new Error('checkContentLength not exported');
        }
        if (typeof validateMimeType !== 'function') {
          throw new Error('validateMimeType not exported');
        }
      },
    },
    {
      name: 'advancedRender',
      test: () => {
        if (typeof drawLowerThird !== 'function') {
          throw new Error('drawLowerThird not exported');
        }
        if (typeof ASPECT_RATIO_DIMENSIONS !== 'object') {
          throw new Error('ASPECT_RATIO_DIMENSIONS not exported');
        }
      },
    },
    {
      name: 'picsumFallback',
      test: () => {
        if (typeof TOPIC_SEED_MAP !== 'object') {
          throw new Error('TOPIC_SEED_MAP not exported');
        }
        const url = getTopicRelevantPicsumUrl('technology');
        if (typeof url !== 'string' || !url.includes('picsum.photos')) {
          throw new Error('getTopicRelevantPicsumUrl returned invalid URL');
        }
        const score = computeFallbackScore('technology', url);
        if (typeof score !== 'number') {
          throw new Error('computeFallbackScore did not return a number');
        }
      },
    },
    {
      name: 'wikipediaHero',
      test: () => {
        if (typeof resolveWikipediaHeroImage !== 'function') {
          throw new Error('resolveWikipediaHeroImage not exported');
        }
        if (typeof resolveWikipediaHeroFromEntity !== 'function') {
          throw new Error('resolveWikipediaHeroFromEntity not exported');
        }
      },
    },
    {
      name: 'segmentReorder',
      test: () => {
        const dramaScore = computeDramaScore({
          narration: 'The $5 billion crisis shocked everyone.',
          media: [{ baseScore: 200 }],
        });
        if (typeof dramaScore !== 'number' || dramaScore <= 0) {
          throw new Error('computeDramaScore returned invalid score');
        }
        const reordered = reorderSegments(
          [{ narration: 'low', media: [{ baseScore: 50 }] }, { narration: '$1B high', media: [{ baseScore: 200 }] }],
          'drama_first',
        );
        if (!Array.isArray(reordered) || reordered.length !== 2) {
          throw new Error('reorderSegments returned invalid result');
        }
      },
    },
    {
      name: 'beatIntegration',
      test: () => {
        if (typeof BEAT_EFFECT_MAP !== 'object') {
          throw new Error('BEAT_EFFECT_MAP not exported');
        }
        const effect = getEffectsForBeat('text_slam', 4);
        if (typeof effect !== 'object' || typeof effect.intensity !== 'number') {
          throw new Error('getEffectsForBeat returned invalid effect');
        }
      },
    },
    {
      name: 'soundBedMapping',
      test: () => {
        if (typeof SOUND_BED_PRESETS !== 'object') {
          throw new Error('SOUND_BED_PRESETS not exported');
        }
        const bed = selectSoundBedForSegment('risk', 4, 8);
        if (typeof bed !== 'string') {
          throw new Error('selectSoundBedForSegment did not return a string');
        }
        const transition = computeSoundBedTransition('tense', 'calm');
        if (typeof transition.crossfadeDuration !== 'number') {
          throw new Error('computeSoundBedTransition returned invalid result');
        }
      },
    },
    {
      name: 'transitionRendering',
      test: () => {
        const plans = createTransitionPlan({ transitions: [{ type: 'fade' }] }, 3);
        if (!Array.isArray(plans) || plans.length !== 2) {
          throw new Error('createTransitionPlan returned invalid result');
        }
        const frameCount = computeTransitionFrameCount(plans[0], 24);
        if (typeof frameCount !== 'number' || frameCount < 1) {
          throw new Error('computeTransitionFrameCount returned invalid count');
        }
      },
    },
    {
      name: 'qualityRetry',
      test: () => {
        const actions = analyzeReviewFailure(3, 'The video is too dark and the audio is muffled');
        if (!Array.isArray(actions) || actions.length === 0) {
          throw new Error('analyzeReviewFailure returned no actions');
        }
        const budget = computeRetryBudget(2);
        if (typeof budget.maxCorrections !== 'number') {
          throw new Error('computeRetryBudget returned invalid result');
        }
      },
    },
    {
      name: 'draftModeFx',
      test: () => {
        if (typeof DRAFT_FX_PRESETS !== 'object') {
          throw new Error('DRAFT_FX_PRESETS not exported');
        }
        const shouldRender = shouldRenderEffect('subtitles', true);
        if (typeof shouldRender !== 'boolean') {
          throw new Error('shouldRenderEffect did not return a boolean');
        }
        const config = getDraftConfig('minimal');
        if (config.qualityLevel !== 'minimal') {
          throw new Error('getDraftConfig returned wrong level');
        }
      },
    },
  ];

  for (const moduleTest of moduleTests) {
    const success = testModule(moduleTest, errors, modulesFailed);
    if (success) {
      modulesLoaded++;
    }
  }

  if (modulesFailed.length > 0) {
    warnings.push(`${modulesFailed.length} module(s) failed to load: ${modulesFailed.join(', ')}`);
  }

  return {
    passed: modulesFailed.length === 0,
    errors,
    warnings,
    modulesLoaded,
    modulesFailed,
  };
}
