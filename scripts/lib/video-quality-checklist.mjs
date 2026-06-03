/**
 * A15 — P0 video quality checklist checks (mirrors src/services/videoQualityChecklist.ts).
 */

export const GENERIC_HOOK_PHRASES = [
  "in today's video",
  'welcome back',
  'hey guys',
  "what's up",
  'in this video',
  'let me tell you',
  'cyber threats are rising',
  'technology is evolving',
];

export const CLICHE_MEDIA_PATTERNS = [
  'hooded hacker',
  'hacker typing',
  'hackers typing',
  'binary code',
  'circuit board',
  'abstract circuit',
  'hacker hoodie',
  'green matrix',
  'matrix code',
  'typing on keyboard',
];

export const HOOK_STAKES_KEYWORDS = [
  'money', 'files', 'identity', 'account', 'password', 'bank',
  'stolen', 'hacked', 'lost', 'locked', 'payroll', 'invoice', 'shutdown',
];

export const DEFAULT_MIN_DURATION_SEC = 180;
export const MIN_SCRIPT_SEGMENTS = 6;

function getOpeningNarration(script) {
  if (!Array.isArray(script) || script.length === 0) return '';
  const intro = script.find((s) => s.type === 'intro') ?? script[0];
  return intro?.narration ?? '';
}

export function checkMinDuration(actualSec, minSec = DEFAULT_MIN_DURATION_SEC) {
  if (actualSec == null || !Number.isFinite(actualSec)) {
    return {
      id: 'min_duration',
      label: 'Minimum duration',
      ok: false,
      severity: 'critical',
      message: 'Could not read MP4 duration for min-duration check',
    };
  }
  const ok = actualSec >= minSec;
  return {
    id: 'min_duration',
    label: 'Minimum duration',
    ok,
    severity: 'critical',
    message: ok
      ? `Duration ${actualSec.toFixed(1)}s ≥ ${minSec}s`
      : `Duration ${actualSec.toFixed(1)}s < ${minSec}s — export too short for long-form Real Pass`,
  };
}

export function checkGenericHook(script) {
  const narration = getOpeningNarration(script).toLowerCase();
  if (!narration) {
    return {
      id: 'generic_hook',
      label: 'Hook avoids generic phrasing',
      ok: false,
      severity: 'critical',
      message: 'No opening narration found — cannot validate hook',
    };
  }
  const match = GENERIC_HOOK_PHRASES.find((p) => narration.includes(p));
  const ok = !match;
  return {
    id: 'generic_hook',
    label: 'Hook avoids generic phrasing',
    ok,
    severity: 'critical',
    message: ok
      ? 'Opening avoids generic YouTube / vague threat phrasing'
      : `Opening uses generic phrase "${match}" — rewrite with personal-stakes hook (checklist 2.217)`,
  };
}

export function checkConcreteHookStakes(script) {
  const narration = getOpeningNarration(script).toLowerCase();
  if (!narration) {
    return {
      id: 'hook_stakes',
      label: 'Hook has concrete personal stakes',
      ok: false,
      severity: 'critical',
      message: 'No opening narration found — cannot validate hook stakes',
    };
  }
  const hasStakes = HOOK_STAKES_KEYWORDS.some((k) => narration.includes(k));
  return {
    id: 'hook_stakes',
    label: 'Hook has concrete personal stakes',
    ok: hasStakes,
    severity: 'critical',
    message: hasStakes
      ? 'Opening includes concrete personal-risk language'
      : 'Opening lacks concrete stakes (money, files, identity, lockout) — checklist 2.27 / 2.217',
  };
}

function detectClicheInMediaAsset(asset) {
  const searchText = [asset.alt, asset.url, asset.query ?? ''].join(' ').toLowerCase();
  for (const pattern of CLICHE_MEDIA_PATTERNS) {
    if (searchText.includes(pattern)) return pattern;
  }
  return null;
}

export function checkClicheMedia(media) {
  if (!Array.isArray(media) || media.length === 0) {
    return {
      id: 'cliche_media',
      label: 'No cliché stock imagery',
      ok: true,
      severity: 'warning',
      message: 'No media assets on project — skipped cliché media scan',
    };
  }
  const hits = [];
  for (const asset of media) {
    const pattern = detectClicheInMediaAsset(asset);
    if (pattern) hits.push(`${pattern} (${asset.alt || asset.url})`);
  }
  const ok = hits.length === 0;
  return {
    id: 'cliche_media',
    label: 'No cliché stock imagery',
    ok,
    severity: 'critical',
    message: ok
      ? 'Selected media avoids cliché hacker / matrix imagery'
      : `Cliché media detected: ${hits.slice(0, 3).join('; ')}${hits.length > 3 ? '…' : ''} — replace per checklist 2.173`,
  };
}

export function checkMinScriptSegments(script) {
  const count = Array.isArray(script) ? script.length : 0;
  const ok = count >= MIN_SCRIPT_SEGMENTS;
  return {
    id: 'min_segments',
    label: 'Minimum script segments',
    ok,
    severity: 'warning',
    message: ok
      ? `${count} script segments (≥ ${MIN_SCRIPT_SEGMENTS})`
      : `Only ${count} script segments — need ≥ ${MIN_SCRIPT_SEGMENTS} for retention pacing (preservation 3.2)`,
  };
}

export function runProjectQualityChecks(project) {
  return [
    checkGenericHook(project?.script),
    checkConcreteHookStakes(project?.script),
    checkClicheMedia(project?.media),
    checkMinScriptSegments(project?.script),
  ];
}

export function runVideoQualityChecklist({ actualDurationSec, minDurationSec, project }) {
  const results = [];
  const minSec = minDurationSec ?? DEFAULT_MIN_DURATION_SEC;
  if (actualDurationSec != null) {
    results.push(checkMinDuration(actualDurationSec, minSec));
  }
  if (project) {
    results.push(...runProjectQualityChecks(project));
  }
  return results;
}

export function checklistCriticalFailures(results) {
  return results.filter((r) => !r.ok && r.severity === 'critical');
}
