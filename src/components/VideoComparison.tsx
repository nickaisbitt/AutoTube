import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Play, Pause, Columns } from 'lucide-react';
import type { VideoProject } from '../types';

interface VideoComparisonProps {
  isOpen: boolean;
  onClose: () => void;
  versionA: VideoProject | null;
  versionB: VideoProject | null;
  labelA?: string;
  labelB?: string;
}

type ViewMode = 'side-by-side' | 'slider';

export default function VideoComparison({ isOpen, onClose, versionA, versionB, labelA = 'Version A', labelB = 'Version B' }: VideoComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  const videoUrlA = versionA?.thumbnail || null;
  const videoUrlB = versionB?.thumbnail || null;

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      setCurrentTime(0);
      setSliderPosition(50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (isPlaying) {
      const tick = () => {
        setCurrentTime(prev => prev + 0.033);
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (videoARef.current && videoBRef.current) {
      if (isPlaying) {
        videoARef.current.pause();
        videoBRef.current.pause();
      } else {
        videoARef.current.play().catch(err => { console.warn('Autoplay blocked:', err.message); });
        videoBRef.current.play().catch(err => { console.warn('Autoplay blocked:', err.message); });
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (videoARef.current) {
      setCurrentTime(videoARef.current.currentTime);
      setDuration(videoARef.current.duration || 0);
    }
    if (videoBRef.current && videoARef.current && Math.abs(videoBRef.current.currentTime - videoARef.current.currentTime) > 0.1) {
      videoBRef.current.currentTime = videoARef.current.currentTime;
    }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * duration;
    if (videoARef.current) videoARef.current.currentTime = time;
    if (videoBRef.current) videoBRef.current.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  const handleSliderDrag = useCallback((e: React.MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  const handleSliderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleSliderDrag(e);
    const onMove = (ev: MouseEvent) => handleSliderDrag(ev as unknown as React.MouseEvent);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [handleSliderDrag]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen || !versionA || !versionB) return null;

  const segmentCountA = versionA.script.length;
  const segmentCountB = versionB.script.length;
  const durationA = versionA.script.reduce((s, seg) => s + seg.duration, 0);
  const durationB = versionB.script.reduce((s, seg) => s + seg.duration, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="video-comparison-modal">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden border-2 border-surface-700 bg-surface-900 shadow-hard flex flex-col">
        <div className="flex items-center justify-between border-b-2 border-surface-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <Columns className="h-5 w-5 text-brand-500" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-white">Compare Versions</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'side-by-side' ? 'slider' : 'side-by-side')}
              className="flex items-center gap-1 border-2 border-surface-700 px-3 py-1.5 text-xs font-mono text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            >
              {viewMode === 'side-by-side' ? 'Slider Mode' : 'Side by Side'}
            </button>
            <button
              onClick={onClose}
              className="border-2 border-surface-700 p-1.5 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
              aria-label="Close comparison"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border-2 border-surface-700 bg-surface-950 p-3">
              <h4 className="text-xs font-mono font-semibold text-brand-400 mb-2">{labelA}</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-surface-400">
                <span>Segments: {segmentCountA}</span>
                <span>Duration: {durationA.toFixed(0)}s</span>
              </div>
            </div>
            <div className="border-2 border-surface-700 bg-surface-950 p-3">
              <h4 className="text-xs font-mono font-semibold text-brand-400 mb-2">{labelB}</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-surface-400">
                <span>Segments: {segmentCountB}</span>
                <span>Duration: {durationB.toFixed(0)}s</span>
              </div>
            </div>
          </div>

          {viewMode === 'side-by-side' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-surface-700 bg-black rounded overflow-hidden">
                <div className="p-2 bg-surface-800 text-xs font-mono text-surface-300 text-center">{labelA}</div>
                {videoUrlA ? (
                  <video
                    ref={videoARef}
                    src={videoUrlA}
                    className="w-full"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={() => setDuration(videoARef.current?.duration || 0)}
                  />
                ) : (
                  <div className="aspect-video flex items-center justify-center text-surface-600 text-sm font-mono">
                    No video available
                  </div>
                )}
              </div>
              <div className="border-2 border-surface-700 bg-black rounded overflow-hidden">
                <div className="p-2 bg-surface-800 text-xs font-mono text-surface-300 text-center">{labelB}</div>
                {videoUrlB ? (
                  <video
                    ref={videoBRef}
                    src={videoUrlB}
                    className="w-full"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={() => setDuration(videoBRef.current?.duration || 0)}
                  />
                ) : (
                  <div className="aspect-video flex items-center justify-center text-surface-600 text-sm font-mono">
                    No video available
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              ref={sliderRef}
              className="relative border-2 border-surface-700 bg-black rounded overflow-hidden cursor-col-resize select-none"
              style={{ height: '400px' }}
              onMouseDown={handleSliderMouseDown}
            >
              <div className="absolute inset-0 flex">
                <div className="absolute inset-0 flex items-center justify-center bg-black text-surface-600 text-sm font-mono">
                  {videoUrlA ? (
                    <video
                      ref={videoARef}
                      src={videoUrlA}
                      className="w-full h-full object-cover"
                      style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={() => setDuration(videoARef.current?.duration || 0)}
                    />
                  ) : (
                    <span>{labelA}</span>
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black text-surface-600 text-sm font-mono">
                  {videoUrlB ? (
                    <video
                      ref={videoBRef}
                      src={videoUrlB}
                      className="w-full h-full object-cover"
                      style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={() => setDuration(videoBRef.current?.duration || 0)}
                    />
                  ) : (
                    <span>{labelB}</span>
                  )}
                </div>
              </div>
              <div
                className="absolute top-0 bottom-0 w-1 bg-brand-500 z-10"
                style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center shadow-lg">
                  <Columns className="h-4 w-4 text-black" />
                </div>
              </div>
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 text-[10px] font-mono text-white rounded">{labelA}</div>
              <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 text-[10px] font-mono text-white rounded">{labelB}</div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              className="flex items-center gap-2 bg-brand-500 px-4 py-2 text-xs font-bold text-black"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <div
              className="flex-1 h-2 bg-surface-800 rounded cursor-pointer"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-brand-500 rounded"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs font-mono text-surface-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="mt-6 border-2 border-surface-700 bg-surface-950 p-4">
            <h4 className="text-xs font-mono font-semibold text-brand-400 mb-3">Segment Comparison</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {versionA.script.map((segA, i) => {
                const segB = versionB.script[i];
                if (!segB) return null;
                const changed = segA.narration !== segB.narration || segA.duration !== segB.duration || segA.title !== segB.title;
                return (
                  <div
                    key={segA.id}
                    className={`flex items-center gap-3 p-2 text-xs font-mono rounded ${
                      changed ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-surface-900'
                    }`}
                  >
                    <span className="text-surface-500 w-6">{i + 1}</span>
                    <span className="text-white flex-1 truncate">{segA.title}</span>
                    {changed && (
                      <span className="text-amber-400 text-[10px]">modified</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
