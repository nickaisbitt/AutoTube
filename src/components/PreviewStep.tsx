import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  Share2,
  ThumbsUp,
  Eye,
  Clock,
  RotateCcw,
  Settings,
  MonitorPlay,
  Upload,
  Mic2,
  AlertCircle,
} from 'lucide-react';
import type { VideoProject } from '../types';
import { hasSpeechSupport, speakText, stopSpeaking } from '../utils/speech';

interface PreviewStepProps {
  project: VideoProject | null;
  onReset: () => void;
}

export default function PreviewStep({ project, onReset }: PreviewStepProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  
  const startTimeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const lastNarratedSegment = useRef<number>(-1);
  const preloadedUrls = useRef<Set<string>>(new Set());
  const [audioRef] = useState(() => new Audio());

  useEffect(() => {
    const handleEnd = () => setIsNarrating(false);
    audioRef.addEventListener('ended', handleEnd);
    return () => {
      audioRef.removeEventListener('ended', handleEnd);
      audioRef.pause();
      audioRef.src = '';
    };
  }, [audioRef]);

  const totalDuration = useMemo(
    () => project?.script.reduce((sum, segment) => sum + segment.duration, 0) || 0,
    [project],
  );

  useEffect(() => {
    setSpeechSupported(hasSpeechSupport());
  }, []);

  // Frame-accurate animation loop
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
    }

    // Pre-load next 2 segments' media (browser cache)
    const segIdsToPreload = project.script
      .slice(foundIndex, Math.min(foundIndex + 3, project.script.length))
      .map(s => s.id);
    const mediaToPreload = project.media.filter(a => segIdsToPreload.includes(a.segmentId));
    for (const asset of mediaToPreload) {
      if (asset.url && !preloadedUrls.current.has(asset.url)) {
        const img = new Image();
        img.src = asset.url;
        preloadedUrls.current.add(asset.url);
      }
    }
  }, [currentTime, project, currentSegmentIndex]);

  // Narration sync logic
  useEffect(() => {
    if (!project || !isPlaying) return;

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
  }, [currentSegmentIndex, isPlaying, project, audioRef]);

  useEffect(() => {
    if (!isPlaying || isMuted) {
      stopSpeaking();
      audioRef.pause();
      setIsNarrating(false);
    }
  }, [isMuted, isPlaying, audioRef]);

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
    setCurrentTime(Math.max(0, newTime));
    lastNarratedSegment.current = -1;
    stopSpeaking();
    audioRef.pause();
    setIsNarrating(false);
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-surface-500">No video to preview.</p>
      </div>
    );
  }

  const currentSegment = project.script[currentSegmentIndex];

  const { currentMedia, isSecondaryShot } = useMemo(() => {
    if (!project || !currentSegment) return { currentMedia: null, isSecondaryShot: false };
    
    // Get all media for this segment
    const segmentMedia = project.media.filter(a => a.segmentId === currentSegment.id);
    
    // If no media explicitly linked, fall back to index-based
    if (segmentMedia.length === 0) {
      return { 
        currentMedia: project.media[currentSegmentIndex] || null, 
        isSecondaryShot: false 
      };
    }

    // Normal velocity: 1 asset
    if (segmentMedia.length === 1) {
      return { currentMedia: segmentMedia[0], isSecondaryShot: false };
    }

    // High velocity: 2+ assets (Mid-segment jump cut)
    let accumulated = 0;
    for (let i = 0; i < currentSegmentIndex; i++) {
      accumulated += project.script[i].duration;
    }
    const segmentElapsed = currentTime - accumulated;
    
    // Switch at 50% mark of the segment's duration
    const showSecondary = segmentElapsed > currentSegment.duration / 2;
    const asset = showSecondary ? (segmentMedia[1] || segmentMedia[0]) : segmentMedia[0];
    
    return { currentMedia: asset, isSecondaryShot: showSecondary };
  }, [project, currentSegment, currentSegmentIndex, currentTime]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-brand-400">
            <MonitorPlay className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Final Preview</span>
          </div>
          <h2 className="text-2xl font-bold text-white">{project.title}</h2>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-900 px-4 py-2 text-sm text-surface-300 transition-all hover:border-surface-600 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
          New Video
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-surface-700/50 bg-black">
        <div className="relative aspect-video overflow-hidden bg-surface-950">
          {project.thumbnail && !isPlaying ? (
            <img
              src={project.thumbnail}
              alt="Rendered preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : currentMedia ? (
            currentMedia.type === 'video' ? (
              <video
                src={currentMedia.url}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover transition-all duration-700"
                style={{
                  transform: isPlaying ? (isSecondaryShot ? 'scale(1.18) translate(1%, 1%)' : 'scale(1.08)') : 'scale(1)',
                  filter: 'brightness(0.58)',
                }}
              />
            ) : (
              <img
                src={currentMedia.url}
                alt={currentMedia.alt}
                className="absolute inset-0 h-full w-full object-cover transition-all duration-700"
                style={{
                  transform: isPlaying ? (isSecondaryShot ? 'scale(1.18) translate(1%, 1%)' : 'scale(1.08)') : 'scale(1)',
                  filter: 'brightness(0.58)',
                }}
              />
            )
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />

          <div className="absolute inset-0 flex flex-col justify-between p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {currentSegment?.type}
                </div>
                {isNarrating && (
                  <div className="flex items-center gap-1.5 rounded-md bg-emerald-600/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    <Mic2 className="h-3 w-3 animate-pulse" />
                    Live narration
                  </div>
                )}
              </div>
              <div className="rounded-md bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                Segment {currentSegmentIndex + 1} / {project.script.length}
              </div>
            </div>

            {!isPlaying && (
              <div className="flex items-center justify-center">
                <button
                  onClick={handlePlayPause}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-all hover:scale-110 hover:bg-white/20"
                >
                  <Play className="ml-1 h-7 w-7 text-white" />
                </button>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-xl font-bold text-white drop-shadow-lg">{currentSegment?.title}</h3>
              <p className="max-w-3xl text-sm leading-relaxed text-white/90 drop-shadow-lg">
                {currentSegment?.narration}
              </p>
              <div className="flex items-center gap-2">
                <div className="h-1 w-8 rounded-full bg-red-500" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                  {project.style.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-900 px-4 py-3">
          <div
            className="group mb-3 cursor-pointer"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left;
              const percent = x / rect.width;
              jumpToTime(Math.floor(percent * totalDuration));
            }}
          >
            <div className="h-1 overflow-hidden rounded-full bg-surface-700 transition-all group-hover:h-1.5">
              <div
                className="h-full rounded-full bg-red-500 transition-all duration-300"
                style={{ width: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={handleResetPlayback} className="text-surface-400 transition-colors hover:text-white">
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={handlePlayPause}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-surface-200"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <button
                onClick={() => jumpToTime(Math.min(currentTime + 30, totalDuration))}
                className="text-surface-400 transition-colors hover:text-white"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <span className="ml-2 text-xs text-surface-400">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMuted((prev) => !prev)}
                className={`transition-colors ${isMuted ? 'text-red-400' : 'text-surface-400 hover:text-white'}`}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <Settings className="h-4 w-4 cursor-pointer text-surface-400 transition-colors hover:text-white" />
              <Maximize2 className="h-4 w-4 cursor-pointer text-surface-400 transition-colors hover:text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 ${speechSupported ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <div className="flex items-center gap-3">
          {speechSupported ? <Mic2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-amber-400" />}
          <p className={`text-sm ${speechSupported ? 'text-emerald-300' : 'text-amber-300'}`}>
            {speechSupported
              ? 'This preview uses live browser TTS during playback. It is a local preview layer, not a pre-rendered audio file export.'
              : 'Browser TTS is unavailable on this device, so the preview will stay silent.'}
            {isMuted && <span className="ml-2 text-amber-400">(Currently muted)</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-white">{project.title}</h3>
          <div className="flex items-center gap-4 text-sm text-surface-400">
            <span className="flex items-center gap-1"><Eye className="h-4 w-4" /> 0 views</span>
            <span className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" /> 0 likes</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {formatTime(totalDuration)}</span>
            <span>Just now</span>
          </div>

          <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">Auto-generated Description</p>
            <p className="text-sm leading-relaxed text-surface-300">
              {project.script[0]?.narration.substring(0, 220)}...
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.topic.split(' ').filter((word) => word.length > 3).slice(0, 5).map((tag) => (
                <span key={tag} className="rounded-md bg-surface-800 px-2 py-0.5 text-[11px] text-surface-400">
                  #{tag.toLowerCase().replace(/[^a-z]/g, '')}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20">
            <Upload className="h-5 w-5" />
            Upload to YouTube
          </button>
          <button
            onClick={() => {
              if (!project?.thumbnail) return;
              const a = document.createElement('a');
              a.href = project.thumbnail;
              a.download = `${project.title.replace(/[^a-z0-9]/gi, '_')}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3 text-sm font-medium text-surface-300 transition-all hover:border-surface-600 hover:text-white"
          >
            <Download className="h-5 w-5" />
            Download Video
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3 text-sm font-medium text-surface-300 transition-all hover:border-surface-600 hover:text-white">
            <Share2 className="h-5 w-5" />
            Share Link
          </button>

          <div className="space-y-3 rounded-xl border border-surface-700/50 bg-surface-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">Export Settings</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-surface-500">Resolution</span><span className="text-surface-300">1280×720</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Format</span><span className="text-surface-300">WebM (VP9)</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Audio</span><span className="text-surface-300">{project.narration.some(n => n.audioUrl) ? 'OpenAI TTS' : 'Browser TTS'}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">Duration</span><span className="text-surface-300">{formatTime(totalDuration)}</span></div>
              <div className="flex justify-between"><span className="text-surface-500">File Size</span><span className="text-surface-300">{project.thumbnail ? '~' + Math.round(totalDuration * 0.6) + 'MB' : 'N/A'}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-400">Segment Timeline</p>
        <div className="flex gap-1">
          {project.script.map((segment, index) => {
            const widthPercent = totalDuration > 0 ? (segment.duration / totalDuration) * 100 : 0;
            const isActive = index === currentSegmentIndex;
            const typeColors: Record<string, string> = {
              intro: 'bg-red-500/70',
              section: 'bg-blue-500/70',
              transition: 'bg-amber-500/70',
              outro: 'bg-emerald-500/70',
            };

            return (
              <button
                key={segment.id}
                onClick={() => {
                  const elapsed = project.script.slice(0, index).reduce((sum, item) => sum + item.duration, 0);
                  jumpToTime(elapsed);
                }}
                style={{ width: `${widthPercent}%` }}
                className={`relative h-12 min-w-[70px] overflow-hidden rounded-md border text-left transition-all ${
                  isActive ? 'border-white/40 ring-1 ring-white/30' : 'border-transparent hover:border-white/10'
                }`}
              >
                <div className={`absolute inset-0 ${typeColors[segment.type] || 'bg-surface-700'}`} />
                <div className="absolute inset-0 bg-black/20" />
                <div className="relative flex h-full items-end p-2">
                  <span className="truncate text-[10px] font-medium text-white">{segment.title}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
