// ============================================================================
// Audio Quality Analyzer — Background Music Quality Assessment
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioQualityScore {
  /** Loudness consistency: 0 (very inconsistent) to 1 (very consistent) */
  loudnessConsistency: number;
  /** Dynamic range: 0 (flat) to 1 (healthy dynamic range) */
  dynamicRange: number;
  /** Frequency balance: 0 (unbalanced) to 1 (well-balanced) */
  frequencyBalance: number;
  /** Overall quality composite 0-100 */
  overallScore: number;
  /** Issues detected */
  issues: string[];
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes background music quality from decoded audio data.
 *
 * @param audioData - Float32Array of audio samples (mono or first channel)
 * @param sampleRate - Audio sample rate in Hz
 * @returns AudioQualityScore with detailed breakdown
 */
export function analyzeAudioQuality(
  audioData: Float32Array,
  sampleRate: number,
): AudioQualityScore {
  const issues: string[] = [];
  if (audioData.length === 0) {
    return { loudnessConsistency: 0, dynamicRange: 0, frequencyBalance: 0, overallScore: 0, issues: ['Empty audio data'] };
  }

  // 1. Loudness consistency — measure RMS across windows
  const windowSize = Math.floor(sampleRate * 0.5); // 500ms windows
  const windowCount = Math.max(1, Math.floor(audioData.length / windowSize));
  const rmsValues: number[] = [];

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize;
    const end = Math.min(start + windowSize, audioData.length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / (end - start));
    rmsValues.push(rms);
  }

  const meanRMS = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  const varianceRMS = rmsValues.reduce((a, b) => a + (b - meanRMS) * (b - meanRMS), 0) / rmsValues.length;
  const stdRMS = Math.sqrt(varianceRMS);
  const loudnessConsistency = meanRMS > 0 ? Math.max(0, 1 - (stdRMS / meanRMS)) : 0;

  if (loudnessConsistency < 0.3) {
    issues.push('Loudness is highly inconsistent across segments');
  }

  // 2. Dynamic range — difference between quietest and loudest sections
  const sortedRMS = [...rmsValues].sort((a, b) => a - b);
  const p10 = sortedRMS[Math.floor(sortedRMS.length * 0.1)] || 0;
  const p90 = sortedRMS[Math.floor(sortedRMS.length * 0.9)] || sortedRMS[sortedRMS.length - 1];
  const dynamicRange = p90 > 0 ? Math.min(1, (p90 - p10) / p90) : 0;

  if (dynamicRange < 0.2) {
    issues.push('Low dynamic range — audio may sound flat');
  }
  if (dynamicRange > 0.9) {
    issues.push('Very high dynamic range — may have jarring volume jumps');
  }

  // 3. Frequency balance — simplified using zero-crossing rate as proxy
  let zeroCrossings = 0;
  for (let i = 1; i < audioData.length; i += 4) { // Sample every 4th for speed
    if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  const zcr = zeroCrossings / (audioData.length / 4);
  // Expected ZCR for well-balanced music: 0.02-0.08
  const idealZCR = 0.05;
  const frequencyBalance = Math.max(0, 1 - Math.abs(zcr - idealZCR) / idealZCR);

  if (zcr < 0.01) {
    issues.push('Very low frequency content — may sound muffled');
  }
  if (zcr > 0.15) {
    issues.push('Very high frequency content — may sound harsh');
  }

  // 4. Overall score
  const overallScore = Math.round(
    (loudnessConsistency * 30 + dynamicRange * 35 + frequencyBalance * 35)
  );

  return {
    loudnessConsistency: Math.round(loudnessConsistency * 100) / 100,
    dynamicRange: Math.round(dynamicRange * 100) / 100,
    frequencyBalance: Math.round(frequencyBalance * 100) / 100,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    issues,
  };
}
