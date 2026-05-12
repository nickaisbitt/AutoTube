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
  Check,
  XCircle,
  Gauge,
  Server,
} from 'lucide-react';
import type { VideoProject, StepStatus, AppConfig } from '../types';
import { hasSpeechSupport, loadSpeechVoices, speakText, stopSpeaking } from '../utils/speech';
import { KOKORO_VOICES } from '../services/tts';

interface NarrationStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onGenerateNarration: () => void;
  onNext: () => void;
  appConfig?: AppConfig;
}

export default function NarrationStep({ project, status, progress, message, onGenerateNarration, onNext }: NarrationStepProps) {
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
      stopSpeaking();
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
    // Kokoro-generated audio (audioUrl) takes priority over browser TTS
    const hasAudio = !!audioUrl;
    if ((!speechSupportedRef.current && !hasAudio) || clipStatus !== 'ready') return;

    if (playingClip === clipId) {
      stopSpeaking();
      audioRef.pause();
      setPlayingClip(null);
      return;
    }

    setPlayingClip(clipId);

    try {
      if (hasAudio) {
        // Play actual Kokoro-generated audio (not browser TTS)
        audioRef.src = audioUrl!;
        await audioRef.play();
      } else {
        // Fallback to browser TTS when no generated audio is available
        await speakText(text, {
          preferredVoiceName: voiceName,
          onEnd: () => setPlayingClip(null),
          onError: () => setPlayingClip(null),
        });
      }
    } catch {
      // Playback failed — reset state so the clip appears playable again
      setPlayingClip(null);
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
            <div className="absolute inset-0 bg-brand-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center bg-brand-500 text-black shadow-hard">
              <Mic2 className="h-8 w-8" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white uppercase tracking-wider">Preparing Narration</h3>
            <p className="mt-2 text-sm font-mono text-surface-400">{message || 'Initializing browser speech synthesis...'}</p>
          </div>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden bg-surface-800">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              />
            </div>
            <p className="text-xs font-mono text-surface-500">{progress}% complete</p>
          </div>

          <div className="pt-4">
            <svg viewBox="0 0 100 60" className="block h-16 w-full" aria-hidden="true">
              {Array.from({ length: 40 }).map((_, i) => {
                const barWidth = 100 / 40;
                const rawHeight = Math.random() * 60 + 10;
                const height = Math.max(6, rawHeight * 0.6);
                const x = i * barWidth;
                return (
                  <rect
                    key={i}
                    x={x + 0.35}
                    y={60 - height}
                    width={Math.max(1.1, barWidth - 0.7)}
                    height={height}
                    rx="0"
                    fill="#ff5500"
                    fillOpacity={progress > (i / 40) * 100 ? 0.8 : 0.25}
                    className="animate-pulse"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (!project || !project.narration.length) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-lg space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center bg-surface-800 border-2 border-brand-500 text-brand-500">
            <Mic2 className="h-8 w-8" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">No narration prepared yet.</p>
            <p className="mt-1 text-sm text-surface-400">
              Generate the voiceover for each segment before moving on to the render step.
            </p>
          </div>
          {project && (
            <button
              onClick={onGenerateNarration}
              className="inline-flex items-center justify-center gap-2 bg-brand-500 px-6 py-3 text-sm font-bold uppercase text-black shadow-hard hover:bg-brand-400 hover:text-black"
              data-testid="prepare-narration-button"
            >
              Prepare Narration
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-brand-500">
          <Mic2 className="h-4 w-4" />
          <span className="text-xs font-mono font-semibold uppercase tracking-widest">Step 4 — Complete</span>
        </div>
        <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Browser TTS Narration</h2>
        <p className="mt-1 text-sm text-surface-400">
          {playableCount} of {project.narration.length} clips are ready for live playback in this browser.
        </p>
      </div>

      {/* TTS Fallback Chain Status */}
      {(() => {
        const hasKokoro = !!(import.meta.env.VITE_KOKORO_SERVER_URL);
        const hasGrok = !!(import.meta.env.VITE_XAI_KEY);
        const hasMelo = !!(import.meta.env.VITE_CF_ACCOUNT_ID && import.meta.env.VITE_CF_API_TOKEN);
        return (
          <div className="flex items-center gap-4 border-2 border-surface-700 bg-surface-800 px-4 py-3">
            <Mic2 className="h-5 w-5 flex-shrink-0 text-brand-500" />
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-surface-400">TTS:</span>
              <span className={`flex items-center gap-1 ${hasKokoro ? 'text-emerald-400' : 'text-surface-600'}`}>
                {hasKokoro ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                Kokoro
              </span>
              <span className="text-surface-600">→</span>
              <span className={`flex items-center gap-1 ${hasGrok ? 'text-emerald-400' : 'text-surface-600'}`}>
                {hasGrok ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                Grok
              </span>
              <span className="text-surface-600">→</span>
              <span className={`flex items-center gap-1 ${hasMelo ? 'text-emerald-400' : 'text-surface-600'}`}>
                {hasMelo ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                MeloTTS
              </span>
              <span className="text-surface-600">→</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-3 w-3" />
                Browser
              </span>
            </div>
          </div>
        );
      })()}

      {/* Kokoro TTS Engine Settings */}
      {!!(import.meta.env.VITE_KOKORO_SERVER_URL) && (
        <div className="border-2 border-surface-700 bg-surface-900 p-4">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 text-brand-500" />
            <div className="text-sm text-surface-300 flex-1">
              <p className="font-semibold text-white">Kokoro TTS Engine Active</p>
              <p className="mt-1 text-xs font-mono text-surface-400">
                Server: {import.meta.env.VITE_KOKORO_SERVER_URL}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {KOKORO_VOICES.map((voice) => (
                  <span
                    key={voice.id}
                    className="border border-surface-600 bg-surface-800 px-2 py-0.5 text-[10px] font-mono text-surface-300"
                    data-testid={`kokoro-voice-${voice.id}`}
                  >
                    {voice.id} — {voice.description}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-2 border-surface-700 bg-surface-900 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-brand-500" />
          <div className="text-sm text-surface-300">
            <p className="font-semibold text-white">Narration is synthesized live when you press play.</p>
            <p className="mt-1 text-surface-400">
              This front-end demo does not export MP3/WAV files in advance. It prepares each script segment for local browser playback so you can preview the voice immediately.
            </p>
          </div>
        </div>
      </div>

      {(!speechSupported || voiceCount === 0) && (
        <div className="flex items-center gap-3 border-2 border-amber-500 bg-surface-800 px-4 py-3 text-amber-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-mono">
            Browser speech synthesis is unavailable or no voices are loaded, so playback cannot start on this device yet.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 border-2 border-surface-700 bg-surface-900 px-5 py-4">
        <div className="flex h-12 w-12 items-center justify-center bg-surface-800 border-2 border-brand-500 text-brand-500">
          <User className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{project.narration[0]?.voice || 'Browser voice unavailable'}</p>
          <p className="text-xs font-mono text-surface-400">
            Local browser synthesis • {voiceCount} voices detected • ~{Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-surface-400" />
          <div className="h-1.5 w-24 bg-surface-700">
            <div className="h-full w-3/4 bg-brand-500" />
          </div>
        </div>
        {playingClip && (
          <button
            onClick={stopPlayback}
            className="flex items-center gap-2 bg-surface-800 border-2 border-red-500 px-3 py-1.5 text-xs font-bold font-mono text-red-400 hover:bg-red-500 hover:text-black"
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
          const hasAudioUrl = !!clip.audioUrl;
          const canPlay = (speechSupported || hasAudioUrl) && clip.status === 'ready';

          // Compute estimated WPM from word count and duration
          const wordCount = clip.text.trim().split(/\s+/).length;
          const estimatedWpm = clip.duration > 0 ? Math.round((wordCount / clip.duration) * 60) : 0;

          return (
            <div
              key={clip.id}
              className={`border-2 ${
                isPlaying
                  ? 'border-brand-500 bg-surface-800'
                  : 'border-surface-700 bg-surface-900 hover:border-surface-600'
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => playClip(clip.id, clip.text, clip.voice, clip.status, clip.audioUrl)}
                  disabled={!canPlay}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center ${
                    isPlaying
                      ? 'bg-brand-500 text-black shadow-hard-sm'
                      : canPlay
                        ? 'bg-surface-800 border-2 border-surface-600 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black hover:border-brand-500'
                        : 'cursor-not-allowed bg-surface-800/50 text-surface-600'
                  }`}
                  data-testid={`play-clip-${clip.id}`}
                  title={hasAudioUrl ? 'Play Kokoro audio' : 'Play with browser TTS'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-surface-500">#{index + 1}</span>
                    <p className="truncate text-sm font-medium text-white">{segment?.title}</p>
                    {hasAudioUrl && (
                      <span className="flex-shrink-0 border border-emerald-500 bg-emerald-900/30 px-1.5 py-0.5 text-[9px] font-bold font-mono text-emerald-400" data-testid={`kokoro-badge-${clip.id}`}>
                        KOKORO
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-surface-400">{clip.text.substring(0, 90)}...</p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-3">
                  {estimatedWpm > 0 && (
                    <div className="flex items-center gap-1 text-xs font-mono text-surface-400" data-testid={`wpm-${clip.id}`}>
                      <Gauge className="h-3 w-3" />
                      <span>{estimatedWpm} WPM</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs font-mono text-surface-400">
                    <Clock className="h-3 w-3" />
                    <span>~{clip.duration}s</span>
                  </div>
                </div>

                <span className={`flex-shrink-0 border-2 px-2 py-0.5 text-[10px] font-bold font-mono ${
                  isPlaying
                    ? 'border-brand-500 bg-brand-500 text-black'
                    : canPlay
                      ? 'border-brand-500 bg-surface-800 text-brand-500'
                      : 'border-amber-500 bg-surface-800 text-amber-300'
                }`}>
                  {isPlaying ? 'Speaking' : canPlay ? 'Ready to speak' : 'Unavailable'}
                </span>
              </div>

              {isPlaying && (
                <div className="border-t-2 border-surface-700 px-4 py-3">
                  <svg viewBox="0 0 100 60" className="block h-8 w-full" aria-hidden="true">
                    {(waveformBars.length ? waveformBars : Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.3) * 40 + 50)).map((height, i) => {
                      const barWidth = 100 / 60;
                      const h = Math.max(6, Number(height) * 0.6);
                      const x = i * barWidth;
                      return (
                        <rect
                          key={i}
                          x={x + 0.15}
                          y={60 - h}
                          width={Math.max(0.5, barWidth - 0.3)}
                          height={h}
                          rx="0"
                          fill="#ff5500"
                          fillOpacity="0.6"
                          className="animate-pulse"
                        />
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {project.narration.length > 0 && (
        <button
          onClick={onNext}
          className="flex w-full items-center justify-center gap-2 bg-brand-500 px-6 py-4 text-sm font-bold uppercase text-black shadow-hard hover:bg-brand-400"
          data-testid="assemble-video-button"
        >
          Assemble Video
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
