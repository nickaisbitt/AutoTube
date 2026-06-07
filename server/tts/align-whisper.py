#!/usr/bin/env python3
"""
Word-level alignment via faster-whisper for AutoTube captions.
Usage: align-whisper.py <audio.wav> <output.vtt> [--model base]
"""
import argparse
import json
import os
import sys


def format_vtt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace('.', ',')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('audio_path')
    parser.add_argument('vtt_path')
    parser.add_argument('--model', default='base')
    parser.add_argument('--json-sidecar', default='')
    args = parser.parse_args()

    if not os.path.exists(args.audio_path):
        print(f"Error: audio not found: {args.audio_path}", file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: faster-whisper not installed (pip install faster-whisper)", file=sys.stderr)
        sys.exit(2)

    model = WhisperModel(args.model, device='cpu', compute_type='int8')
    segments, info = model.transcribe(args.audio_path, word_timestamps=True)

    words = []
    lines = ['WEBVTT', '']
    for seg in segments:
        if not seg.words:
            continue
        for w in seg.words:
            words.append({
                'word': w.word.strip(),
                'start': w.start,
                'end': w.end,
            })
            lines.append(f"{format_vtt_time(w.start)} --> {format_vtt_time(w.end)}")
            lines.append(w.word.strip())
            lines.append('')

    with open(args.vtt_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    if args.json_sidecar:
        with open(args.json_sidecar, 'w', encoding='utf-8') as f:
            json.dump({'words': words, 'language': info.language}, f, indent=2)

    print(json.dumps({'wordCount': len(words), 'language': info.language}))


if __name__ == '__main__':
    main()
