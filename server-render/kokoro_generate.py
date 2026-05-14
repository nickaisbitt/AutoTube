#!/usr/bin/env python3
"""
AutoTube Kokoro-82M Wrapper — lightweight local TTS engine with aligned subtitles.

Input JSON:
  {
    "segments": [
      {"id": "seg-0", "text": "...", "speed": 1.0}
    ],
    "voice": "af_heart",
    "output_dir": "/path/to/output"
  }

Output:
  <output_dir>/seg-0.wav
  <output_dir>/seg-0.vtt  (word-level subtitles aligned to audio)
  stdout progress lines for parent process to parse.
"""

import json, os, sys, time
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'


def progress(msg):
    print(f"PROGRESS:{msg}", flush=True)


def generate_vtt_from_tokens(token_lists, audio_durations):
    """Generate VTT with word-level timing from Kokoro's MToken timestamps.

    Args:
        token_lists: list of token lists, one per chunk
        audio_durations: list of audio durations per chunk in seconds
    """
    lines = ['WEBVTT\n\n']
    offset = 0.0
    for tokens, dur in zip(token_lists, audio_durations):
        for tok in tokens:
            # Skip punctuation-only tokens
            if not tok.text.strip() or all(c in '.,!?;:' for c in tok.text):
                continue
            start = offset + tok.start_ts
            end = offset + tok.end_ts
            lines.append(f"{start:.3f} --> {end:.3f}\n{tok.text}\n")
        offset += dur
    return ''.join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: kokoro_generate.py <input_json>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1]) as f:
        config = json.load(f)

    segments = config.get("segments", [])
    output_dir = config.get("output_dir", ".")
    voice = config.get("voice", "af_heart")
    default_speed = config.get("speed", 1.0)

    if not segments:
        progress("No segments to generate")
        sys.exit(0)

    os.makedirs(output_dir, exist_ok=True)

    t0 = time.time()
    progress("Loading Kokoro-82M...")
    from kokoro import KPipeline
    import numpy as np
    pipeline = KPipeline(lang_code='a', device='mps')
    progress(f"Model loaded in {time.time()-t0:.1f}s")

    for i, seg in enumerate(segments):
        seg_id = seg.get("id", f"seg_{i}")
        text = seg.get("text", "")
        if not text:
            continue
        seg_speed = seg.get("speed", default_speed)
        seg_emotion = seg.get("emotion", None)

        progress(f"Generating segment {i+1}/{len(segments)}: {seg_id} (speed={seg_speed})")
        out_path = os.path.join(output_dir, f"{seg_id}.wav")
        vtt_path = os.path.join(output_dir, f"{seg_id}.vtt")
        t1 = time.time()

        try:
            gen = pipeline(text, voice=voice, speed=seg_speed)
            audios = []
            token_lists = []
            audio_durations = []
            for result in gen:
                audio = result.output.audio
                tokens = result.tokens
                if audio is not None and len(audio) > 0:
                    audios.append(audio)
                    audio_durations.append(len(audio) / 24000)
                if tokens:
                    token_lists.append(tokens)

            if not audios:
                progress(f"Segment {i+1} FAILED: No audio generated")
                continue

            combined = np.concatenate(audios) if len(audios) > 1 else audios[0]
            total_duration = len(combined) / 24000

            import soundfile as sf
            sf.write(out_path, combined, 24000)

            # Generate VTT from Kokoro's real word-level timestamps
            vtt_content = generate_vtt_from_tokens(token_lists, audio_durations)
            with open(vtt_path, 'w') as f:
                f.write(vtt_content)

            gen_time = time.time() - t1
            progress(f"Segment {i+1} done in {gen_time:.1f}s ({total_duration:.1f}s audio)")

        except Exception as e:
            progress(f"Segment {i+1} FAILED: {str(e)[:200]}")

    progress("ALL_DONE")


if __name__ == '__main__':
    main()
