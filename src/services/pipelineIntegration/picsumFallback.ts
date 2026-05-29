export const TOPIC_SEED_MAP: Record<string, number[]> = {
  technology: [1, 2, 3, 60, 180],
  business: [10, 20, 48, 119, 177],
  finance: [15, 26, 36, 106, 160],
  security: [4, 33, 96, 117, 164],
  hacking: [4, 33, 96, 117, 201],
  military: [5, 41, 109, 139, 184],
  war: [5, 41, 109, 139, 184],
  politics: [7, 24, 64, 116, 174],
  government: [7, 24, 64, 116, 174],
  science: [8, 30, 110, 142, 188],
  space: [9, 42, 98, 158, 249],
  health: [11, 55, 100, 145, 180],
  medicine: [11, 55, 100, 145, 180],
  energy: [12, 37, 103, 146, 186],
  climate: [13, 28, 103, 146, 186],
  economy: [14, 26, 48, 119, 177],
  education: [16, 42, 108, 152, 193],
  artificial_intelligence: [17, 1, 60, 180, 250],
  cryptocurrency: [18, 26, 36, 106, 200],
  aviation: [19, 43, 97, 161, 184],
  automotive: [21, 31, 111, 133, 169],
  ocean: [22, 29, 101, 141, 167],
  architecture: [23, 49, 122, 164, 188],
  food: [25, 47, 113, 145, 225],
  sports: [27, 54, 116, 154, 177],
  music: [32, 51, 121, 145, 180],
  history: [34, 43, 102, 167, 196],
  nature: [35, 47, 113, 155, 190],
  travel: [38, 57, 129, 167, 190],
  photography: [39, 58, 129, 167, 190],
};

function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 1000;
}

function findMatchingSeed(topic: string): number | null {
  const topicLower = topic.toLowerCase();
  const words = topicLower.split(/\s+/).filter(w => w.length > 2);

  let bestMatch: string | null = null;
  let bestMatchLength = 0;

  for (const key of Object.keys(TOPIC_SEED_MAP)) {
    const keyNormalized = key.replace(/_/g, ' ');
    const keyWords = keyNormalized.split(/\s+/);

    for (const word of words) {
      for (const keyWord of keyWords) {
        if (word.includes(keyWord) || keyWord.includes(word)) {
          if (keyWord.length > bestMatchLength) {
            bestMatchLength = keyWord.length;
            bestMatch = key;
          }
        }
      }
    }
  }

  if (bestMatch) {
    const seeds = TOPIC_SEED_MAP[bestMatch];
    return seeds[hashString(topic) % seeds.length];
  }

  return null;
}

export function getTopicRelevantPicsumUrl(topic: string, width = 1920, height = 1080): string {
  const matchedSeed = findMatchingSeed(topic);
  const seed = matchedSeed !== null ? matchedSeed : hashString(topic);
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

export function computeFallbackScore(topic: string, candidateUrl: string): number {
  let score = 30;

  const matchedSeed = findMatchingSeed(topic);
  if (matchedSeed !== null) {
    score += 25;
  }

  if (candidateUrl.includes('picsum.photos')) {
    score += 10;
  }

  if (candidateUrl.includes('1920') && candidateUrl.includes('1080')) {
    score += 5;
  }

  const topicLower = topic.toLowerCase();
  for (const key of Object.keys(TOPIC_SEED_MAP)) {
    if (topicLower.includes(key.replace(/_/g, ' '))) {
      score += 15;
      break;
    }
  }

  return score;
}
