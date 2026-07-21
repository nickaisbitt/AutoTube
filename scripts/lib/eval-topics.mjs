/**
 * Held-out topic set loading + overlap guards against known benchmark prompts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPIC_POOL } from './random-topics.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

/** Topics used in proof scripts / tests — never allow in held-out sets. */
export const KNOWN_PROOF_TOPICS = [
  ...TOPIC_POOL,
  'How landlords use AI to evict tenants faster',
  'The nursing home cameras that recorded abuse for years',
  'Why veterans benefits data leaked to dark web brokers',
  'Why your bank account could be emptied by an AI voice clone',
  'The hospital hack that exposed 10 million patient records overnight',
  'The diamond heist that used a fake airport',
  'The insurance scam using fake car crash videos',
];

export function normalizeTopic(topic = '') {
  return String(topic || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function topicTokens(topic = '') {
  return new Set(
    normalizeTopic(topic)
      .split(' ')
      .filter((w) => w.length > 3),
  );
}

/**
 * Jaccard token overlap — high overlap with a known proof topic is leakage.
 * @param {string} a
 * @param {string} b
 */
export function topicOverlapRatio(a, b) {
  const A = topicTokens(a);
  const B = topicTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

/**
 * @param {string} topic
 * @param {string[]} [blocked]
 * @param {number} [maxOverlap=0.45]
 */
export function findTopicLeak(topic, blocked = KNOWN_PROOF_TOPICS, maxOverlap = 0.45) {
  const norm = normalizeTopic(topic);
  for (const b of blocked) {
    if (normalizeTopic(b) === norm) {
      return { leaked: true, reason: 'exact', against: b, overlap: 1 };
    }
    const overlap = topicOverlapRatio(topic, b);
    if (overlap >= maxOverlap) {
      return { leaked: true, reason: 'overlap', against: b, overlap };
    }
  }
  return { leaked: false, reason: null, against: null, overlap: 0 };
}

/**
 * @param {string} setName — 'dev' | 'release'
 * @returns {{ version: number, description: string, topics: Array<{id:string,topic:string,category:string}> }}
 */
export function loadEvalTopicSet(setName) {
  const file =
    setName === 'release'
      ? join(ROOT, 'eval/topics-release.json')
      : join(ROOT, 'eval/topics-dev.json');
  if (!existsSync(file)) throw new Error(`Missing eval topic set: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Validate a topic set has no leakage against known proof topics / other sets.
 * @param {Array<{id:string,topic:string}>} topics
 * @param {{ blocked?: string[], maxOverlap?: number }} [opts]
 */
export function validateEvalTopicSet(topics, opts = {}) {
  const blocked = opts.blocked || KNOWN_PROOF_TOPICS;
  const maxOverlap = opts.maxOverlap ?? 0.45;
  const errors = [];
  const seen = new Set();
  for (const row of topics) {
    if (!row?.id || !row?.topic) {
      errors.push(`invalid row: ${JSON.stringify(row)}`);
      continue;
    }
    if (seen.has(row.id)) errors.push(`duplicate id: ${row.id}`);
    seen.add(row.id);
    const leak = findTopicLeak(row.topic, blocked, maxOverlap);
    if (leak.leaked) {
      errors.push(
        `${row.id} leaks vs "${leak.against}" (${leak.reason}, overlap=${leak.overlap.toFixed(2)})`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}
