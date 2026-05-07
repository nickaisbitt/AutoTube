/**
 * Background Music Mixer
 *
 * Web Audio API-based mixer that layers music under narration with ducking.
 * Implements gain automation for smooth volume transitions between narration
 * and gap states, with fade-in/fade-out at video boundaries.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrationTiming {
  start: number; // seconds
  end: number;   // seconds
}

export interface MixerConfig {
  /** Path to music track */
  musicUrl: string;
  /** Narration clip timings for ducking envelope */
  narrationClips: NarrationTiming[];
  /** Volume level during narration (0.15–0.20) */
  duckingLevel: number;
  /** Volume level during gaps (0.60–0.80) */
  peakLevel: number;
  /** Fade-in duration at video start in ms */
  fadeInMs: number;
  /** Fade-out duration at video end in ms */
  fadeOutMs: number;
  /** Crossfade duration between ducking states in ms */
  crossfadeMs: number;
  /** Whether music is enabled */
  enabled: boolean;
}

export interface MusicPreset {
  id: string;
  name: string;
  mood: 'tense' | 'uplifting' | 'neutral';
  filename: string;
}

export interface GainAutomationPoint {
  time: number;  // seconds
  gain: number;  // 0.0–1.0
}

export interface DuckingEnvelope {
  /** Ordered list of gain automation points */
  points: GainAutomationPoint[];
  /** Total duration of the envelope in seconds */
  duration: number;
}

export interface AudioMixer {
  /** The computed ducking envelope */
  envelope: DuckingEnvelope;
  /** Whether music is enabled */
  enabled: boolean;
  /** The mixer configuration */
  config: MixerConfig;
  /** Get the gain value at a specific time point */
  getGainAtTime(time: number): number;
}

// ---------------------------------------------------------------------------
// Music Presets
// ---------------------------------------------------------------------------

export const MUSIC_PRESETS: MusicPreset[] = [
  { id: 'tense', name: 'Tense', mood: 'tense', filename: 'bg-tense.aac' },
  { id: 'uplifting', name: 'Uplifting', mood: 'uplifting', filename: 'bg-uplifting.aac' },
  { id: 'neutral', name: 'Neutral', mood: 'neutral', filename: 'bg-neutral.aac' },
];

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_MIXER_CONFIG: Omit<MixerConfig, 'musicUrl' | 'narrationClips'> = {
  duckingLevel: 0.18,
  peakLevel: 0.70,
  fadeInMs: 500,
  fadeOutMs: 2000,
  crossfadeMs: 300,
  enabled: true,
};

// ---------------------------------------------------------------------------
// Ducking Envelope Computation
// ---------------------------------------------------------------------------

/**
 * Computes a ducking envelope from narration timings.
 *
 * The envelope defines gain automation points that:
 * - Set gain to duckingLevel (0.15–0.20) during narration
 * - Set gain to peakLevel (0.60–0.80) during gaps
 * - Apply crossfade transitions (200–400ms) between states
 * - Apply fade-in (500ms) at start and fade-out (2000ms) at end
 *
 * @param narrationTimings - Array of {start, end} intervals in seconds
 * @param config - Partial mixer config (uses defaults for missing values)
 * @returns DuckingEnvelope with ordered gain automation points
 */
