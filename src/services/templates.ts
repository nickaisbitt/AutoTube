import { TopicConfig } from '../types';

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: Omit<TopicConfig, 'topic'>;
  estimatedDuration: string;
  tags: string[];
}

// --- Semantic Color System ---
// Colors mapped to narrative meaning for consistent visual communication
export const SEMANTIC_COLORS = {
  threat: '#ef4444',      // Red - danger, risk, attack
  explanation: '#3b82f6', // Blue - information, context, neutral
  action: '#22c55e',      // Green - safety, solution, action steps
  warning: '#f59e0b',     // Amber - caution, alert, attention
  neutral: '#64748b',     // Slate - background, secondary info
} as const;

export type SemanticColorKey = keyof typeof SEMANTIC_COLORS;

// --- Section Visual Modes ---
// Each section of a video can have a distinct visual mode that defines its look and feel
export interface SectionVisualMode {
  colorPalette: { primary: string; secondary: string; accent: string };
  motionStyle: 'intimate' | 'steady' | 'dynamic' | 'calm' | 'urgent';
  typographyWeight: 'light' | 'regular' | 'bold' | 'heavy';
  pacingPreference: 'fast' | 'moderate' | 'slow';
}

export const SECTION_VISUAL_MODES: Record<string, SectionVisualMode> = {
  personal: {
    colorPalette: { primary: SEMANTIC_COLORS.threat, secondary: SEMANTIC_COLORS.neutral, accent: SEMANTIC_COLORS.warning },
    motionStyle: 'intimate',
    typographyWeight: 'bold',
    pacingPreference: 'fast',
  },
  corporate: {
    colorPalette: { primary: SEMANTIC_COLORS.explanation, secondary: SEMANTIC_COLORS.neutral, accent: SEMANTIC_COLORS.warning },
    motionStyle: 'steady',
    typographyWeight: 'regular',
    pacingPreference: 'moderate',
  },
  geopolitical: {
    colorPalette: { primary: SEMANTIC_COLORS.threat, secondary: SEMANTIC_COLORS.explanation, accent: SEMANTIC_COLORS.neutral },
    motionStyle: 'dynamic',
    typographyWeight: 'heavy',
    pacingPreference: 'moderate',
  },
  practical: {
    colorPalette: { primary: SEMANTIC_COLORS.action, secondary: SEMANTIC_COLORS.neutral, accent: SEMANTIC_COLORS.explanation },
    motionStyle: 'calm',
    typographyWeight: 'regular',
    pacingPreference: 'slow',
  },
  advice: {
    colorPalette: { primary: SEMANTIC_COLORS.action, secondary: SEMANTIC_COLORS.explanation, accent: SEMANTIC_COLORS.neutral },
    motionStyle: 'calm',
    typographyWeight: 'light',
    pacingPreference: 'slow',
  },
};

// --- Brand Kit ---
// Consistent visual identity across all video outputs
export interface BrandKit {
  fonts: { heading: string; body: string; accent: string };
  colors: typeof SEMANTIC_COLORS;
  transitions: { default: string; sectionChange: string; emphasis: string };
  lowerThirds: { style: string; position: 'bottom-left' | 'bottom-center'; animation: string };
}

export const DEFAULT_BRAND_KIT: BrandKit = {
  fonts: {
    heading: 'Inter Bold',
    body: 'Inter Regular',
    accent: 'Inter SemiBold',
  },
  colors: SEMANTIC_COLORS,
  transitions: {
    default: 'cut',
    sectionChange: 'fade',
    emphasis: 'zoom',
  },
  lowerThirds: {
    style: 'modern-minimal',
    position: 'bottom-left',
    animation: 'slide-up',
  },
};

/**
 * Returns the visual mode configuration for a given section classification.
 * Falls back to 'practical' mode if the classification is not recognized.
 */
export function getSectionVisualMode(classification: string): SectionVisualMode {
  return SECTION_VISUAL_MODES[classification] ?? SECTION_VISUAL_MODES['practical'];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'explainer',
    name: 'Quick Explainer',
    description: 'Fast-paced breakdown of complex topics',
    icon: '💡',
    config: {
      style: 'explainer',
      targetDuration: 5,
      tone: 'informative',
      audience: 'Curious minds, 18-45',
    },
    estimatedDuration: '~5 min',
    tags: ['education', 'explainer', 'quick'],
  },
  {
    id: 'deep-dive',
    name: 'Deep Dive Documentary',
    description: 'In-depth investigative format',
    icon: '🔍',
    config: {
      style: 'documentary',
      targetDuration: 10,
      tone: 'dramatic',
      audience: 'Engaged viewers, 25-55',
    },
    estimatedDuration: '~10 min',
    tags: ['documentary', 'investigation', 'deep-dive'],
  },
  {
    id: 'news-breakdown',
    name: 'News Breakdown',
    description: 'Urgent analysis of current events',
    icon: '📰',
    config: {
      style: 'business_insider',
      targetDuration: 8,
      tone: 'urgent',
      audience: 'News followers, 20-50',
    },
    estimatedDuration: '~8 min',
    tags: ['news', 'analysis', 'current-events'],
  },
  {
    id: 'tech-review',
    name: 'Tech Review',
    description: 'Professional tech analysis format',
    icon: '💻',
    config: {
      style: 'business_insider',
      targetDuration: 8,
      tone: 'informative',
      audience: 'Tech enthusiasts, 18-40',
    },
    estimatedDuration: '~8 min',
    tags: ['tech', 'review', 'analysis'],
  },
  {
    id: 'storytime',
    name: 'Storytime Drama',
    description: 'Dramatic narrative storytelling',
    icon: '🎭',
    config: {
      style: 'warfront',
      targetDuration: 10,
      tone: 'dramatic',
      audience: 'Story lovers, 16-45',
    },
    estimatedDuration: '~10 min',
    tags: ['story', 'drama', 'narrative'],
  },
  {
    id: 'casual-chat',
    name: 'Casual Chat',
    description: 'Relaxed conversational style',
    icon: '💬',
    config: {
      style: 'explainer',
      targetDuration: 5,
      tone: 'casual',
      audience: 'General audience, 16-35',
    },
    estimatedDuration: '~5 min',
    tags: ['casual', 'conversational', 'relaxed'],
  },
];



