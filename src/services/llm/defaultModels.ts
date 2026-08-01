/** Central OpenRouter defaults — keep mjs servers in sync by hand if you change these. */

export const DEFAULT_LLM_MODEL = 'xiaomi/mimo-v2.5';

/**
 * Model used for every multimodal (image_url) call — quality scoring, vision
 * checks, blind review. Must accept image content parts; swapping in a text-only
 * model silently degrades those calls to text-only guesses.
 */
export const DEFAULT_VISION_MODEL = 'xiaomi/mimo-v2.5';

/** Quality-check vision panel (slot 4). DeepSeek is text-only — judges from other reports. */
export const QUALITY_CHECK_JUDGES = [
  'xiaomi/mimo-v2.5',
  'deepseek/deepseek-v4-flash',
  'google/gemma-4-31b-it',
] as const;