export function computeDuckingEnvelope(
  narrationTimings: NarrationTiming[],
  config?: Partial<Pick<MixerConfig, 'duckingLevel' | 'peakLevel' | 'fadeInMs' | 'fadeOutMs' | 'crossfadeMs'>>,
): DuckingEnvelope {
  const duckingLevel = clampDuckingLevel(config?.duckingLevel ?? DEFAULT_MIXER_CONFIG.duckingLevel);
  const peakLevel = clampPeakLevel(config?.peakLevel ?? DEFAULT_MIXER_CONFIG.peakLevel);
  const fadeInMs = config?.fadeInMs ?? DEFAULT_MIXER_CONFIG.fadeInMs;
  const fadeOutMs = config?.fadeOutMs ?? DEFAULT_MIXER_CONFIG.fadeOutMs;
  const crossfadeMs = clampCrossfadeMs(config?.crossfadeMs ?? DEFAULT_MIXER_CONFIG.crossfadeMs);

  const fadeInSec = fadeInMs / 1000;
  const fadeOutSec = fadeOutMs / 1000;
  const crossfadeSec = crossfadeMs / 1000;

  // Sort and merge overlapping narration intervals
  const intervals = mergeIntervals(narrationTimings);

  // If no narration, produce a simple envelope with fade-in/out at peak level
  if (intervals.length === 0) {
    const duration = fadeInSec + fadeOutSec + 1; // minimal duration
    return {
      points: [
        { time: 0, gain: 0 },
        { time: fadeInSec, gain: peakLevel },
        { time: duration - fadeOutSec, gain: peakLevel },
        { time: duration, gain: 0 },
      ],
      duration,
    };
  }

  // Compute total duration: from 0 to end of last narration + fade-out
  const lastEnd = intervals[intervals.length - 1].end;
  const totalDuration = lastEnd + fadeOutSec;

  const points: GainAutomationPoint[] = [];

  // Start: fade-in from 0
  points.push({ time: 0, gain: 0 });

  // Determine the initial target level based on whether narration starts immediately
  const firstNarrationStart = intervals[0].start;

  if (firstNarrationStart <= fadeInSec) {
    // Narration starts during or at fade-in — fade into ducking level
    points.push({ time: Math.min(fadeInSec, firstNarrationStart), gain: duckingLevel });
  } else {
    // Gap before first narration — fade into peak level, then duck
    points.push({ time: fadeInSec, gain: peakLevel });

    // Crossfade down to ducking before first narration starts
    const crossfadeStart = Math.max(fadeInSec, firstNarrationStart - crossfadeSec);
    if (crossfadeStart > fadeInSec) {
      points.push({ time: crossfadeStart, gain: peakLevel });
    }
    points.push({ time: firstNarrationStart, gain: duckingLevel });
  }

  // Process each narration interval and the gaps between them
  for (let i = 0; i < intervals.length; i++) {
    const current = intervals[i];
    const next = intervals[i + 1];

    if (next) {
      const gapStart = current.end;
      const gapEnd = next.start;
      const gapDuration = gapEnd - gapStart;

      if (gapDuration > crossfadeSec * 2) {
        // Enough room for crossfade up and crossfade down
        points.push({ time: gapStart, gain: duckingLevel });
        points.push({ time: gapStart + crossfadeSec, gain: peakLevel });
        points.push({ time: gapEnd - crossfadeSec, gain: peakLevel });
        points.push({ time: gapEnd, gain: duckingLevel });
      } else if (gapDuration > crossfadeSec) {
        // Partial rise — go to peak briefly
        const midpoint = (gapStart + gapEnd) / 2;
        points.push({ time: gapStart, gain: duckingLevel });
        points.push({ time: midpoint, gain: peakLevel });
        points.push({ time: gapEnd, gain: duckingLevel });
      } else {
        // Gap too short for crossfade — stay at ducking level
        points.push({ time: gapStart, gain: duckingLevel });
        points.push({ time: gapEnd, gain: duckingLevel });
      }
    }
  }

  // End: crossfade from current level to fade-out
  const lastNarrationEnd = intervals[intervals.length - 1].end;
  const fadeOutStart = totalDuration - fadeOutSec;

  // Use a small epsilon to avoid floating-point precision issues
  const epsilon = 0.005;

  if (fadeOutStart > lastNarrationEnd + crossfadeSec + epsilon) {
    // Room for peak level before fade-out
    points.push({ time: lastNarrationEnd, gain: duckingLevel });
    points.push({ time: lastNarrationEnd + crossfadeSec, gain: peakLevel });
    points.push({ time: fadeOutStart, gain: peakLevel });
  } else if (fadeOutStart > lastNarrationEnd + epsilon) {
    // Transition directly from ducking to fade-out
    points.push({ time: lastNarrationEnd, gain: duckingLevel });
    points.push({ time: fadeOutStart, gain: peakLevel });
  } else {
    // Fade-out starts at or before narration end — stay at ducking into fade-out
    points.push({ time: lastNarrationEnd, gain: duckingLevel });
  }

  points.push({ time: totalDuration, gain: 0 });

  // Deduplicate and sort points
  const cleanedPoints = deduplicatePoints(points);

  return {
    points: cleanedPoints,
    duration: totalDuration,
  };
}

// ---------------------------------------------------------------------------
// Audio Mixer Factory
// ---------------------------------------------------------------------------

