#!/usr/bin/env python3.10
"""
AutoTube XTTS v2 Wrapper — Coqui TTS engine for server-render pipeline.

Usage:
  python3 xtts_generate.py <input_json> <output_dir>

Input JSON:
  {
    "segments": [
      {"id": "seg-0", "text": "Narration text here..."},
      {"id": "seg-1", "text": "Next narration..."}
    ],
    "speaker_wav": "/path/to/reference.wav",
    "language": "en"
  }

The script writes:
  <output_dir>/seg-0.wav
  <output_dir>/seg-1.wav
And outputs progress lines to stdout for the parent process to parse.
"""

import json, os, sys, time, torch

# --- Patches for compatibility ---
original_load = torch.load
def patched_load(f, *args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(f, *args, **kwargs)
torch.load = patched_load

os.environ['COQUI_TOS_ACCEPTED'] = 'true'
import TTS.utils.manage
TTS.utils.manage.ModelManager.ask_tos = lambda self, path: True


def progress(msg):
    print(f"PROGRESS:{msg}", flush=True)


def main():
    if len(sys.argv) < 3:
        print("Usage: xtts_generate.py <input_json> <output_dir>", file=sys.stderr)
        sys.exit(1)

    input_json = sys.argv[1]
    output_dir = sys.argv[2]

    with open(input_json) as f:
        config = json.load(f)

    segments = config.get("segments", [])
    speaker_wav = config.get("speaker_wav", "")
    language = config.get("language", "en")

    if not segments:
        progress("No segments to generate")
        sys.exit(0)

    os.makedirs(output_dir, exist_ok=True)

    # Load model
    progress(f"Loading XTTS v2 (this takes ~45s)...")
    t0 = time.time()
    from TTS.api import TTS
    tts = TTS(model_name='tts_models/multilingual/multi-dataset/xtts_v2', progress_bar=False)
    if torch.backends.mps.is_available():
        tts.to('mps')
    load_time = time.time() - t0
    progress(f"Model loaded in {load_time:.1f}s")

    # If no speaker_wav provided, create a simple one
    if not speaker_wav or not os.path.exists(speaker_wav):
        progress("No speaker reference provided, using default")
        import torchaudio
        ref_path = os.path.join(output_dir, "_default_ref.wav")
        torchaudio.save(ref_path, torch.zeros(1, 24000), 24000)
        speaker_wav = ref_path

    # Generate each segment
    for i, seg in enumerate(segments):
        seg_id = seg.get("id", f"seg_{i}")
        text = seg.get("text", "")
        if not text:
            continue

        progress(f"Generating segment {i+1}/{len(segments)}: {seg_id}")
        out_path = os.path.join(output_dir, f"{seg_id}.wav")
        t1 = time.time()
        try:
            tts.tts_to_file(
                text=text,
                file_path=out_path,
                speaker_wav=speaker_wav,
                language=language
            )
            gen_time = time.time() - t1
            duration = 0
            try:
                import soundfile as sf
                data, sr = sf.read(out_path)
                duration = len(data) / sr
            except:
                pass
            progress(f"Segment {i+1} done in {gen_time:.1f}s ({duration:.1f}s audio)")
        except Exception as e:
            progress(f"Segment {i+1} FAILED: {str(e)[:100]}")

    progress("ALL_DONE")


if __name__ == '__main__':
    main()
