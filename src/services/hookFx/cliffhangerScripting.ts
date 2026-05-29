export type CliffhangerType = 'question' | 'tease' | 'contradiction' | 'preview' | 'mystery';

export const CLIFFHANGER_TEMPLATES: Record<CliffhangerType, string[]> = {
  question: [
    'But what happens when {topic} goes wrong?',
    'Have you ever wondered why {topic} matters so much?',
    'What if everything you knew about {topic} was wrong?',
    'Can {topic} really change the way we think?',
    'Why does nobody talk about this side of {topic}?',
  ],
  tease: [
    'And the reason behind {topic} will shock you.',
    'But here\'s the twist about {topic} that nobody saw coming.',
    'What happened next with {topic} changed everything.',
    'The truth about {topic} is far stranger than you\'d expect.',
    'There\'s a hidden side to {topic} that few people know about.',
  ],
  contradiction: [
    'But here\'s the thing — {topic} isn\'t what it seems.',
    'Except {topic} actually contradicts everything we just covered.',
    'The problem is, {topic} breaks all the rules we assumed.',
    'Yet {topic} proves the exact opposite is true.',
    'Ironically, {topic} flips the entire narrative on its head.',
  ],
  preview: [
    'Coming up: the real story behind {topic}.',
    'Next, we reveal the secret of {topic}.',
    'Up ahead: {topic} takes an unexpected turn.',
    'Stay tuned — {topic} is about to get interesting.',
    'In just a moment, the truth about {topic} unfolds.',
  ],
  mystery: [
    'But there\'s a missing piece to {topic} that changes everything.',
    'One detail about {topic} has been overlooked for years.',
    'The real mystery of {topic} is only just beginning.',
    'Something about {topic} doesn\'t add up — and we\'re about to find out why.',
    'A hidden clue in {topic} reveals a much bigger picture.',
  ],
};

export function generateCliffhangerPrompt(
  segmentText: string,
  nextSegmentText: string,
  type?: CliffhangerType,
): string {
  if (!segmentText || !nextSegmentText) return '';

  const resolvedType = type || detectCliffhangerOpportunity(segmentText, nextSegmentText) || 'tease';
  const templates = CLIFFHANGER_TEMPLATES[resolvedType];
  const topic = extractTopic(segmentText, nextSegmentText);

  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace(/\{topic\}/g, topic);
}

function extractTopic(segmentText: string, nextSegmentText: string): string {
  const nextWords = nextSegmentText.split(/\s+/).filter(w => w.length > 4);
  const segmentWords = segmentText.split(/\s+/).filter(w => w.length > 4);

  const stopWords = new Set([
    'about', 'after', 'again', 'being', 'between', 'could', 'every',
    'found', 'great', 'their', 'there', 'these', 'thing', 'think',
    'those', 'through', 'under', 'where', 'which', 'while', 'would',
  ]);

  const significant = nextWords.filter(w => !stopWords.has(w.toLowerCase()));
  if (significant.length >= 2) {
    return significant.slice(0, 3).join(' ').toLowerCase();
  }

  const segSignificant = segmentWords.filter(w => !stopWords.has(w.toLowerCase()));
  if (segSignificant.length >= 2) {
    return segSignificant.slice(0, 3).join(' ').toLowerCase();
  }

  return 'this';
}

export function detectCliffhangerOpportunity(
  currentText: string,
  nextText: string,
): CliffhangerType | null {
  if (!currentText || !nextText) return null;

  const questionWords = /\b(why|how|what|when|where|who|which)\b/i;
  const contradictionWords = /\b(but|however|actually|contrary|surprisingly|instead|despite|although)\b/i;
  const previewWords = /\b(next|then|later|after|finally|eventually|ultimately)\b/i;
  const mysteryWords = /\b(secret|hidden|unknown|mystery|missing|undiscovered|unexplained)\b/i;

  const hasNextQuestion = questionWords.test(nextText);
  const hasNextContradiction = contradictionWords.test(nextText);
  const hasNextPreview = previewWords.test(nextText);
  const hasNextMystery = mysteryWords.test(nextText);

  if (hasNextContradiction) return 'contradiction';
  if (hasNextMystery) return 'mystery';
  if (hasNextQuestion) return 'question';
  if (hasNextPreview) return 'preview';

  const currentSentences = currentText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (currentSentences.length >= 3) return 'tease';

  return null;
}

export function injectCliffhanger(
  segmentText: string,
  cliffhanger: string,
): string {
  if (!segmentText) return cliffhanger;
  if (!cliffhanger) return segmentText;

  const trimmed = segmentText.trimEnd();
  const endsWithPunctuation = /[.!?]$/.test(trimmed);
  const base = endsWithPunctuation ? trimmed : trimmed + '.';

  return `${base} ${cliffhanger}`;
}