/**
 * Creates an AudioMixer instance with the given configuration.
 *
 * The mixer computes a ducking envelope and provides methods to query
 * gain values at any time point. When disabled, all gain values return 0.
 *
 * @param config - Full mixer configuration
 * @returns AudioMixer instance
 */
export function createAudioMixer(config: MixerConfig): AudioMixer {
  // Validate and clamp config values
  const validatedConfig: MixerConfig = {
    ...config,
    duckingLevel: clampDuckingLevel(config.duckingLevel),
    peakLevel: clampPeakLevel(config.peakLevel),
    crossfadeMs: clampCrossfadeMs(config.crossfadeMs),
    fadeInMs: Math.max(0, config.fadeInMs),
    fadeOutMs: Math.max(0, config.fadeOutMs),
  };

  const envelope = config.enabled
    ? computeDuckingEnvelope(validatedConfig.narrationClips, {
        duckingLevel: validatedConfig.duckingLevel,
        peakLevel: validatedConfig.peakLevel,
        fadeInMs: validatedConfig.fadeInMs,
        fadeOutMs: validatedConfig.fadeOutMs,
        crossfadeMs: validatedConfig.crossfadeMs,
      })
    : { points: [], duration: 0 };

  return {
    envelope,
    enabled: validatedConfig.enabled,
    config: validatedConfig,
    getGainAtTime(time: number): number {
      if (!validatedConfig.enabled) return 0;
      return interpolateGain(envelope.points, time);
    },
  };
}

// ---------------------------------------------------------------------------
// Gain Interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolates the gain value at a given time from the automation points.
 * Uses linear interpolation between adjacent points.
 */
export function interpolateGain(points: GainAutomationPoint[], time: number): number {
  if (points.length === 0) return 0;
  if (time <= points[0].time) return points[0].gain;
  if (time >= points[points.length - 1].time) return points[points.length - 1].gain;

  // Find the two surrounding points
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    if (time >= current.time && time <= next.time) {
      // Linear interpolation
      const duration = next.time - current.time;
      if (duration === 0) return current.gain;
      const progress = (time - current.time) / duration;
      return current.gain + (next.gain - current.gain) * progress;
    }
  }

  return points[points.length - 1].gain;
}

// ---------------------------------------------------------------------------
// Helper: Get music preset by ID
// ---------------------------------------------------------------------------

/**
 * Returns the music preset matching the given ID, or the neutral preset as default.
 */
export function getMusicPreset(presetId: string): MusicPreset {
  return MUSIC_PRESETS.find((p) => p.id === presetId) ?? MUSIC_PRESETS[2]; // neutral fallback
}

/**
 * Returns the URL path for a music preset's audio file.
 */
export function getMusicPresetUrl(presetId: string): string {
  const preset = getMusicPreset(presetId);
  return `/audio/${preset.filename}`;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Clamp ducking level to valid range [0.15, 0.20] */
function clampDuckingLevel(level: number): number {
  return Math.max(0.15, Math.min(0.20, level));
}

/** Clamp peak level to valid range [0.60, 0.80] */
function clampPeakLevel(level: number): number {
  return Math.max(0.60, Math.min(0.80, level));
}

/** Clamp crossfade duration to valid range [200, 400] ms */
function clampCrossfadeMs(ms: number): number {
  return Math.max(200, Math.min(400, ms));
}

/** Merge overlapping narration intervals and sort by start time */
function mergeIntervals(timings: NarrationTiming[]): NarrationTiming[] {
  if (timings.length === 0) return [];

  // Filter out invalid intervals and sort by start time
  const valid = timings
    .filter((t) => t.end > t.start && t.start >= 0)
    .sort((a, b) => a.start - b.start);

  if (valid.length === 0) return [];

  const merged: NarrationTiming[] = [{ ...valid[0] }];

  for (let i = 1; i < valid.length; i++) {
    const last = merged[merged.length - 1];
    const current = valid[i];

    if (current.start <= last.end) {
      // Overlapping — extend the current interval
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/** Remove duplicate consecutive points at the same time */
function deduplicatePoints(points: GainAutomationPoint[]): GainAutomationPoint[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const result: GainAutomationPoint[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const current = sorted[i];

    // Skip duplicate time points (keep the later one for correct state)
    if (Math.abs(current.time - prev.time) < 0.001) {
      result[result.length - 1] = current;
    } else {
      result.push(current);
    }
  }

  return result;
}
