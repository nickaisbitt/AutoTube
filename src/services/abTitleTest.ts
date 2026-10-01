// ---------------------------------------------------------------------------
// Task 143: A/B title testing — generate title variants, track performance,
// and determine best-performing title per video.
// ---------------------------------------------------------------------------

interface TitleVariant {
  title: string;
  angle: string;
}

interface TitlePerformance {
  videoId: string;
  title: string;
  ctr: number;
  impressions: number;
  views: number;
  timestamp: number;
}

/**
 * Generates multiple title variants for a given topic using different angles.
 * Returns up to 5 variants ranked by estimated engagement potential.
 */
export function generateTitleVariants(topic: string): TitleVariant[] {
  const safeTopic = topic.charAt(0).toUpperCase() + topic.slice(1);

  const variants: TitleVariant[] = [
    {
      title: `Why ${safeTopic} Is More Important Than You Think`,
      angle: 'curiosity_gap',
    },
    {
      title: `What Nobody Tells You About ${safeTopic}`,
      angle: 'curiosity_gap',
    },
    {
      title: `The Truth About ${safeTopic} in ${new Date().getFullYear()}`,
      angle: 'direct_question',
    },
    {
      title: `5 Things You Didn't Know About ${safeTopic}`,
      angle: 'number_list',
    },
    {
      title: `${safeTopic}: The Story They Don't Want You to Hear`,
      angle: 'controversial',
    },
  ];

  // Cap at 100 chars
  for (const v of variants) {
    if (v.title.length > 100) {
      v.title = v.title.substring(0, 97) + '...';
    }
  }

  return variants;
}

// In-memory performance store (keyed by videoId)
const performanceStore = new Map<string, TitlePerformance[]>();

/**
 * Tracks title performance metrics. Called when analytics data is available.
 */
export function trackTitlePerformance(
  videoId: string,
  title: string,
  ctr: number,
  impressions = 0,
  views = 0,
): void {
  const key = videoId;
  const existing = performanceStore.get(key) || [];
  const entry: TitlePerformance = {
    videoId,
    title,
    ctr,
    impressions,
    views,
    timestamp: Date.now(),
  };

  // Update existing entry for same title or add new
  const idx = existing.findIndex(e => e.title === title);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  performanceStore.set(key, existing);
}

/**
 * Returns the best-performing title for a given video based on CTR.
 */
export function getBestPerformingTitle(videoId: string): TitlePerformance | null {
  const entries = performanceStore.get(videoId);
  if (!entries || entries.length === 0) return null;

  // Sort by CTR descending, then by views as tiebreaker
  const sorted = [...entries].sort((a, b) => {
    if (b.ctr !== a.ctr) return b.ctr - a.ctr;
    return b.views - a.views;
  });

  return sorted[0];
}

/**
 * Returns all title performance data for a given video.
 */
export function getTitlePerformanceHistory(videoId: string): TitlePerformance[] {
  return performanceStore.get(videoId) || [];
}
