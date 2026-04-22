import { useState, useCallback } from 'react';
import type {
  PipelineStep,
  StepStatus,
  VideoProject,
  TopicConfig,
  ScriptSegment,
  MediaAsset,
  NarrationClip,
  SegmentVisualPlan,
  AppConfig,
  SystemLog,
} from './types';
import { hasSpeechSupport, loadSpeechVoices, pickPreferredVoice, stopSpeaking } from './utils/speech';
import {
  sourceSegmentMedia,
  replaceMediaAsset as replaceSegmentMedia,
  resetUsedUrlsMap,
} from './services/media';
import { resolveTopicContext, planSegmentVisuals } from './services/visualPlanner';
import { generateOpenAITTS } from './services/tts';
import { generateAIScript } from './services/llm';
import { renderVideoToBlob } from './services/videoRenderer';
import { subscribeToLogs } from './services/logger';
import { useEffect, useRef } from 'react';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Visual planning + media harvesting now lives in src/services/{visualPlanner,media}.ts



const SCRIPT_TEMPLATES: Record<string, { sections: { title: string; type: ScriptSegment['type'] }[] }> = {
  business_insider: {
    sections: [
      { title: 'The Hook', type: 'intro' },
      { title: 'What Most People Get Wrong', type: 'section' },
      { title: 'The Origin Story', type: 'section' },
      { title: 'Key Players', type: 'section' },
      { title: 'The Turning Point', type: 'transition' },
      { title: 'The Numbers Don\'t Lie', type: 'section' },
      { title: 'Insider Perspectives', type: 'section' },
      { title: 'The Ripple Effects', type: 'section' },
      { title: 'What Comes Next', type: 'section' },
      { title: 'Final Take', type: 'outro' },
    ],
  },
  warfront: {
    sections: [
      { title: 'The Opening Salvo', type: 'intro' },
      { title: 'The Stakes', type: 'section' },
      { title: 'Historical Roots', type: 'section' },
      { title: 'First Moves', type: 'section' },
      { title: 'The Escalation', type: 'transition' },
      { title: 'Critical Intelligence', type: 'section' },
      { title: 'On The Ground', type: 'section' },
      { title: 'The Tipping Point', type: 'section' },
      { title: 'Aftermath', type: 'section' },
      { title: 'What It All Means', type: 'outro' },
    ],
  },
  documentary: {
    sections: [
      { title: 'Setting The Scene', type: 'intro' },
      { title: 'The Beginning', type: 'section' },
      { title: 'Key Events Unfold', type: 'section' },
      { title: 'The People Involved', type: 'section' },
      { title: 'A Deeper Look', type: 'transition' },
      { title: 'Expert Analysis', type: 'section' },
      { title: 'The Hidden Connections', type: 'section' },
      { title: 'Broader Implications', type: 'section' },
      { title: 'Where We Stand Today', type: 'section' },
      { title: 'Legacy', type: 'outro' },
    ],
  },
  explainer: {
    sections: [
      { title: 'The Question', type: 'intro' },
      { title: 'Breaking It Down', type: 'section' },
      { title: 'The Mechanism', type: 'section' },
      { title: 'Why It Matters Now', type: 'section' },
      { title: 'The Pivot', type: 'transition' },
      { title: 'Real Examples', type: 'section' },
      { title: 'Common Myths Debunked', type: 'section' },
      { title: 'The Data Speaks', type: 'section' },
      { title: 'Key Insights', type: 'section' },
      { title: 'Your Next Step', type: 'outro' },
    ],
  },
};

// NOTE: smart-fallback + candidate→asset materialization moved to
// src/services/media.ts so the harvester can attach reasoning to each asset.



