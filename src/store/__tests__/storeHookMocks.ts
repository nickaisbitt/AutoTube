/**
 * Shared vi.mock registrations for useVideoProject() integration tests.
 * Import at the top of any test file: import '../../store/__tests__/storeHookMocks';
 */
import { vi } from 'vitest';

const llmMock = vi.hoisted(() => ({
  generateAIScript: vi.fn(),
  reviewAndImproveScript: vi.fn(async (segs: unknown) => segs),
  refineScriptMultiPass: vi.fn(async (segs: unknown) => segs),
  generateVideoTitle: vi.fn(async () => 'Test Title'),
  generateSeriesMetadata: vi.fn(),
  generatePinnedComments: vi.fn(),
  generateHashtags: vi.fn(),
  mapEmotionalArc: vi.fn(() => [{ emotion: 'curiosity', segmentIndex: 0, intensity: 0.5 }]),
  validateStoryArc: vi.fn(() => ({ passed: true, score: 100, issues: [] })),
}));

vi.mock('../../services/llm', () => llmMock);
vi.mock('../../services/llm/index', () => llmMock);

vi.mock('../../services/llm/titleGenerator', () => ({
  generateTitleVariants: vi.fn(() => Promise.resolve({
    direct: 'Direct Title',
    curiosityGap: 'Curiosity Gap Title',
    emotionalUrgent: 'Emotional Urgent Title',
  })),
}));

vi.mock('../../services/renderingShared', () => ({
  assignSceneLayouts: vi.fn((segs: unknown[]) => (segs as unknown[]).map(() => 'centered-text')),
  scheduleRetentionBeats: vi.fn(() => []),
}));

vi.mock('../../services/seoTitles', () => ({
  extractHookLine: vi.fn(() => 'Your money and passwords could be stolen'),
  resolveProjectHookLine: vi.fn(() => 'Your money and passwords could be stolen'),
  syncIntroNarrationToHook: vi.fn((narration: string, hook: string) =>
    narration.toLowerCase().includes('money') ? narration : `${hook}. ${narration}`),
}));

vi.mock('../../services/thumbnail', () => ({
  prepareThumbnailConcepts: vi.fn(() => ({
    concepts: [{ id: 'fear', label: 'Fear', prompt: 'test' }],
    selected: 'fear',
  })),
}));

vi.mock('../../services/blindReview', () => ({
  runBlindReview: vi.fn(async () => ({
    overallScore: 9.5,
    passed: true,
    dimensions: [],
    scores: {
      thumbnailEffectiveness: 9,
      visualQuality: 9,
      overallProductionValue: 9,
      pacing: 9,
      hookStrength: 9,
    },
  })),
}));

vi.mock('../../services/projectMigrations', () => ({
  CURRENT_PROJECT_VERSION: 1,
  migrateProject: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/tts', () => ({
  generateGrokTts: vi.fn(),
  generateMeloTts: vi.fn(),
}));

vi.mock('../../services/media', () => ({
  sourceSegmentMedia: vi.fn(),
  replaceMediaAsset: vi.fn(),
  resetUsedUrlsMap: vi.fn(),
}));

vi.mock('../../services/visualPlanner', () => ({
  resolveTopicContext: vi.fn(),
  planSegmentVisuals: vi.fn(),
}));

vi.mock('../../services/renderer', () => ({
  QUALITY_PRESETS: {
    draft: { width: 854, height: 480, fps: 24 },
    standard: { width: 1280, height: 720, fps: 30 },
    high: { width: 1920, height: 1080, fps: 30 },
  },
  renderVideoToBlob: vi.fn(),
}));

vi.mock('../../services/analytics', () => ({
  trackVideoGeneration: vi.fn(),
}));

vi.mock('../../services/segmentReorderer', () => ({
  reorderForHook: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/captionUtils', () => ({
  CHART_KEYWORDS: [],
}));

vi.mock('../../services/logger', () => ({
  subscribeToLogs: vi.fn(() => () => {}),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../utils/speech', () => ({
  hasSpeechSupport: vi.fn(() => false),
  loadSpeechVoices: vi.fn(async () => []),
  pickPreferredVoice: vi.fn(() => null),
  stopSpeaking: vi.fn(),
}));

vi.mock('../../services/aiEditor', () => ({
  runAIEditPass: vi.fn(),
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
