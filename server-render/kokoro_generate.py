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


def text_to_words(text):
    """Split text into words with their character positions."""
    words = []
    i = 0
    for part in text.split(' '):
        if part:
            words.append({'text': part + ' ', 'chars': len(part) + 1, 'start': i})
            i += len(part) + 1
        else:
            words.append({'text': ' ', 'chars': 1, 'start': i})
            i += 1
    if words and words[-1]['text'].endswith(' '):
        words[-1]['chars'] -= 1
        words[-1]['text'] = words[-1]['text'].rstrip()
    return words


def generate_vtt(words, total_duration):
    """Generate VTT with word-level timing from Kokoro audio duration."""
    total_chars = sum(w['chars'] for w in words) if words else 1
    lines = ['WEBVTT\n\n']
    t = 0.0
    for w in words:
        if not w['text'].strip():
            continue
        word_dur = (w['chars'] / total_chars) * total_duration
        start = t
        end = t + word_dur
        lines.append(f"{start:.3f} --> {end:.3f}\n{w['text']}\n")
        t = end
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
            all_text = '' 
            for gs, ps, audio in gen:
                if audio is not None and len(audio) > 0:
                    audios.append(audio)
                if gs:
                    all_text += gs + ' '

            if not audios:
                progress(f"Segment {i+1} FAILED: No audio generated")
                continue

            combined = np.concatenate(audios) if len(audios) > 1 else audios[0]
            total_duration = len(combined) / 24000

            import soundfile as sf
            sf.write(out_path, combined, 24000)

            # Generate aligned VTT subtitles from Kokoro's actual audio duration
            words = text_to_words(text.strip())
            vtt_content = generate_vtt(words, total_duration)
            with open(vtt_path, 'w') as f:
                f.write(vtt_content)

            gen_time = time.time() - t1
            progress(f"Segment {i+1} done in {gen_time:.1f}s ({total_duration:.1f}s audio)")

        except Exception as e:
            progress(f"Segment {i+1} FAILED: {str(e)[:200]}")

    progress("ALL_DONE")


if __name__ == '__main__':
    main()
