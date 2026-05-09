/**
 * Video Renderer — Barrel Export
 *
 * Re-exports the public API of the renderer module.
 */

export { renderVideoToBlob, QUALITY_PRESETS } from './orchestrator';
export type { RenderOptions, ImgCache } from './orchestrator';
export { computeVisualStyle, getFrameSampleRate } from './animation';
export type { VisualStyleType } from './animation';
export { drawProceduralBackground, draw, saturationCache } from './canvas/draw';
export { drawKineticTextOverlay, drawDiagramOverlay } from './canvas/overlays';
export { renderTransition } from './canvas/transitions';
export { drawSceneStatCard, drawSceneQuoteCard, drawSceneLeftTextRightImage, drawSceneLowerThirdOverlay, drawSceneCenteredText } from './canvas/scenes';
export { hexToRgba, roundRect, wrapText, drawTechnicalLabel } from './canvas/text';
export { preload, loadImage, buildImageSources, mkFallback, isCanvasSafeSource, evictOldestEntries } from './preload';
export { cleanupRenderResources, getSupportedMimeType, tryServerRender } from './encoding';
export type { RenderResult } from './encoding';
export { IMG_CACHE_MAX, MAX_FRAMES } from './orchestrator';