function generateNarrationText(topic: string, _sectionTitle: string, type: ScriptSegment['type'], tone: string): string {
  const hooks: Record<string, string[]> = {
    informative: [
      `${topic} — it's a story that most people have never heard. But what's actually happening behind the scenes is far more complex than headlines suggest, and the ripple effects touch every single one of us.`,
      `Most people think they understand ${topic}. They don't. The real story starts with a single data point that changed everything experts thought they knew.`,
      `Here's something that will change how you see ${topic}. It started as a small signal — easy to miss — but it's grown into something that could reshape the entire landscape.`,
    ],
    dramatic: [
      `They said it couldn't happen. They said the numbers didn't add up. But ${topic} just proved every single skeptic wrong — and what comes next will shock you.`,
      `In the span of seventy-two hours, ${topic} went from a footnote to the single biggest story in the world. This is the untold account of how it all unfolded.`,
      `What I'm about to show you about ${topic} was buried for years. The people who knew weren't talking. Until now.`,
    ],
    casual: [
      `Okay so I fell down a rabbit hole on ${topic} and honestly? I can't believe more people aren't talking about this. The deeper you go, the wilder it gets.`,
      `So ${topic} has been all over the news lately, but here's the thing — nobody's actually explaining what's really going on. So let me break it down for you.`,
      `I spent three days researching ${topic} and what I found completely changed my mind. Let me walk you through the key pieces.`,
    ],
    urgent: [
      `Right now, as you watch this, ${topic} is reaching a tipping point. The next seventy-two hours could determine the outcome for millions. Here's the full picture.`,
      `This is not a drill. ${topic} is moving faster than anyone predicted, and the window to understand what's happening is closing. Let me get you up to speed.`,
      `By the time most people see this, the story will have already shifted. ${topic} is evolving in real time, and what we know today may be outdated tomorrow.`,
    ],
  };

  const sections: Record<string, string[]> = {
    informative: [
      `The numbers tell a fascinating story. When researchers first started tracking this, the trend line was almost flat. Then, almost overnight, everything changed. The growth curve went vertical.`,
      `Here's what most analysts missed. The data isn't just showing growth — it's showing a fundamental shift in how this entire system operates. And it's accelerating.`,
      `Look at the timeline. Every major milestone lines up with a single underlying catalyst that almost nobody talks about. Once you see the pattern, you can't unsee it.`,
      `The first indicator appeared in the quarterly reports. Most people scrolled right past it. But buried in the footnotes was a number that would eventually become the most important metric in this entire story.`,
    ],
    dramatic: [
      `But this is where the story takes a dark turn. What was happening behind closed doors was unlike anything the industry had ever seen. And the fallout would be catastrophic.`,
      `Then came the moment nobody expected. A single decision — made in a boardroom with just four people present — would cascade into consequences that affected millions.`,
      `The turning point wasn't dramatic. There was no explosion, no breaking news alert. It was a quiet email sent at 2 AM on a Tuesday. But its impact would echo for years.`,
    ],
    casual: [
      `Now this is where it gets really interesting. I literally had to read this three times because the implications are so much bigger than what it looks like on the surface.`,
      `Okay so buckle up because this part is wild. When you connect these dots, the picture that emerges is honestly kind of mind-blowing.`,
      `And here's the part that nobody's talking about. The ripple effects from this are still playing out right now, and most people have no idea.`,
    ],
    urgent: [
      `The data is unambiguous. Three independent research teams reached the same conclusion within weeks of each other. And their findings point in one direction only.`,
      `What's happening right now has been building for years. Every major indicator was flashing red, but the warning signs were systematically ignored. The consequences are now unavoidable.`,
    ],
  };

  const transitions: Record<string, string[]> = {
    informative: [
      `So if that's the current state, you're probably asking — what happens next? The answer might surprise you.`,
      `Now that you understand the foundation, let's look at the piece of this puzzle that changes everything.`,
      `But context alone doesn't tell the full story. What happened next is the part that no one predicted.`,
    ],
    dramatic: [
      `But that was only the beginning. What came next would make the first chapter look like a calm before a much larger storm.`,
      `Just when you thought it couldn't get more intense — it did. A new player entered the scene, and nothing would be the same after.`,
      `The second act of this story is where it all unravels. Brace yourself.`,
    ],
    casual: [
      `Alright, now that you know the backstory, let me show you the part that really blew my mind.`,
      `But wait — it gets even crazier. Just when you think you've figured out where this is going, there's a twist.`,
      `Okay so that was the setup. Now here's where it gets absolutely wild.`,
    ],
    urgent: [
      `And this is where the timeline accelerates. What took months to unfold before now happens in days.`,
      `The next development changed the entire equation. And it happened faster than anyone thought possible.`,
    ],
  };

  const outros: Record<string, string[]> = {
    informative: [
      `So where does this leave us? The trajectory is clear. ${topic} isn't just a story — it's a signal of much larger changes ahead. The people who understand this now will have a significant advantage. Subscribe if you want to stay ahead of the curve.`,
      `The implications of ${topic} extend far beyond what we covered today. We're witnessing a structural shift that will define the next decade. If this resonated with you, hit subscribe — because we're just getting started.`,
    ],
    dramatic: [
      `The final chapter of ${topic} hasn't been written yet. But what we've seen so far suggests that the best — or worst — is still to come. Subscribe now, because when the next development breaks, you'll want to be the first to know.`,
      `Every empire has a beginning, a peak, and a reckoning. ${topic} has reached that reckoning. What happens next will determine everything. Stay subscribed. Stay watching.`,
    ],
    casual: [
      `So that's the full picture on ${topic} — or at least, as much as we could fit into one video. If this made you see things differently, smash that like button and subscribe. I've got a Part 2 brewing.`,
      `Honestly, I could talk about ${topic} for hours. But I'll leave it here for now. Drop a comment with your take, smash subscribe, and I'll catch you in the next one.`,
    ],
    urgent: [
      `Time is the one thing we can't get back. ${topic} is moving fast, and the decisions being made right now will have consequences for years. Subscribe with notifications on — because the next update could be the most important one yet.`,
    ],
  };

  const allTemplates: Record<string, Record<string, string[]>> = {
    intro: hooks,
    section: sections,
    transition: transitions,
    outro: outros,
  };

  const byType = allTemplates[type];
  const byTone = byType?.[tone] || byType?.informative;
  const options: string[] = byTone || ['This is a placeholder for this section.'];
  return options[Math.floor(Math.random() * options.length)];
}

