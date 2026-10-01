// ============================================================================
// Video Quality Checklist — P0 automated gates (bugfix spec 2.216–2.225 subset)
// ============================================================================

import type { MediaAsset, ScriptSegment } from '../types';

export interface ChecklistCheckResult {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  severity: 'critical' | 'warning';
}

/** Generic YouTube opener phrases — checklist 2.38 / 2.214 */
export const GENERIC_HOOK_PHRASES = [
  "in today's video",
  'welcome back',
  'hey guys',
  "what's up",
  'in this video',
  'let me tell you',
  'cyber threats are rising',
  'technology is evolving',
] as const;

/** Cliché visual patterns — checklist 2.173 / 2.206 */
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
] as const;

/** Concrete personal-risk words for hook — checklist 2.27 / 2.217 */
export const HOOK_STAKES_KEYWORDS = [
  'money',
  'files',
  'identity',
  'account',
  'password',
  'bank',
  'stolen',
  'hacked',
  'lost',
  'locked',
  'payroll',
  'invoice',
  'shutdown',
] as const;

export const DEFAULT_MIN_DURATION_SEC = 180;
export const MIN_SCRIPT_SEGMENTS = 6;

export function getOpeningNarration(script: ScriptSegment[] | undefined): string {
  if (!script?.length) return '';
  const intro = script.find((s) => s.type === 'intro') ?? script[0];
  return intro?.narration ?? '';
}

export function checkMinDuration(
  actualSec: number | null | undefined,
  minSec: number = DEFAULT_MIN_DURATION_SEC,
): ChecklistCheckResult {
  const id = 'min_duration';
  if (actualSec == null || !Number.isFinite(actualSec)) {
    return {
      id,
      label: 'Minimum duration',
      ok: false,
      severity: 'critical',
      message: 'Could not read MP4 duration for min-duration check',
    };
  }
  const ok = actualSec >= minSec;
  return {
    id,
    label: 'Minimum duration',
    ok,
    severity: 'critical',
    message: ok
      ? `Duration ${actualSec.toFixed(1)}s ≥ ${minSec}s`
      : `Duration ${actualSec.toFixed(1)}s < ${minSec}s — export too short for long-form Real Pass`,
  };
}

export function checkGenericHook(script: ScriptSegment[] | undefined): ChecklistCheckResult {
  const id = 'generic_hook';
  const narration = getOpeningNarration(script).toLowerCase();
  if (!narration) {
    return {
      id,
      label: 'Hook avoids generic phrasing',
      ok: false,
      severity: 'critical',
      message: 'No opening narration found — cannot validate hook',
    };
  }
  const match = GENERIC_HOOK_PHRASES.find((p) => narration.includes(p));
  const ok = !match;
  return {
    id,
    label: 'Hook avoids generic phrasing',
    ok,
    severity: 'critical',
    message: ok
      ? 'Opening avoids generic YouTube / vague threat phrasing'
      : `Opening uses generic phrase "${match}" — rewrite with personal-stakes hook (checklist 2.217)`,
  };
}

export function checkConcreteHookStakes(script: ScriptSegment[] | undefined): ChecklistCheckResult {
  const id = 'hook_stakes';
  const narration = getOpeningNarration(script).toLowerCase();
  if (!narration) {
    return {
      id,
      label: 'Hook has concrete personal stakes',
      ok: false,
      severity: 'critical',
      message: 'No opening narration found — cannot validate hook stakes',
    };
  }
  const hasStakes = HOOK_STAKES_KEYWORDS.some((k) => narration.includes(k));
  return {
    id,
    label: 'Hook has concrete personal stakes',
    ok: hasStakes,
    severity: 'critical',
    message: hasStakes
      ? 'Opening includes concrete personal-risk language'
      : 'Opening lacks concrete stakes (money, files, identity, lockout) — checklist 2.27 / 2.217',
  };
}

export function detectClicheInMediaAsset(
  asset: Pick<MediaAsset, 'alt' | 'url' | 'query'>,
  patterns: readonly string[] = CLICHE_MEDIA_PATTERNS,
): string | null {
  const searchText = [asset.alt, asset.url, asset.query ?? ''].join(' ').toLowerCase();
  for (const pattern of patterns) {
    if (searchText.includes(pattern.toLowerCase())) return pattern;
  }
  return null;
}

export function checkClicheMedia(
  media: MediaAsset[] | undefined,
): ChecklistCheckResult {
  const id = 'cliche_media';
  if (!media?.length) {
    return {
      id,
      label: 'No cliché stock imagery',
      ok: true,
      severity: 'warning',
      message: 'No media assets on project — skipped cliché media scan',
    };
  }
  const hits: string[] = [];
  for (const asset of media) {
    const pattern = detectClicheInMediaAsset(asset);
    if (pattern) hits.push(`${pattern} (${asset.alt || asset.url})`);
  }
  const ok = hits.length === 0;
  return {
    id,
    label: 'No cliché stock imagery',
    ok,
    severity: 'critical',
    message: ok
      ? 'Selected media avoids cliché hacker / matrix imagery'
      : `Cliché media detected: ${hits.slice(0, 3).join('; ')}${hits.length > 3 ? '…' : ''} — replace per checklist 2.173`,
  };
}

export function checkMinScriptSegments(script: ScriptSegment[] | undefined): ChecklistCheckResult {
  const id = 'min_segments';
  const count = script?.length ?? 0;
  const ok = count >= MIN_SCRIPT_SEGMENTS;
  return {
    id,
    label: 'Minimum script segments',
    ok,
    severity: 'warning',
    message: ok
      ? `${count} script segments (≥ ${MIN_SCRIPT_SEGMENTS})`
      : `Only ${count} script segments — need ≥ ${MIN_SCRIPT_SEGMENTS} for retention pacing (preservation 3.2)`,
  };
}

export interface ProjectChecklistInput {
  script?: ScriptSegment[];
  media?: MediaAsset[];
}

export function runProjectQualityChecks(project: ProjectChecklistInput): ChecklistCheckResult[] {
  return [
    checkGenericHook(project.script),
    checkConcreteHookStakes(project.script),
    checkClicheMedia(project.media),
    checkMinScriptSegments(project.script),
  ];
}

export function runVideoQualityChecklist(options: {
  actualDurationSec?: number | null;
  minDurationSec?: number;
  project?: ProjectChecklistInput;
}): ChecklistCheckResult[] {
  const results: ChecklistCheckResult[] = [];
  const minSec = options.minDurationSec ?? DEFAULT_MIN_DURATION_SEC;
  if (options.actualDurationSec != null) {
    results.push(checkMinDuration(options.actualDurationSec, minSec));
  }
  if (options.project) {
    results.push(...runProjectQualityChecks(options.project));
  }
  return results;
}

export function checklistPassed(results: ChecklistCheckResult[]): boolean {
  return results.every((r) => r.ok || r.severity === 'warning');
}

export function checklistCriticalFailures(results: ChecklistCheckResult[]): ChecklistCheckResult[] {
  return results.filter((r) => !r.ok && r.severity === 'critical');
}
