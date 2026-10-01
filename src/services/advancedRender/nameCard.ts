import type { RenderContext2D } from '../renderingShared';
import { roundRect, hexToRgba } from '../renderingShared';

export interface NameCardConfig {
  name: string;
  title?: string;
  organization?: string;
  accentColor: string;
  position: 'lower_left' | 'lower_right';
}

const TITLE_INDICATORS = /\b(CEO|CTO|CFO|COO|President|Director|Dr\.|Professor|Chairman|Founder|Co-Founder|VP|Vice President|General|Senator|Governor|Minister|Secretary|Chief|Head of|Lead|Manager|Analyst|Advisor|Consultant|Architect|Engineer|Scientist|Author|Journalist|Editor|Correspondent)\b/i;

const NON_NAME_PATTERNS = /\b(The Update|Wall Street|New York|United States|United Kingdom|European Union|Silicon Valley|Fortune 500|S&P 500|Dow Jones|Nasdaq|Federal Reserve|White House|Supreme Court|Department of|Ministry of|University of|State of|City of|Bank of|World Health|International Monetary)\b/i;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

export function extractNamesFromText(text: string): { name: string; title?: string }[] {
  if (!text) return [];

  const results: { name: string; title?: string }[] = [];
  const seen = new Set<string>();

  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  let match: RegExpExecArray | null;

  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[0];

    if (NON_NAME_PATTERNS.test(candidate)) continue;
    if (seen.has(candidate)) continue;

    seen.add(candidate);

    const beforeText = text.substring(Math.max(0, match.index - 60), match.index);
    const afterText = text.substring(match.index + candidate.length, match.index + candidate.length + 60);
    const context = `${beforeText} ${afterText}`;

    const titleMatch = context.match(TITLE_INDICATORS);
    const title = titleMatch ? titleMatch[0] : undefined;

    results.push({ name: candidate, title });
  }

  return results;
}

export function drawNameCard(
  ctx: RenderContext2D,
  config: NameCardConfig,
  progress: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || !config.name) return;
  if (progress <= 0 || progress >= 1) return;

  const cardW = Math.min(420, w * 0.35);
  const cardH = config.organization ? 90 : config.title ? 72 : 52;
  const holdStart = 0.15;
  const holdEnd = 0.85;

  let alpha = 1;
  let slideOffset = 0;

  if (progress < holdStart) {
    const t = progress / holdStart;
    const eased = easeOutCubic(t);
    alpha = eased;
    slideOffset = (1 - eased) * (config.position === 'lower_left' ? -300 : 300);
  } else if (progress > holdEnd) {
    const t = (progress - holdEnd) / (1 - holdEnd);
    const eased = easeInCubic(t);
    alpha = 1 - eased;
    slideOffset = eased * (config.position === 'lower_left' ? -300 : 300);
  }

  if (alpha <= 0) return;

  const x = config.position === 'lower_left'
    ? w * 0.05 + slideOffset
    : w * 0.95 - cardW + slideOffset;
  const y = h * 0.82;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(15, 15, 25, 0.8)';
  roundRect(ctx, x, y, cardW, cardH, 8);
  ctx.fill();

  const ctxAny = ctx as any;
  ctxAny.strokeStyle = 'rgba(255,255,255,0.1)';
  ctxAny.lineWidth = 1;
  roundRect(ctx, x, y, cardW, cardH, 8);
  ctx.stroke();

  ctx.fillStyle = config.accentColor;
  roundRect(ctx, x, y, 4, cardH, 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(config.name, x + 18, y + 12);

  if (config.title) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(config.title, x + 18, y + 40);
  }

  if (config.organization) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = hexToRgba(config.accentColor, 0.9);
    ctx.fillText(config.organization, x + 18, y + (config.title ? 62 : 40));
  }

  ctx.restore();
}
