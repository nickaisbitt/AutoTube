/**
 * Decode-time quality gates for harvested stills before ffmpeg assembly.
 *
 * Metadata gates catch obvious placeholders, but live harvest can still surface
 * tiny thumbnails, corrupt HTML responses, or heavily blurred stills. Keep this
 * module side-effect free so sanitizer call sites can share the same verdicts.
 */
import sharp from 'sharp';

export const STILL_QUALITY_THRESHOLDS = {
  rejectMinShortEdge: 240,
  rejectMinLongEdge: 360,
  rejectMinPixels: 120_000,
  demoteMinShortEdge: 360,
  demoteMinLongEdge: 640,
  demoteMinPixels: 320_000,
  maxAspectRatio: 6,
  flatLumaStdDev: 4,
  rejectLaplacianVariance: 8,
  demoteLaplacianVariance: 18,
  maxFetchBytes: 12 * 1024 * 1024,
};

function numberOrZero(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function strippedUrl(url = '') {
  return String(url || '').split('#')[0];
}

function cacheKeyForUrl(url = '') {
  return strippedUrl(url).split('?')[0] || strippedUrl(url);
}

function looksLikeHtml(buffer) {
  if (!buffer?.length) return false;
  const head = buffer.toString('utf8', 0, Math.min(buffer.length, 160)).trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<body');
}

function contentTypeIsHtml(contentType = '') {
  return /\b(?:text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(String(contentType || ''));
}

export function resolveStillProbeUrl(url = '', devServer = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) return raw;
  if ((raw.startsWith('/api/') || raw.startsWith('/')) && devServer) {
    return `${String(devServer).replace(/\/$/, '')}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }
  return raw;
}

async function readResponseBodyCapped(response, maxBytes) {
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      return { ok: false, reason: `image too large to probe (${buffer.length} bytes)` };
    }
    return { ok: true, buffer };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { ok: false, reason: `image too large to probe (${total} bytes)` };
      }
      chunks.push(chunk);
    }
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      /* ignore */
    }
  }
  return { ok: true, buffer: Buffer.concat(chunks, total) };
}

export async function fetchStillProbeBuffer(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'fetch unavailable for still quality probe' };
  }
  if (!/^https?:\/\//i.test(String(url || ''))) {
    return { ok: false, reason: 'still quality probe requires http(s) URL' };
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 AutoTube still quality validator',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      return { ok: false, reason: `image fetch failed (${response.status})` };
    }
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentTypeIsHtml(contentType)) {
      return { ok: false, reason: 'image response is HTML/text' };
    }
    const contentLength = Number(response.headers?.get?.('content-length') || 0);
    const maxBytes = options.maxBytes ?? STILL_QUALITY_THRESHOLDS.maxFetchBytes;
    if (contentLength > maxBytes) {
      return { ok: false, reason: `image too large to probe (${contentLength} bytes)` };
    }
    const body = await readResponseBodyCapped(response, maxBytes);
    if (!body.ok) return body;
    return { ok: true, buffer: body.buffer, contentType };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'AbortError' ? 'image quality probe timed out' : 'image quality probe failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function computeStillSharpnessMetrics(buffer) {
  const { data, info } = await sharp(buffer, { animated: false, failOn: 'none' })
    .rotate()
    .resize(160, 160, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  if (width < 3 || height < 3) {
    return { laplacianVariance: 0, meanAbsLaplacian: 0, edgeDensity: 0, lumaStdDev: 0 };
  }

  let lumaSum = 0;
  let lumaSqSum = 0;
  for (const value of data) {
    lumaSum += value;
    lumaSqSum += value * value;
  }
  const lumaMean = lumaSum / data.length;
  const lumaVariance = Math.max(0, lumaSqSum / data.length - lumaMean * lumaMean);

  let lapSum = 0;
  let lapSqSum = 0;
  let absSum = 0;
  let edgeCount = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const i = row + x;
      const lap =
        data[i - 1]
        + data[i + 1]
        + data[i - width]
        + data[i + width]
        - 4 * data[i];
      lapSum += lap;
      lapSqSum += lap * lap;
      const abs = Math.abs(lap);
      absSum += abs;
      if (abs >= 20) edgeCount += 1;
      count += 1;
    }
  }

  const lapMean = lapSum / count;
  return {
    laplacianVariance: Math.max(0, lapSqSum / count - lapMean * lapMean),
    meanAbsLaplacian: absSum / count,
    edgeDensity: edgeCount / count,
    lumaStdDev: Math.sqrt(lumaVariance),
  };
}

function verdict(action, reason, details = {}) {
  const flags = details.flags || [];
  return {
    action,
    ok: action !== 'reject',
    reject: action === 'reject',
    demote: action === 'demote',
    reason,
    flags,
    width: details.width,
    height: details.height,
    pixels: details.pixels,
    laplacianVariance: details.laplacianVariance,
    meanAbsLaplacian: details.meanAbsLaplacian,
    edgeDensity: details.edgeDensity,
    lumaStdDev: details.lumaStdDev,
  };
}

export async function assessImageBufferQuality(buffer, options = {}) {
  if (!buffer?.length) return verdict('reject', 'empty image response');
  if (buffer.length < (options.minBytes ?? 512)) {
    return verdict('reject', `image too small (${buffer.length} bytes)`);
  }
  if (looksLikeHtml(buffer) || contentTypeIsHtml(options.contentType)) {
    return verdict('reject', 'image response is HTML/text');
  }

  let metadata;
  try {
    metadata = await sharp(buffer, { animated: false, failOn: 'none', limitInputPixels: 80_000_000 })
      .rotate()
      .metadata();
  } catch {
    return verdict('reject', 'image decode failed');
  }

  const width = numberOrZero(metadata.width);
  const height = numberOrZero(metadata.height);
  const pixels = width * height;
  if (!width || !height) return verdict('reject', 'invalid image dimensions', { width, height, pixels });

  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const aspect = longEdge / Math.max(1, shortEdge);
  const t = { ...STILL_QUALITY_THRESHOLDS, ...(options.thresholds || {}) };

  const baseDetails = { width, height, pixels };
  if (aspect > t.maxAspectRatio) {
    return verdict('reject', `extreme image aspect ratio ${aspect.toFixed(2)}:1`, baseDetails);
  }
  if (shortEdge < t.rejectMinShortEdge || longEdge < t.rejectMinLongEdge || pixels < t.rejectMinPixels) {
    return verdict('reject', `low-resolution still ${width}x${height}`, baseDetails);
  }

  let metrics;
  try {
    metrics = await computeStillSharpnessMetrics(buffer);
  } catch {
    return verdict('reject', 'image sharpness decode failed', baseDetails);
  }
  const details = { ...baseDetails, ...metrics };

  if (metrics.lumaStdDev < t.flatLumaStdDev) {
    return verdict('reject', 'flat/blank still image', details);
  }
  if (
    metrics.laplacianVariance < t.rejectLaplacianVariance
    && metrics.meanAbsLaplacian < 2.5
    && metrics.edgeDensity < 0.015
  ) {
    return verdict('reject', 'severely blurry still image', details);
  }

  const flags = [];
  if (shortEdge < t.demoteMinShortEdge || longEdge < t.demoteMinLongEdge || pixels < t.demoteMinPixels) {
    flags.push('low-resolution');
  }
  if (
    metrics.laplacianVariance < t.demoteLaplacianVariance
    && metrics.meanAbsLaplacian < 5
    && metrics.edgeDensity < 0.035
  ) {
    flags.push('soft-focus');
  }

  if (flags.length) {
    return verdict('demote', flags.includes('low-resolution') ? `marginal-resolution still ${width}x${height}` : 'soft-focus still image', {
      ...details,
      flags,
    });
  }

  return verdict('keep', 'image quality OK', details);
}

export async function assessHarvestStillQuality(asset, options = {}) {
  const rawUrl = typeof asset === 'string' ? asset : asset?.url;
  const url = resolveStillProbeUrl(rawUrl, options.devServer || '');
  const cache = options.cache;
  const key = cacheKeyForUrl(url);
  if (cache?.has?.(key)) return cache.get(key);

  const fetched = await fetchStillProbeBuffer(url, options);
  if (!fetched.ok) {
    const failed = verdict('reject', fetched.reason || 'image fetch failed');
    cache?.set?.(key, failed);
    return failed;
  }
  const assessed = await assessImageBufferQuality(fetched.buffer, {
    contentType: fetched.contentType,
    minBytes: options.minBytes,
    thresholds: options.thresholds,
  });
  cache?.set?.(key, assessed);
  return assessed;
}

/**
 * Stopwords for query-echo detection. Keep short: we only need to ignore glue
 * words so "Why Victorian beekeepers feared the silent hive" compares cleanly.
 */
const QUERY_ECHO_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one',
  'our', 'out', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who',
  'did', 'get', 'let', 'put', 'say', 'she', 'too', 'use', 'why', 'that', 'this', 'with', 'from',
  'they', 'them', 'then', 'than', 'their', 'there', 'were', 'what', 'when', 'where', 'which',
  'while', 'about', 'after', 'been', 'have', 'into', 'over', 'your', 'photo', 'photos', 'image',
  'images', 'picture', 'pictures', 'news', 'stock', 'footage', 'video', 'videos', 'clip', 'clips',
]);

/** Anime / fan-art CDNs that keyword-drunk harvest pulls for single-token matches ("silent"). */
export const ANIME_FICTION_HOST_RE =
  /\b(?:zerochan\.net|danbooru\.donmai\.us|safebooru\.org|gelbooru\.com|anime-pictures\.net|pixiv\.net|i\.pximg\.net|myanimelist\.net|anidb\.net|anilist\.co|kitsu\.io|sankakucomplex\.com|chan\.sankakucomplex)\b/i;

/**
 * Meaningful tokens for echo overlap (length ≥ 3, stopwords stripped).
 * @param {string} text
 * @returns {string[]}
 */
export function meaningfulEchoTokens(text = '') {
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !QUERY_ECHO_STOPWORDS.has(w)),
    ),
  ];
}

function tokensNearlyEqual(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Fraction of alt/title tokens that also appear in query/topic echo sources.
 * 1.0 = alt is entirely composed of query/topic words (classic volume-pad laundering).
 * @param {string} alt
 * @param {string[]} echoSources
 * @returns {number}
 */
export function queryEchoOverlapRatio(alt = '', echoSources = []) {
  const altTokens = meaningfulEchoTokens(alt);
  if (altTokens.length < 2) return altTokens.length === 0 ? 1 : 0;
  const echoTokens = [
    ...new Set((Array.isArray(echoSources) ? echoSources : [echoSources]).flatMap((s) => meaningfulEchoTokens(s))),
  ];
  if (!echoTokens.length) return 0;
  const hits = altTokens.filter((token) => echoTokens.some((echo) => tokensNearlyEqual(token, echo)));
  return hits.length / altTokens.length;
}

/**
 * True when alt/title is mostly a copy of the search query or topic (no independent
 * visual description). Volume top-up used to set alt = `${seg.title} ${topic}`, which
 * made yacht-charter scrapes look on-topic for "Victorian beekeepers…".
 *
 * @param {string} alt
 * @param {{ query?: string, topic?: string, topicBlob?: string, segmentTitle?: string, minRatio?: number }} [options]
 * @returns {boolean}
 */
export function isQueryEchoAlt(alt = '', options = {}) {
  const raw = String(alt || '').trim();
  const altTokens = meaningfulEchoTokens(raw);
  // Empty / placeholder alts prove nothing about the still.
  if (!raw || altTokens.length < 2) return true;

  const sources = [
    options.query,
    options.topic,
    options.topicBlob,
    options.segmentTitle,
  ].filter((s) => String(s || '').trim());

  if (!sources.length) return false;

  const minRatio = Number.isFinite(options.minRatio) ? options.minRatio : 0.75;
  const ratio = queryEchoOverlapRatio(raw, sources);
  if (ratio >= minRatio && altTokens.length >= 3) return true;

  // Near-exact copy of any single echo source (query pasted into alt).
  const altKey = altTokens.join(' ');
  for (const source of sources) {
    const sourceTokens = meaningfulEchoTokens(source);
    if (sourceTokens.length < 2) continue;
    const sourceKey = sourceTokens.join(' ');
    if (altKey === sourceKey) return true;
    // Alt is a short prefix/suffix of the topic or vice versa.
    if (
      altTokens.length >= 3
      && sourceTokens.length >= 3
      && (altKey.includes(sourceKey) || sourceKey.includes(altKey))
      && Math.min(altTokens.length, sourceTokens.length) / Math.max(altTokens.length, sourceTokens.length) >= 0.7
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Zerochan / danbooru / pixiv-style hosts.
 * @param {object|string} assetOrUrl
 * @returns {boolean}
 */
export function isAnimeFictionSource(assetOrUrl = {}) {
  if (typeof assetOrUrl === 'string') {
    return ANIME_FICTION_HOST_RE.test(assetOrUrl);
  }
  const blob = `${assetOrUrl?.url || ''} ${assetOrUrl?.source || ''} ${assetOrUrl?.sourceUrl || ''} ${assetOrUrl?.thumbnailUrl || ''}`;
  return ANIME_FICTION_HOST_RE.test(blob);
}

/** Topics that legitimately want anime/fan-art stills. */
export function topicAllowsAnimeFiction(topicBlob = '') {
  return /\b(?:anime|manga|otaku|cosplay|waifu|seinen|shoujo|shonen|shounen|light\s+novel|visual\s+novel|cartoon\s+series|animated\s+series)\b/i.test(
    String(topicBlob || ''),
  );
}

/**
 * Metadata-only still gate: query-echo alts and anime/fiction CDNs on non-anime topics.
 * Call before (or after) buffer sharpness probes so volume pads fail closed without fetch.
 *
 * @param {object} asset
 * @param {{ topic?: string, topicBlob?: string, query?: string, segmentTitle?: string, requireIndependentAlt?: boolean }} [options]
 * @returns {{ action: 'keep'|'demote'|'reject', ok: boolean, reject: boolean, demote: boolean, reason: string, flags: string[] }}
 */
export function assessStillMetadataQuality(asset = {}, options = {}) {
  const topicBlob = options.topicBlob || options.topic || '';
  const query = options.query || asset.query || '';
  const segmentTitle = options.segmentTitle || '';
  const alt = `${asset.alt || ''} ${asset.title || ''}`.trim();
  const requireIndependentAlt = options.requireIndependentAlt === true
    || /volume top-up/i.test(String(asset.source || ''));

  if (isAnimeFictionSource(asset) && !topicAllowsAnimeFiction(topicBlob)) {
    return verdict('reject', 'anime/fiction still on non-anime topic', {
      flags: ['anime-fiction-source'],
    });
  }

  if (
    requireIndependentAlt
    && isQueryEchoAlt(alt, { query, topic: topicBlob, topicBlob, segmentTitle })
  ) {
    return verdict('reject', 'query-echo alt (no independent visual description)', {
      flags: ['query-echo'],
    });
  }

  // Non-volume stills with query-echo alts are demoted (scarcity fallback) rather
  // than hard-rejected — deep-harvest can still carry a real URL with weak metadata.
  if (isQueryEchoAlt(alt, { query, topic: topicBlob, topicBlob, segmentTitle })) {
    return verdict('demote', 'query-echo alt (mostly topic/query copy)', {
      flags: ['query-echo'],
    });
  }

  return verdict('keep', 'still metadata OK', { flags: [] });
}

/**
 * Merge buffer sharpness assessment with metadata gates (worst action wins).
 * @param {object} bufferAssessment
 * @param {object} metadataAssessment
 */
export function mergeStillQualityAssessments(bufferAssessment, metadataAssessment) {
  if (!metadataAssessment || metadataAssessment.action === 'keep') {
    return bufferAssessment;
  }
  if (!bufferAssessment || bufferAssessment.action === 'keep') {
    return {
      ...bufferAssessment,
      ...metadataAssessment,
      flags: [...new Set([...(bufferAssessment?.flags || []), ...(metadataAssessment.flags || [])])],
      width: bufferAssessment?.width,
      height: bufferAssessment?.height,
      pixels: bufferAssessment?.pixels,
      laplacianVariance: bufferAssessment?.laplacianVariance,
      meanAbsLaplacian: bufferAssessment?.meanAbsLaplacian,
      edgeDensity: bufferAssessment?.edgeDensity,
      lumaStdDev: bufferAssessment?.lumaStdDev,
    };
  }
  const rank = { keep: 0, demote: 1, reject: 2 };
  const winner = rank[metadataAssessment.action] >= rank[bufferAssessment.action]
    ? metadataAssessment
    : bufferAssessment;
  return {
    ...bufferAssessment,
    action: winner.action,
    ok: winner.action !== 'reject',
    reject: winner.action === 'reject',
    demote: winner.action === 'demote',
    reason: winner.reason,
    flags: [...new Set([...(bufferAssessment.flags || []), ...(metadataAssessment.flags || [])])],
  };
}

export function decorateStillWithQuality(asset, assessment) {
  const quality = {
    action: assessment.action,
    reason: assessment.reason,
    flags: assessment.flags || [],
    width: assessment.width,
    height: assessment.height,
    laplacianVariance: assessment.laplacianVariance,
    lumaStdDev: assessment.lumaStdDev,
  };
  return {
    ...asset,
    width: asset.width ?? assessment.width,
    height: asset.height ?? assessment.height,
    sanitizeQuality: quality,
    ...(assessment.action === 'demote' ? { qualityDemoted: true } : {}),
  };
}

export function stillQualityTimelinePenalty(asset = {}) {
  const quality = asset.sanitizeQuality || {};
  const flags = new Set(quality.flags || []);
  if (quality.action === 'reject') return -20;
  if (asset.qualityDemoted || quality.action === 'demote') {
    let penalty = -4;
    if (flags.has('low-resolution')) penalty -= 2;
    if (flags.has('soft-focus')) penalty -= 2;
    if (flags.has('query-echo')) penalty -= 4;
    if (flags.has('anime-fiction-source')) penalty -= 6;
    return penalty;
  }
  return 0;
}