function generateVisualNote(type: ScriptSegment['type'], sectionTitle: string): string {
  const notes: Record<string, string[]> = {
    intro: [
      'Dramatic zoom into title card with cinematic overlay',
      'Montage of relevant B-roll footage with text overlay',
      'Dark background with animated statistics appearing',
    ],
    section: [
      `Infographic showing key data points for ${sectionTitle}`,
      'Split screen: footage left, animated data right',
      'Map visualization with highlighted regions',
      'Timeline animation showing progression of events',
    ],
    transition: [
      'Smooth cross-dissolve with ambient background',
      'Animated divider with subtle motion graphics',
    ],
    outro: [
      'Subscribe button animation with channel branding',
      'End screen with suggested videos layout',
    ],
  };

  const options = notes[type] || notes.section;
  return options[Math.floor(Math.random() * options.length)];
}

export function useVideoProject() {
  const [currentStep, setCurrentStep] = useState<PipelineStep>('topic');
  const [logs, setLogs] = useState<SystemLog[]>([]);

  // Initialize logger subscription
  useEffect(() => {
    const unsub = subscribeToLogs((newLog) => {
      setLogs((prev) => [...prev, newLog].slice(-100)); // Keep last 100 logs
    });
    return unsub;
  }, []);

  const [stepStatuses, setStepStatuses] = useState<Record<PipelineStep, StepStatus>>({
    topic: 'active',
    script: 'idle',
    media: 'idle',
    narration: 'idle',
    assembly: 'idle',
    preview: 'idle',
  });
  
  const [appConfig, setAppConfigInternal] = useState<AppConfig>(() => {
    const defaultConfig: AppConfig = {
      pexelsKey: '',
      openAIKey: '',
      serperKey: '',
      openRouterKey: '',
      firecrawlKey: '',
      sourceType: 'stock',
    };

    try {
      const stored = localStorage.getItem('autotube_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultConfig, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load config from storage:', e);
    }
    return defaultConfig;
  });

  const setAppConfig = useCallback((config: AppConfig) => {
    setAppConfigInternal(config);
    localStorage.setItem('autotube_config', JSON.stringify(config));
  }, []);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [topicConfig, setTopicConfig] = useState<TopicConfig>({
    topic: '',
    style: 'business_insider',
    targetDuration: 8,
    tone: 'informative',
    audience: 'General audience interested in current events',
  });
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');

  const updateStepStatus = useCallback((step: PipelineStep, status: StepStatus) => {
    setStepStatuses((prev) => ({ ...prev, [step]: status }));
  }, []);

  const simulateProcessing = useCallback((
    duration: number,
    messages: string[],
    onProgress: (progress: number) => void,
  ): Promise<void> => {
    return new Promise((resolve) => {
      let progress = 0;
      const interval = duration / 100;
      let msgIndex = 0;

      const timer = window.setInterval(() => {
        progress += 1;
        onProgress(progress);
        setProcessingProgress(progress);

        const newMsgIndex = Math.floor((progress / 100) * messages.length);
        if (newMsgIndex !== msgIndex && newMsgIndex < messages.length) {
          msgIndex = newMsgIndex;
          setProcessingMessage(messages[msgIndex]);
        }

        if (progress >= 100) {
          window.clearInterval(timer);
          resolve();
        }
      }, interval);
    });
  }, []);

  const renderAbortRef = useRef<AbortController | null>(null);
  const sourcingRef = useRef(false);

  const generateScript = useCallback(async (config: TopicConfig) => {
    updateStepStatus('topic', 'complete');
    updateStepStatus('script', 'processing');
    updateStepStatus('media', 'idle');
    updateStepStatus('narration', 'idle');
    updateStepStatus('assembly', 'idle');
    updateStepStatus('preview', 'idle');
    setCurrentStep('script');

    const template = SCRIPT_TEMPLATES[config.style] || SCRIPT_TEMPLATES.business_insider;
    const avgSegmentDuration = (config.targetDuration * 60) / template.sections.length;

    let segments: ScriptSegment[];

    if (appConfig.openRouterKey) {
      setProcessingProgress(15);
      setProcessingMessage('Querying OpenRouter for authentic narrative...');
      try {
        segments = await generateAIScript(config, appConfig.openRouterKey);
      } catch (err) {
        console.error('AI script generation failed, falling back to templates:', err);
        segments = template.sections.map((section) => ({
          id: generateId(),
          type: section.type,
          title: section.title,
          narration: generateNarrationText(config.topic, section.title, section.type, config.tone),
          visualNote: generateVisualNote(section.type, section.title),
          duration: Math.max(18, Math.round(avgSegmentDuration + (Math.random() - 0.5) * 20)),
        }));
      }
    } else {
      await simulateProcessing(
        3200,
        [
          'Analyzing topic and gathering context...',
          'Structuring the narrative arc...',
          'Generating segment copy...',
          'Adding hooks and transitions...',
          'Finalizing the YouTube-ready script...',
        ],
        () => {},
      );

      segments = template.sections.map((section) => ({
        id: generateId(),
        type: section.type,
        title: section.title,
        narration: generateNarrationText(config.topic, section.title, section.type, config.tone),
        visualNote: generateVisualNote(section.type, section.title),
        duration: Math.max(18, Math.round(avgSegmentDuration + (Math.random() - 0.5) * 20)),
      }));
    }

    const newProject: VideoProject = {
      id: generateId(),
      title: `${config.topic} — The Full Story`,
      topic: config.topic,
      style: config.style,
      targetDuration: config.targetDuration,
      script: segments,
      media: [],
      narration: [],
      status: 'draft',
      createdAt: new Date(),
    };

    setProject(newProject);
    updateStepStatus('script', 'complete');
    updateStepStatus('media', 'active');
    setProcessingProgress(0);
    setProcessingMessage('');
    return newProject;
  }, [simulateProcessing, updateStepStatus, appConfig]);

  const sourceMedia = useCallback(async () => {
    if (!project || sourcingRef.current) return;
    sourcingRef.current = true;

    try {
    updateStepStatus('media', 'processing');
    setCurrentStep('media');

    // ---- STEP 1: research the topic (Wikipedia entity resolution) ----
    setProcessingProgress(4);
    setProcessingMessage(`Researching "${project.topic}" on Wikipedia…`);
    const topicContext = await resolveTopicContext(project.topic);
    setProcessingMessage(
      topicContext.resolvedTitle
        ? `Identified "${topicContext.resolvedTitle}" — ${topicContext.kind}. Planning visuals…`
        : `No Wikipedia match. Planning from raw topic…`,
    );

    // ---- STEP 2: plan visuals for every segment (the "thinking" step) ----
    const visualPlans: Record<string, SegmentVisualPlan> = {};
    for (let i = 0; i < project.script.length; i += 1) {
      const seg = project.script[i];
      visualPlans[seg.id] = await planSegmentVisuals(seg, topicContext, appConfig.openRouterKey);
    }

    // ---- STEP 3: harvest images for each plan ----
    const media: MediaAsset[] = [];
    const usedUrls = new Set<string>();

    for (let i = 0; i < project.script.length; i += 1) {
      const segment = project.script[i];
      const plan = visualPlans[segment.id];
      const beatLabel = plan.beat.toUpperCase();
      const conceptLabel = plan.concepts[0]?.description || segment.title;

      setProcessingProgress(15 + Math.round((i / project.script.length) * 80));
      setProcessingMessage(`[${beatLabel}] ${conceptLabel} — harvesting…`);

      const sourced = await sourceSegmentMedia(segment, plan, topicContext, usedUrls, i, appConfig);
      
      // Push all harvested shots for this segment
      for (const asset of sourced.assets) {
        media.push({ id: generateId(), segmentId: segment.id, ...asset });
      }

      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }

    setProject((prev) => (prev ? {
      ...prev,
      media,
      topicContext,
      visualPlans,
    } : null));
    updateStepStatus('media', 'complete');
    updateStepStatus('narration', 'active');
    setProcessingProgress(0);
    setProcessingMessage('');
    } catch (err) {
      console.error('sourceMedia failed:', err);
      updateStepStatus('media', 'error');
      setProcessingMessage(`Media sourcing failed: ${(err as Error).message}`);
    } finally {
      sourcingRef.current = false;
    }
  }, [project, updateStepStatus, appConfig]);

  const replaceMediaAsset = useCallback(async (assetId: string) => {
    if (!project) return;

    const currentAsset = project.media.find((asset) => asset.id === assetId);
    if (!currentAsset) return;
    const segment = project.script.find((item) => item.id === currentAsset.segmentId);
    if (!segment) return;

    try {
      // Use the existing plan if we already have one; otherwise re-plan on the fly.
      const segmentIndex = project.script.findIndex((item) => item.id === segment.id);
      const topicContext = project.topicContext || (await resolveTopicContext(project.topic));
      const plan =
        project.visualPlans?.[segment.id] ||
        (await planSegmentVisuals(segment, topicContext, appConfig.openRouterKey));

      const excludeUrls = new Set(project.media.map((asset) => asset.url));
      const replacement = await replaceSegmentMedia(segment, plan, topicContext, excludeUrls, segmentIndex, appConfig);

      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          topicContext: prev.topicContext || topicContext,
          visualPlans: { ...(prev.visualPlans || {}), [segment.id]: plan },
          media: prev.media.map((asset) =>
            asset.id === assetId ? { ...asset, ...replacement } : asset,
          ),
        };
      });
    } catch (err) {
      console.error('replaceMediaAsset failed:', err);
    }
  }, [project, appConfig]);

  const generateNarration = useCallback(async () => {
    if (!project) return;

    updateStepStatus('narration', 'processing');
    setCurrentStep('narration');

    setProcessingProgress(6);
    setProcessingMessage('Checking TTS options...');

    const supported = hasSpeechSupport();
    const voices = supported ? await loadSpeechVoices() : [];
    const selectedVoice = pickPreferredVoice(voices);

    const narration: NarrationClip[] = [];
    for (let i = 0; i < project.script.length; i += 1) {
      const segment = project.script[i];
      const wordCount = segment.narration.split(/\s+/).length;
      const estimatedDuration = Math.max(6, Math.ceil((wordCount / 150) * 60));

      setProcessingProgress(Math.round(((i + 1) / project.script.length) * 100));
      setProcessingMessage(`Generating narration for “${segment.title}”...`);

      let audioUrl: string | undefined;
      let status: NarrationClip['status'] = 'ready';
      let voiceUsed = selectedVoice?.name || 'No browser voice available';

      if (appConfig.openAIKey) {
        const url = await generateOpenAITTS(segment.narration, appConfig.openAIKey);
        if (url) {
          audioUrl = url;
          voiceUsed = 'OpenAI Alloy';
        } else if (!supported || !selectedVoice) {
          status = 'unavailable';
        }
      } else if (!supported || !selectedVoice) {
        status = 'unavailable';
      }

      narration.push({
        id: generateId(),
        segmentId: segment.id,
        text: segment.narration,
        voice: voiceUsed,
        duration: estimatedDuration,
        status,
        audioUrl,
        mode: audioUrl ? 'exported_file' : 'live_browser',
      });

      // Avoid rate limiting or just a small delay for UI
      if (appConfig.openAIKey) await new Promise((resolve) => window.setTimeout(resolve, 300));
      else await new Promise((resolve) => window.setTimeout(resolve, 90));
    }

    setProject((prev) => {
      if (!prev) return null;
      // Revoke old narration blob URLs now that new ones are ready
      prev.narration.forEach((clip) => {
        if (clip.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(clip.audioUrl);
      });
      return { ...prev, narration };
    });
    updateStepStatus('narration', 'complete');
    updateStepStatus('assembly', 'active');
    setProcessingProgress(0);
    setProcessingMessage(supported && selectedVoice
      ? 'Browser narration is ready for live preview.'
      : 'Browser TTS is unavailable on this device.');
  }, [project, updateStepStatus, appConfig.openAIKey]);

  const assembleVideo = useCallback(async () => {
    if (!project) return;

    updateStepStatus('assembly', 'processing');
    setCurrentStep('assembly');

    renderAbortRef.current = new AbortController();

    try {
      const blob = await renderVideoToBlob(project, {
        width: 1280,
        height: 720,
        onProgress: (pct, message) => {
          setProcessingProgress(pct);
          setProcessingMessage(message);
        },
        signal: renderAbortRef.current.signal,
      });

      // Revoke old thumbnail blob URL to prevent memory leak
      if (project.thumbnail?.startsWith('blob:')) URL.revokeObjectURL(project.thumbnail);
      const url = URL.createObjectURL(blob);
      setProject((prev) => (prev ? { ...prev, status: 'complete', thumbnail: url } : null));
      updateStepStatus('assembly', 'complete');
      updateStepStatus('preview', 'active');
      setCurrentStep('preview');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Video render failed:', err);
        updateStepStatus('assembly', 'error');
        setProcessingMessage(`Render failed: ${(err as Error).message}`);
      }
    }

    setProcessingProgress(0);
    setProcessingMessage('');
  }, [project, updateStepStatus]);

  const cancelRender = useCallback(() => {
    renderAbortRef.current?.abort();
  }, []);

  const updateNarrationText = useCallback((segmentId: string, text: string) => {
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        script: prev.script.map((seg) =>
          seg.id === segmentId ? { ...seg, narration: text } : seg
        ),
      };
    });
  }, []);

  const resetProject = useCallback(() => {
    stopSpeaking();
    resetUsedUrlsMap();
    setProject(null);
    setCurrentStep('topic');
    setStepStatuses({
      topic: 'active',
      script: 'idle',
      media: 'idle',
      narration: 'idle',
      assembly: 'idle',
      preview: 'idle',
    });
    setProcessingProgress(0);
    setProcessingMessage('');
    setTopicConfig({
      topic: '',
      style: 'business_insider',
      targetDuration: 8,
      tone: 'informative',
      audience: 'General audience interested in current events',
    });
  }, []);

  return {
    currentStep,
    setCurrentStep,
    stepStatuses,
    project,
    topicConfig,
    setTopicConfig,
    processingProgress,
    processingMessage,
    generateScript,
    sourceMedia,
    replaceMediaAsset,
    generateNarration,
    assembleVideo,
    cancelRender,
    resetProject,
    logs,
    appConfig,
    setAppConfig,
    updateNarrationText,
  };
}
