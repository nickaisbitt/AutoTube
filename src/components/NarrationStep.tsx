import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic2,
  Play,
  Pause,
  Square,
  Volume2,
  ChevronRight,
  User,
  Clock,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import type { VideoProject, StepStatus } from '../types';
import { hasSpeechSupport, loadSpeechVoices, speakText, stopSpeaking } from '../utils/speech';

interface NarrationStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onNext: () => void;
}

export default function NarrationStep({ project, status, progress, message, onNext }: NarrationStepProps) {
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceCount, setVoiceCount] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [audioRef] = useState(() => new Audio());

  useEffect(() => {
    const handleEnd = () => setPlayingClip(null);
    audioRef.addEventListener('ended', handleEnd);
    return () => {
      audioRef.removeEventListener('ended', handleEnd);
      audioRef.pause();
      audioRef.src = '';
    };
  }, [audioRef]);

  useEffect(() => {
    let active = true;

    const initSpeech = async () => {
      const supported = hasSpeechSupport();
      if (!active) return;
      setSpeechSupported(supported);

      if (supported) {
        const voices = await loadSpeechVoices();
        if (active) {
          setVoiceCount(voices.length);
        }
      }
    };

    initSpeech();

    return () => {
      active = false;
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (!playingClip) {
      setWaveformBars([]);
      return;
    }
    
    // Instead of using React state updates 10 times a second, we generate a static array 
    // and rely on CSS animations (defined below) to handle the visual changes, 
    // saving rendering performance and preventing test runners from hanging.
    setWaveformBars(Array.from({ length: 60 }, () => Math.random() * 100));
  }, [playingClip]);

  const totalDuration = useMemo(
    () => project?.narration.reduce((sum, clip) => sum + clip.duration, 0) ?? 0,
    [project],
  );

  const playableCount = useMemo(
    () => project?.narration.filter((clip) => clip.status === 'ready').length ?? 0,
    [project],
  );

  const speechSupportedRef = useRef(speechSupported);
  useEffect(() => {
    speechSupportedRef.current = speechSupported;
  }, [speechSupported]);

  const playClip = useCallback(async (clipId: string, text: string, voiceName: string, clipStatus: string, audioUrl?: string) => {
    if ((!speechSupportedRef.current && !audioUrl) || clipStatus !== 'ready') return;

    if (playingClip === clipId) {
      stopSpeaking();
      audioRef.pause();
      setPlayingClip(null);
      return;
    }

    setPlayingClip(clipId);

    if (audioUrl) {
      audioRef.src = audioUrl;
      audioRef.play().catch(err => {
        console.error('Audio playback failed:', err);
        setPlayingClip(null);
      });
    } else {
      await speakText(text, {
        preferredVoiceName: voiceName,
        onEnd: () => setPlayingClip(null),
        onError: () => setPlayingClip(null),
      });
    }
  }, [playingClip, audioRef]);

  const stopPlayback = () => {
    stopSpeaking();
    audioRef.pause();
    setPlayingClip(null);
  };

  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-400 shadow-xl shadow-emerald-500/30">
              <Mic2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Preparing Narration</h3>
            <p className="mt-2 text-sm text-surface-400">{message || 'Initializing browser speech synthesis...'}</p>
          </div>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-surface-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-surface-500">{progress}% complete</p>
          </div>

          <div className="flex h-16 items-end justify-center gap-1 pt-4">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-emerald-500/40 transition-all duration-150"
                style={{
                  height: `${Math.random() * 60 + 10}%`,
                  opacity: progress > (i / 40) * 100 ? 1 : 0.2,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project || !project.narration.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-surface-500">No narration prepared yet.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-emerald-400">
          <Mic2 className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Step 4 — Complete</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Browser TTS Narration</h2>
        <p className="mt-1 text-sm text-surface-400">
          {playableCount} of {project.narration.length} clips are ready for live playback in this browser.
        </p>
      </div>

      <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-emerald-400" />
          <div className="text-sm text-surface-300">
            <p className="font-semibold text-white">Narration is synthesized live when you press play.</p>
            <p className="mt-1 text-surface-400">
              This front-end demo does not export MP3/WAV files in advance. It prepares each script segment for local browser playback so you can preview the voice immediately.
            </p>
          </div>
        </div>
      </div>

      {(!speechSupported || voiceCount === 0) && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">
            Browser speech synthesis is unavailable or no voices are loaded, so playback cannot start on this device yet.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-surface-700/50 bg-surface-900/60 px-5 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 text-emerald-400">
          <User className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{project.narration[0]?.voice || 'Browser voice unavailable'}</p>
          <p className="text-xs text-surface-400">
            Local browser synthesis • {voiceCount} voices detected • ~{Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-surface-400" />
          <div className="h-1.5 w-24 rounded-full bg-surface-700">
            <div className="h-full w-3/4 rounded-full bg-emerald-400" />
          </div>
        </div>
        {playingClip && (
          <button
            onClick={stopPlayback}
            className="flex items-center gap-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors"
          >
            <Square className="h-3 w-3" />
            Stop All
          </button>
        )}
      </div>

      <div className="space-y-2">
        {project.narration.map((clip, index) => {
          const segment = project.script.find((item) => item.id === clip.segmentId);
          const isPlaying = playingClip === clip.id;
          const canPlay = speechSupported && clip.status === 'ready';

          return (
            <div
              key={clip.id}
              className={`rounded-xl border transition-all ${
                isPlaying
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-surface-700/50 bg-surface-900/40 hover:border-surface-600'
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => playClip(clip.id, clip.text, clip.voice, clip.status, clip.audioUrl)}
                  disabled={!canPlay}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-all ${
                    isPlaying
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : canPlay
                        ? 'bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-white'
                        : 'cursor-not-allowed bg-surface-800/50 text-surface-600'
                  }`}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-surface-500">#{index + 1}</span>
                    <p className="truncate text-sm font-medium text-white">{segment?.title}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-surface-400">{clip.text.substring(0, 90)}...</p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5 text-xs text-surface-400">
                  <Clock className="h-3 w-3" />
                  <span>~{clip.duration}s</span>
                </div>

                <span className={`flex-shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                  isPlaying
                    ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                    : canPlay
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                }`}>
                  {isPlaying ? 'Speaking' : canPlay ? 'Ready to speak' : 'Unavailable'}
                </span>
              </div>

              {isPlaying && (
                <div className="border-t border-surface-700/30 px-4 py-3">
                  <div className="flex h-8 items-end gap-0.5">
                    {(waveformBars.length ? waveformBars : Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.3) * 40 + 50)).map((height, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-full bg-emerald-400/60 animate-pulse"
                        style={{ 
                          height: `${Math.max(10, Number(height))}%`,
                          animationDelay: `${i * 0.05}s`,
                          animationDuration: '0.8s'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {status === 'complete' && (
        <button
          onClick={onNext}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-brand-500/40"
        >
          Assemble Video
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
