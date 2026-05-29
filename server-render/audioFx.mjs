/**
 * Audio Effects Module - .mjs wrapper
 * Provides professional audio processing for video rendering
 */

export function computeReverbFilter(preset, enableStart, enableEnd) {
  const presets = {
    hall: { delay: 80, decay: 0.4 },
    room: { delay: 40, decay: 0.2 },
    plate: { delay: 60, decay: 0.3 },
    cathedral: { delay: 120, decay: 0.6 },
    subtle: { delay: 30, decay: 0.15 },
  };
  
  const p = presets[preset] || presets.subtle;
  let filter = `aecho=0.8:0.88:${p.delay}:${p.decay}`;
  
  if (enableStart !== undefined && enableEnd !== undefined) {
    filter += `:enable='between(t,${enableStart},${enableEnd})'`;
  }
  
  return filter;
}

export function computeStereoPanFilter(direction, durationSec) {
  if (direction === 'left-to-right') {
    return `pan=stereo|c0=c0+0.5*c1|c1=0.5*c0+c1`;
  } else if (direction === 'right-to-left') {
    return `pan=stereo|c0=0.5*c0+c1|c1=c0+0.5*c1`;
  }
  return '';
}

export function generateAmbientBed(preset, durationSec, outputFile) {
  const presets = {
    tension: [
      `sine=frequency=80:duration=${durationSec}[drone]`,
      `anoisesrc=d=${durationSec}:c=pink:a=0.05[noise]`,
      `[noise]lowpass=f=500[filtered]`,
      `[drone][filtered]amix=inputs=2:weights=1 0.3[out]`
    ],
    calm: [
      `sine=frequency=220:duration=${durationSec}[tone1]`,
      `sine=frequency=330:duration=${durationSec}[tone2]`,
      `[tone1][tone2]amix=inputs=2:weights=0.5 0.5[out]`
    ],
    space: [
      `sine=frequency=40:duration=${durationSec}[bass]`,
      `sine=frequency=4000:duration=${durationSec}[shimmer]`,
      `[shimmer]volume=0.02[quiet]`,
      `[bass][quiet]amix=inputs=2:weights=1 0.5[out]`
    ],
    tech: [
      `sine=frequency=800:duration=${durationSec}[pulse]`,
      `anoisesrc=d=${durationSec}:c=white:a=0.03[data]`,
      `[data]highpass=f=2000[filtered]`,
      `[pulse][filtered]amix=inputs=2:weights=0.3 0.7[out]`
    ],
  };
  
  const filterGraph = presets[preset] || presets.calm;
  const args = [
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filterGraph.join(';'),
    '-map', '[out]',
    '-t', String(durationSec),
    '-ar', '48000',
    '-ac', '2',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputFile
  ];
  
  return args;
}

export function computeSubBassRumble(startTime, duration) {
  const freq = 50;
  const vol = 0.1;
  return [
    `sine=frequency=${freq}:duration=${duration}[rumble]`,
    `[rumble]afade=t=in:st=0:d=0.1,afade=t=out:st=${duration - 0.1}:d=0.1,volume=${vol}:enable='between(t,${startTime},${startTime + duration})'[out]`
  ];
}

export function computeTransientDuck(wordTimestamps, impactWords) {
  const events = [];
  
  for (const wt of wordTimestamps) {
    const word = wt.word.toLowerCase();
    if (impactWords.some(iw => word.includes(iw))) {
      events.push({
        time: wt.start,
        duration: 0.15,
        depth: 0.5
      });
    }
  }
  
  if (events.length === 0) return '';
  
  const filters = events.map(e => 
    `volume=${e.depth}:enable='between(t,${e.time},${e.time + e.duration})'`
  );
  
  return filters.join(',');
}

export function computePitchRamp(startTime, endTime, startRate, endRate) {
  const duration = endTime - startTime;
  const steps = 10;
  const stepDuration = duration / steps;
  
  const filters = [];
  for (let i = 0; i < steps; i++) {
    const t = startTime + i * stepDuration;
    const rate = startRate + (endRate - startRate) * (i / steps);
    filters.push(`asetrate=48000*${rate}:enable='between(t,${t},${t + stepDuration})'`);
  }
  
  return filters.join(',');
}

export function buildFilterChain(filters) {
  return filters.filter(f => f && f.length > 0).join(',');
}
