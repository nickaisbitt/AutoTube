export { checkContentLength } from './contentLengthCheck';
export type { ContentLengthResult } from './contentLengthCheck';

export { validateMimeType, validateMimeTypeFromUrl, VALID_IMAGE_TYPES, VALID_VIDEO_TYPES } from './mimeTypeCheck';
export type { MimeTypeResult } from './mimeTypeCheck';

export { detectWatermarkRegions, computeWatermarkScore, isLikelyWatermarked } from './watermarkHeatmap';
export type { WatermarkRegion } from './watermarkHeatmap';

export { analyzeContrast } from './contrastAnalyzer';
export type { ContrastResult } from './contrastAnalyzer';

export { computeTextDensity } from './textDensityCheck';
export type { TextDensityResult } from './textDensityCheck';

export { searchTinEye, searchGoogleLens, verifyImageOriginality } from './reverseImageSearch';
export type { ReverseSearchResult } from './reverseImageSearch';

export { traceRedirects, isDomainBlocked } from './redirectTrace';
export type { RedirectTraceResult } from './redirectTrace';

export { extractPalette, computePaletteBonus } from './colorPalette';
export type { ColorPalette } from './colorPalette';

export { computePHash, hammingDistance, isDuplicate, PhashRegistry } from './phashDuplicate';