// --- Section Design Templates ---
// Each section type has a distinct visual template defining shot types, visual elements,
// pacing, color balance, and transitions. This ensures each section feels structurally
// different rather than applying one style to the entire video.
// Requirements: 2.176-2.185

export interface SectionDesignTemplate {
  /** Preferred shot types for this section (e.g., close-up, wide, medium). */
  shotTypes: string[];
  /** Visual elements and motifs appropriate for this section. */
  visualElements: string[];
  /** Pacing style: how fast/slow cuts should feel. */
  pacingStyle: 'rapid' | 'moderate' | 'calm' | 'building' | 'reward';
  /** Color balance description for the section mood. */
  colorBalance: { primary: string; secondary: string; mood: string };
  /** Transition style used when entering this section. */
  transitionIn: string;
  /** Transition style used when leaving this section. */
  transitionOut: string;
}

/**
 * Maps section types to their visual design templates.
 * Each section of a video gets a distinct look and feel to help orientation
 * and prevent monotony (Req 2.181: assign visual mode to each section).
 */
export const SECTION_DESIGN_TEMPLATES: Record<string, SectionDesignTemplate> = {
  'personal-risk': {
    shotTypes: ['close-up', 'screen-capture', 'over-shoulder', 'handheld-intimate'],
    visualElements: ['phone screens', 'alert notifications', 'login prompts', 'personal devices', 'readable UI', 'intimate spaces'],
    pacingStyle: 'rapid',
    colorBalance: { primary: SEMANTIC_COLORS.threat, secondary: SEMANTIC_COLORS.warning, mood: 'urgent-intimate' },
    transitionIn: 'zoom-in',
    transitionOut: 'motif-swipe',
  },
  'corporate-risk': {
    shotTypes: ['medium-wide', 'tracking', 'screen-capture', 'group-shot'],
    visualElements: ['offices', 'server rooms', 'dashboards', 'shutdown effects', 'team reactions', 'meeting rooms'],
    pacingStyle: 'moderate',
    colorBalance: { primary: SEMANTIC_COLORS.explanation, secondary: SEMANTIC_COLORS.warning, mood: 'professional-tense' },
    transitionIn: 'slide-left',
    transitionOut: 'motif-swipe',
  },
  'geopolitical-risk': {
    shotTypes: ['wide-establishing', 'aerial', 'map-overlay', 'medium-wide'],
    visualElements: ['maps', 'infrastructure', 'communications networks', 'strategic overlays', 'satellite imagery', 'government buildings'],
    pacingStyle: 'building',
    colorBalance: { primary: SEMANTIC_COLORS.threat, secondary: SEMANTIC_COLORS.explanation, mood: 'dramatic-expansive' },
    transitionIn: 'map-zoom',
    transitionOut: 'motif-swipe',
  },
  'advice': {
    shotTypes: ['medium', 'clean-frame', 'list-overlay', 'step-by-step'],
    visualElements: ['clean checklists', 'numbered steps', 'green checkmarks', 'simple icons', 'reassuring imagery'],
    pacingStyle: 'calm',
    colorBalance: { primary: SEMANTIC_COLORS.action, secondary: SEMANTIC_COLORS.neutral, mood: 'reassuring-clear' },
    transitionIn: 'fade-in',
    transitionOut: 'gentle-dissolve',
  },
  'story-example': {
    shotTypes: ['close-up', 'medium', 'reaction-shot', 'detail-insert'],
    visualElements: ['character moments', 'before/after contrast', 'disruption visuals', 'aftermath imagery', 'timeline markers'],
    pacingStyle: 'building',
    colorBalance: { primary: SEMANTIC_COLORS.warning, secondary: SEMANTIC_COLORS.neutral, mood: 'narrative-arc' },
    transitionIn: 'story-fade',
    transitionOut: 'motif-swipe',
  },
  'practical-tips': {
    shotTypes: ['clean-frame', 'step-by-step', 'screen-capture', 'medium'],
    visualElements: ['action items', 'tool interfaces', 'progress indicators', 'success states', 'reward visuals'],
    pacingStyle: 'reward',
    colorBalance: { primary: SEMANTIC_COLORS.action, secondary: SEMANTIC_COLORS.explanation, mood: 'empowering-reward' },
    transitionIn: 'bright-wipe',
    transitionOut: 'gentle-dissolve',
  },
  'cta': {
    shotTypes: ['close-up', 'medium', 'callback-shot'],
    visualElements: ['opening problem callback', 'emotional mirror', 'subscribe prompt', 'next-video teaser', 'empowerment imagery'],
    pacingStyle: 'calm',
    colorBalance: { primary: SEMANTIC_COLORS.action, secondary: SEMANTIC_COLORS.threat, mood: 'emotional-resolution' },
    transitionIn: 'callback-zoom',
    transitionOut: 'fade-out',
  },
};

