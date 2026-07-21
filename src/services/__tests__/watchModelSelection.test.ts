import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const WATCH_MODEL_ENV = [
  'AUTOTUBE_WATCH_MODEL',
  'AUTOTUBE_EVAL_COLD',
  'OPENROUTER_MODEL',
  'OPENROUTER_VISION_MODEL',
] as const;

function clearEnv() {
  for (const k of WATCH_MODEL_ENV) delete process.env[k];
}

describe('resolveWatchModel — independent blind judge selection', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('falls back to the generation default model outside cold eval', async () => {
    const { resolveWatchModel, isIndependentWatchJudge } = await import(
      '../../../powers/video-watcher/src/vision-brutal.mjs'
    );
    expect(resolveWatchModel(process.env)).toBe('xiaomi/mimo-v2.5');
    expect(isIndependentWatchJudge(process.env)).toBe(false);
  });

  it('uses the generation model (not the cold default) when not in cold eval', async () => {
    process.env.OPENROUTER_MODEL = 'some/gen-model';
    const { resolveWatchModel, isIndependentWatchJudge } = await import(
      '../../../powers/video-watcher/src/vision-brutal.mjs'
    );
    expect(resolveWatchModel(process.env)).toBe('some/gen-model');
    expect(isIndependentWatchJudge(process.env)).toBe(false);
  });

  it('defaults cold eval to an independent vision model distinct from generation', async () => {
    process.env.AUTOTUBE_EVAL_COLD = '1';
    const { resolveWatchModel, isIndependentWatchJudge, COLD_EVAL_DEFAULT_WATCH_MODEL } =
      await import('../../../powers/video-watcher/src/vision-brutal.mjs');
    expect(resolveWatchModel(process.env)).toBe(COLD_EVAL_DEFAULT_WATCH_MODEL);
    expect(COLD_EVAL_DEFAULT_WATCH_MODEL).not.toBe('xiaomi/mimo-v2.5');
    expect(isIndependentWatchJudge(process.env)).toBe(true);
  });

  it('honors an explicit AUTOTUBE_WATCH_MODEL over the cold default', async () => {
    process.env.AUTOTUBE_EVAL_COLD = '1';
    process.env.AUTOTUBE_WATCH_MODEL = 'custom/judge-model';
    const { resolveWatchModel, isIndependentWatchJudge } = await import(
      '../../../powers/video-watcher/src/vision-brutal.mjs'
    );
    expect(resolveWatchModel(process.env)).toBe('custom/judge-model');
    expect(isIndependentWatchJudge(process.env)).toBe(true);
  });

  it('reports same-model (not independent) when the explicit judge equals generation', async () => {
    process.env.OPENROUTER_MODEL = 'xiaomi/mimo-v2.5';
    process.env.AUTOTUBE_WATCH_MODEL = 'xiaomi/mimo-v2.5';
    const { resolveWatchModel, isIndependentWatchJudge } = await import(
      '../../../powers/video-watcher/src/vision-brutal.mjs'
    );
    expect(resolveWatchModel(process.env)).toBe('xiaomi/mimo-v2.5');
    expect(isIndependentWatchJudge(process.env)).toBe(false);
  });
});
