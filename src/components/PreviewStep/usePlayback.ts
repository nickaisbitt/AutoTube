import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VideoProject } from '../../types';
import { hasSpeechSupport, speakText, stopSpeaking } from '../../utils/speech';
import type { PreviewMode } from './VideoPlayer';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  currentSegmentIndex: number;
  isMuted: boolean;
  isNarrating: boolean;
  speechSupported: boolean;
  totalDuration: number;
}

export interface PlaybackActions {
  handlePlayPause: () => void;
  handleResetPlayback: () => void;
  jumpToTime: (time: number) => void;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentTime: (time: number) => void;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  formatTime: (seconds: number) => string;
}

export function usePlayback(
  project: VideoProject | null,
  previewMode: PreviewMode,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): PlaybackState & PlaybackActions {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const startTimeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const lastNarratedSegment = useRef<number>(-1);
  const seekingRef = useRef<boolean>(false);
  const preloadedUrls = useRef<Set<string>>(new Set());
  const currentTimeRef = useRef(0);
  const totalDurationRef = useRef(0);
  const [audioRef] = useState(() => new Audio());

  useEffect(() => {
    const handleEnd = () => setIsNarrating(false);
    audioRef.addEventListener('ended', handleEnd);
    return () => {
      audioRef.removeEventListener('ended', handleEnd);
      audioRef.pause();
      audioRef.src = '';
      audioRef.load();
      stopSpeaking();
    };
  }, [audioRef]);

  useEffect(() => {
    if (previewMode === 'rendered' && videoRef.current) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime, previewMode, videoRef]);

  useEffect(() => {
    if (previewMode === 'rendered' && videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(err => { console.warn('Autoplay blocked:', err.message); });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, previewMode, videoRef]);

  useEffect(() => {
    if (previewMode !== 'storyboard') return;
    stopSpeaking();
    audioRef.pause();
    setIsNarrating(false);
    setIsPlaying(false);
  }, [previewMode]);

  const totalDuration = useMemo(() => {
    if (!project) return 0;
    const editSegments = project.editPlan?.segments;
    return project.script.reduce((sum, segment) => {
      if (editSegments) {
        const editEntry = editSegments.find((e) => e.segmentId === segment.id);
        if (editEntry?.adjustedDuration != null) {
          return sum + editEntry.adjustedDuration;
        }
      }
      return sum + segment.duration;
    }, 0);
  }, [project, project?.editPlan]);

  useEffect(() => {
    setSpeechSupported(hasSpeechSupport());
  }, []);

  // Keep refs in sync for keyboard handler
  currentTimeRef.current = currentTime;
  totalDurationRef.current = totalDuration;

  const animate = useCallback((time: number) => {
    if (!startTimeRef.current) startTimeRef.current = time;
    const elapsed = (time - startTimeRef.current) / 1000;

    if (elapsed >= totalDuration) {
      setIsPlaying(false);
      setCurrentTime(totalDuration);
      return;
    }

    setCurrentTime(elapsed);
    requestRef.current = requestAnimationFrame(animate);
  }, [totalDuration]);

  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = performance.now() - (currentTime * 1000);
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, animate]);

  // Determine current segment and trigger pre-loading
  useEffect(() => {
    if (!project) return;

    let accumulated = 0;
    let foundIndex = 0;
    for (let i = 0; i < project.script.length; i += 1) {
      const segDuration = project.script[i].duration;
      if (currentTime < accumulated + segDuration) {
        foundIndex = i;
        break;
      }
      accumulated += segDuration;
    }

    if (foundIndex !== currentSegmentIndex) {
      setCurrentSegmentIndex(foundIndex);
    } else if (seekingRef.current) {
      seekingRef.current = false;
    }

    const segIdsToPreload = project.script
      .slice(foundIndex, Math.min(foundIndex + 3, project.script.length))
      .map(s => s.id);
    const mediaToPreload = project.media.filter(a => segIdsToPreload.includes(a.segmentId));
    for (const asset of mediaToPreload) {
      if (asset.url && !preloadedUrls.current.has(asset.url)) {
        if (preloadedUrls.current.size > 500) preloadedUrls.current.clear();
        const img = new Image();
        img.src = asset.url;
        preloadedUrls.current.add(asset.url);
      }
    }
  }, [currentTime, project, currentSegmentIndex]);

  // Narration sync logic
  useEffect(() => {
    if (!project || !isPlaying) return;
    if (seekingRef.current) return;

    if (currentSegmentIndex !== lastNarratedSegment.current) {
      lastNarratedSegment.current = currentSegmentIndex;
      const narration = project.narration[currentSegmentIndex];

      if (narration?.status === 'ready') {
        setIsNarrating(true);
        if (narration.audioUrl) {
          audioRef.src = narration.audioUrl;
          audioRef.play().catch(err => {
            console.error('Audio playback failed in preview:', err);
            setIsNarrating(false);
          });
        } else {
          void speakText(narration.text, {
            preferredVoiceName: narration.voice,
            onEnd: () => setIsNarrating(false),
            onError: () => setIsNarrating(false),
          });
        }
      }
    }
  }, [currentSegmentIndex, isPlaying, project]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          jumpToTime(Math.max(0, currentTimeRef.current - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          jumpToTime(Math.min(totalDurationRef.current, currentTimeRef.current + 5));
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(prev => !prev);
          break;
        case 'r':
          e.preventDefault();
          jumpToTime(0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isPlaying || isMuted) {
      stopSpeaking();
      audioRef.pause();
      setIsNarrating(false);
    }
  }, [isMuted, isPlaying]);

  const formatTime = useCallback((seconds: number) => {
    seconds = Math.max(0, seconds);
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${minutes}:${remaining.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }, []);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      stopSpeaking();
      audioRef.pause();
      setIsNarrating(false);
      return;
    }

    if (currentTime === 0) {
      lastNarratedSegment.current = -1;
    } else {
      lastNarratedSegment.current = currentSegmentIndex;
    }

    setIsPlaying(true);
  };

  const handleResetPlayback = () => {
    stopSpeaking();
    audioRef.pause();
    setCurrentTime(0);
    setIsPlaying(false);
    setIsNarrating(false);
    lastNarratedSegment.current = -1;
  };

  const jumpToTime = (newTime: number) => {
    seekingRef.current = true;
    setCurrentTime(Math.max(0, newTime));
    lastNarratedSegment.current = -1;
    stopSpeaking();
    audioRef.pause();
    setIsNarrating(false);
  };

  return {
    isPlaying,
    currentTime,
    currentSegmentIndex,
    isMuted,
    isNarrating,
    speechSupported,
    totalDuration,
    handlePlayPause,
    handleResetPlayback,
    jumpToTime,
    setIsMuted,
    setCurrentTime,
    setIsPlaying,
    formatTime,
  };
}