/**
 * Returns the section design template for a given section type.
 * Falls back to 'advice' template if the section type is not recognized.
 * Req 2.181: Assign visual mode to each section (not one style for entire video).
 */
export function getSectionDesignTemplate(sectionType: string): SectionDesignTemplate {
  return SECTION_DESIGN_TEMPLATES[sectionType] ?? SECTION_DESIGN_TEMPLATES['advice'];
}

// --- Section Cards ---
// Title slams / section cards for orientation when the topic changes (Req 2.182).

export interface SectionCard {
  /** Display title for the section card. */
  title: string;
  /** The section type this card belongs to. */
  sectionType: string;
  /** Visual style derived from the section's design template. */
  style: {
    backgroundColor: string;
    accentColor: string;
    animation: 'slam' | 'slide-in' | 'fade-up' | 'type-on';
    durationMs: number;
  };
  /** Icon or motif identifier for brand consistency. */
  motifIcon: string;
}

/**
 * Generates a section card for orientation when the topic changes.
 * Uses the section's design template to derive appropriate visual styling.
 * Req 2.182: Section cards/title slams for orientation when topic changes.
 */
export function generateSectionCard(title: string, sectionType: string): SectionCard {
  const template = getSectionDesignTemplate(sectionType);

  // Map section types to appropriate animations
  const animationMap: Record<string, SectionCard['style']['animation']> = {
    'personal-risk': 'slam',
    'corporate-risk': 'slide-in',
    'geopolitical-risk': 'slam',
    'advice': 'fade-up',
    'story-example': 'type-on',
    'practical-tips': 'fade-up',
    'cta': 'slide-in',
  };

  // Map section types to motif icons for branded feel
  const motifMap: Record<string, string> = {
    'personal-risk': '🔒',
    'corporate-risk': '🏢',
    'geopolitical-risk': '🌐',
    'advice': '✅',
    'story-example': '📖',
    'practical-tips': '🛡️',
    'cta': '▶️',
  };

  return {
    title,
    sectionType,
    style: {
      backgroundColor: template.colorBalance.primary,
      accentColor: template.colorBalance.secondary,
      animation: animationMap[sectionType] ?? 'fade-up',
      durationMs: 1200,
    },
    motifIcon: motifMap[sectionType] ?? '•',
  };
}

// --- Motif Transitions ---
// Repeated branded transitions for consistent feel across sections (Req 2.183).

export interface MotifTransition {
  /** Unique identifier for this transition motif. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** CSS/animation class or description for the renderer. */
  animationType: string;
  /** Duration of the transition in milliseconds. */
  durationMs: number;
  /** Whether this transition includes a sound cue. */
  hasSoundCue: boolean;
  /** Color accent used during the transition. */
  accentColor: string;
}

/**
 * Branded motif transitions used repeatedly across sections so the video
 * feels cohesive and branded rather than random (Req 2.183).
 */
export const MOTIF_TRANSITIONS: MotifTransition[] = [
  {
    id: 'brand-swipe',
    name: 'Brand Swipe',
    animationType: 'horizontal-swipe-with-accent',
    durationMs: 600,
    hasSoundCue: true,
    accentColor: SEMANTIC_COLORS.threat,
  },
  {
    id: 'pulse-cut',
    name: 'Pulse Cut',
    animationType: 'radial-pulse-expand',
    durationMs: 400,
    hasSoundCue: true,
    accentColor: SEMANTIC_COLORS.warning,
  },
  {
    id: 'data-wipe',
    name: 'Data Wipe',
    animationType: 'vertical-data-stream-wipe',
    durationMs: 800,
    hasSoundCue: false,
    accentColor: SEMANTIC_COLORS.explanation,
  },
  {
    id: 'resolve-fade',
    name: 'Resolve Fade',
    animationType: 'soft-fade-with-color-shift',
    durationMs: 1000,
    hasSoundCue: false,
    accentColor: SEMANTIC_COLORS.action,
  },
  {
    id: 'alert-flash',
    name: 'Alert Flash',
    animationType: 'quick-flash-cut',
    durationMs: 300,
    hasSoundCue: true,
    accentColor: SEMANTIC_COLORS.threat,
  },
];
