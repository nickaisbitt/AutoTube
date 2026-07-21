#!/usr/bin/env python3
"""
AutoTube Video Quality Checker

Runs video-analyzer (vision model + whisper) and ffmpeg analysis on a rendered video.
Outputs a JSON quality report with scores and actionable issues.

Usage:
  python3 check_quality.py <video_path> [--api-key KEY] [--api-url URL] [--model MODEL]

Exit codes:
  0 = success
  1 = error
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

# Slot-4 panel: two vision judges + one text-only second opinion (DeepSeek has no image input on OR).
DEFAULT_VISION_JUDGES = [
    'xiaomi/mimo-v2.5',
    'google/gemma-4-31b-it',
]
DEFAULT_TEXT_JUDGE = 'deepseek/deepseek-v4-flash'
DEFAULT_JUDGES = DEFAULT_VISION_JUDGES + [DEFAULT_TEXT_JUDGE]
TEXT_ONLY_JUDGES = frozenset({DEFAULT_TEXT_JUDGE, 'deepseek/deepseek-v4-flash'})


def _safe_float(value, default=0.0):
    try:
        parsed = float(value)
        if math.isfinite(parsed):
            return parsed
    except (TypeError, ValueError):
        pass
    return default


def _json_safe(value):
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value

def run_ffprobe(video_path):
    """Extract video metadata using ffprobe."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries',
             'format=duration,size,bit_rate',
             '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,bit_rate,codec_type',
             '-of', 'json', video_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except Exception as e:
        print(f"Warning: ffprobe failed: {e}", file=sys.stderr)
    return None


def run_loudness_analysis(video_path):
    """Measure integrated loudness using ffmpeg loudnorm filter."""
    try:
        result = subprocess.run(
            ['ffmpeg', '-i', video_path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True, timeout=120
        )
        # Parse the JSON output from loudnorm
        stderr = result.stderr
        # Find the JSON block in stderr
        json_start = stderr.rfind('{')
        json_end = stderr.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            loudness = json.loads(stderr[json_start:json_end])
            lufs = _safe_float(loudness.get('input_i'), -70.0)
            return {
                'integrated_loudness_lufs': lufs,
                'true_peak_dbtp': _safe_float(loudness.get('input_tp'), 0.0),
                'loudness_range_lu': _safe_float(loudness.get('input_lra'), 0.0),
                'target_lufs': -14.0,
                'needs_normalization': abs(lufs - (-14.0)) > 2.0,
            }
    except Exception as e:
        print(f"Warning: loudness analysis failed: {e}", file=sys.stderr)
    return None


def run_silence_detection(video_path):
    """Detect silence gaps in audio."""
    try:
        result = subprocess.run(
            ['ffmpeg', '-i', video_path, '-af', 'silencedetect=noise=-40dB:d=0.3', '-f', 'null', '-'],
            capture_output=True, text=True, timeout=120
        )
        stderr = result.stderr
        gaps = []
        current_start = None
        for line in stderr.split('\n'):
            if 'silence_start:' in line:
                try:
                    current_start = float(line.split('silence_start:')[1].strip().split()[0])
                except (IndexError, ValueError):
                    pass
            elif 'silence_end:' in line and current_start is not None:
                try:
                    parts = line.split('silence_end:')[1].strip().split()
                    end = float(parts[0])
                    duration = float(parts[2]) if len(parts) > 2 else end - current_start
                    if duration > 0.3:
                        gaps.append({'start': round(current_start, 2), 'end': round(end, 2), 'duration': round(duration, 2)})
                    current_start = None
                except (IndexError, ValueError):
                    current_start = None
        return {'gaps': gaps, 'gap_count': len(gaps), 'total_gap_duration': round(sum(g['duration'] for g in gaps), 2)}
    except Exception as e:
        print(f"Warning: silence detection failed: {e}", file=sys.stderr)
    return None


def run_brightness_analysis(video_path, num_samples=10):
    """Sample frames and measure average brightness."""
    try:
        # Get duration
        probe = run_ffprobe(video_path)
        if not probe or 'format' not in probe:
            return None
        duration = float(probe['format'].get('duration', 0))
        if duration <= 0:
            return None

        # Extract sampled frames as PPM (fast, no encoding overhead)
        brightness_values = []
        for i in range(num_samples):
            t = duration * (i + 0.5) / num_samples
            result = subprocess.run(
                ['ffmpeg', '-ss', str(t), '-i', video_path,
                 '-vf', 'scale=16:16', '-pix_fmt', 'gray',
                 '-frames:v', '1', '-f', 'rawvideo', '-'],
                capture_output=True, timeout=10
            )
            if result.returncode == 0 and len(result.stdout) == 256:
                avg = sum(result.stdout) / len(result.stdout)
                brightness_values.append(round(avg / 255.0, 3))

        if brightness_values:
            avg_brightness = sum(brightness_values) / len(brightness_values)
            min_brightness = min(brightness_values)
            dark_frames = sum(1 for b in brightness_values if b < 0.15)
            return {
                'average_brightness': round(avg_brightness, 3),
                'min_brightness': min_brightness,
                'dark_frame_count': dark_frames,
                'total_sampled': len(brightness_values),
                'too_dark': avg_brightness < 0.25 or dark_frames > num_samples * 0.3,
            }
    except Exception as e:
        print(f"Warning: brightness analysis failed: {e}", file=sys.stderr)
    return None


def run_video_analyzer(video_path, api_key, api_url, model, max_frames=8):
    """Run video-analyzer tool for vision-based analysis."""
    # Find video-analyzer installation
    venv_paths = [
        '/tmp/video-analyzer/.venv/bin/video-analyzer',
        os.path.expanduser('~/.local/bin/video-analyzer'),
    ]
    analyzer_bin = None
    for p in venv_paths:
        if os.path.exists(p):
            analyzer_bin = p
            break

    if not analyzer_bin:
        return None, "video-analyzer not found. Install with: pip install video-analyzer"

    with tempfile.TemporaryDirectory(prefix='autotube-qa-') as tmpdir:
        try:
            env = os.environ.copy()
            env['OPENROUTER_KEY'] = api_key
            result = subprocess.run(
                [analyzer_bin, video_path,
                 '--client', 'openai_api',
                 '--api-key', api_key,
                 '--api-url', api_url,
                 '--model', model,
                 '--output', tmpdir,
                 '--max-frames', str(max_frames),
                 '--whisper-model', 'tiny',
                 '--log-level', 'WARNING'],
                capture_output=True, text=True, timeout=300, env=env
            )

            # Read analysis output
            analysis_file = os.path.join(tmpdir, 'analysis.json')
            if os.path.exists(analysis_file):
                with open(analysis_file) as f:
                    data = json.load(f)
                return {
                    'model': model,
                    'role': 'vision',
                    'transcript': data.get('transcript', {}).get('text', ''),
                    'frame_count': len(data.get('frame_analyses', [])),
                    'frames': [
                        {'index': i, 'description': fa.get('response', '')}
                        for i, fa in enumerate(data.get('frame_analyses', []))
                    ],
                    'video_description': data.get('video_description', {}).get('response', ''),
                }, None
            else:
                return None, f"video-analyzer produced no output. stderr: {result.stderr[-500:]}"
        except subprocess.TimeoutExpired:
            return None, "video-analyzer timed out after 5 minutes"
        except Exception as e:
            return None, f"video-analyzer error: {str(e)}"


def run_text_quality_judge(api_key, api_url, model, vision_reports):
    """Text-only second opinion over other judges' frame/video descriptions."""
    if not vision_reports:
        return None, "no vision reports for text judge"

    dossier_parts = []
    for vr in vision_reports:
        dossier_parts.append(f"### Judge {vr.get('model')}")
        dossier_parts.append(vr.get('video_description') or '')
        for fr in (vr.get('frames') or [])[:8]:
            dossier_parts.append(f"- frame {fr.get('index')}: {fr.get('description', '')}")
    dossier = '\n'.join(dossier_parts)[:12000]

    prompt = (
        "You are a YouTube video quality judge. Other vision models already described frames. "
        "From their notes only, list quality problems (dark frames, clutter, unreadable text, "
        "static/boring visuals, audio cues if mentioned). "
        "Reply JSON only: {\"issues\":[{\"severity\":\"critical|warning|info\",\"message\":\"...\"}],"
        "\"summary\":\"one sentence\",\"flags\":{\"dark_background\":false}}"
    )
    body = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': dossier},
        ],
        'temperature': 0.2,
        'response_format': {'type': 'json_object'},
    }
    url = api_url.rstrip('/') + '/chat/completions'
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://autotube.local',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
        content = payload['choices'][0]['message'].get('content') or ''
        if not str(content).strip():
            content = payload['choices'][0]['message'].get('reasoning') or ''
        parsed = json.loads(content) if isinstance(content, str) else content
        return {
            'model': model,
            'role': 'text',
            'video_description': parsed.get('summary', ''),
            'frame_count': 0,
            'frames': [],
            'transcript': '',
            'judge_issues': parsed.get('issues') or [],
            'flags': parsed.get('flags') or {},
        }, None
    except Exception as e:
        return None, f"text judge error: {e}"


def run_multi_judge_vision(video_path, api_key, api_url, judges, max_frames=8):
    """Run the quality-check judge panel and merge results."""
    judges = [j.strip() for j in judges if j and j.strip()]
    if not judges:
        judges = list(DEFAULT_JUDGES)

    vision_reports = []
    text_reports = []
    errors = []

    for model in judges:
        if model in TEXT_ONLY_JUDGES:
            continue
        print(f"👁  Vision judge: {model}", file=sys.stderr)
        report, err = run_video_analyzer(video_path, api_key, api_url, model, max_frames)
        if report:
            vision_reports.append(report)
        else:
            errors.append(f"{model}: {err}")

    for model in judges:
        if model not in TEXT_ONLY_JUDGES:
            continue
        print(f"📝 Text judge: {model}", file=sys.stderr)
        report, err = run_text_quality_judge(api_key, api_url, model, vision_reports)
        if report:
            text_reports.append(report)
        else:
            errors.append(f"{model}: {err}")

    all_reports = vision_reports + text_reports
    if not all_reports:
        return None, '; '.join(errors) if errors else 'all judges failed'

    # Primary vision blob for backward-compat scoring = first vision report
    primary = vision_reports[0] if vision_reports else all_reports[0]
    merged = dict(primary)
    merged['judges'] = all_reports
    merged['judge_models'] = [r.get('model') for r in all_reports]
    merged['judge_errors'] = errors
    # Union dark-background signal from text judge flags + all descriptions
    blob = ' '.join(
        (r.get('video_description') or '') + ' ' + ' '.join(
            f.get('description', '') for f in (r.get('frames') or [])
        )
        for r in all_reports
    ).lower()
    dark_flag = any((r.get('flags') or {}).get('dark_background') for r in text_reports)
    if dark_flag or 'dark background' in blob or 'very dark' in blob:
        merged['panel_dark_background'] = True
    return merged, ('; '.join(errors) if errors else None)


def compute_quality_score(metrics):
    """Compute an overall quality score (0-100) from all metrics."""
    score = 100
    issues = []

    # Audio loudness (25 points)
    loudness = metrics.get('loudness')
    if loudness:
        lufs = loudness.get('integrated_loudness_lufs', -14)
        if abs(lufs - (-14)) > 6:
            score -= 25
            issues.append({'severity': 'critical', 'category': 'audio', 'message': f'Audio is way too {"quiet" if lufs < -14 else "loud"} ({lufs:.1f} LUFS, target -14 LUFS)'})
        elif abs(lufs - (-14)) > 2:
            score -= 10
            issues.append({'severity': 'warning', 'category': 'audio', 'message': f'Audio loudness off target ({lufs:.1f} LUFS, target -14 LUFS)'})

    # Silence gaps (15 points)
    silence = metrics.get('silence')
    if silence:
        if silence['gap_count'] > 10:
            score -= 15
            issues.append({'severity': 'warning', 'category': 'audio', 'message': f'{silence["gap_count"]} silence gaps ({silence["total_gap_duration"]:.1f}s total)'})
        elif silence['gap_count'] > 5:
            score -= 8
            issues.append({'severity': 'info', 'category': 'audio', 'message': f'{silence["gap_count"]} silence gaps detected'})

    # Brightness (25 points)
    brightness = metrics.get('brightness')
    if brightness:
        if brightness.get('too_dark'):
            score -= 25
            issues.append({'severity': 'critical', 'category': 'visual', 'message': f'Video is too dark (avg brightness {brightness["average_brightness"]:.2f}, {brightness["dark_frame_count"]} dark frames)'})
        elif brightness.get('average_brightness', 0.5) < 0.3:
            score -= 10
            issues.append({'severity': 'warning', 'category': 'visual', 'message': f'Video is somewhat dark (avg brightness {brightness["average_brightness"]:.2f})'})

    # Resolution (10 points)
    probe = metrics.get('probe')
    if probe:
        streams = probe.get('streams', [])
        video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
        if video_stream:
            w = video_stream.get('width', 0)
            h = video_stream.get('height', 0)
            if w < 1280 or h < 720:
                score -= 10
                issues.append({'severity': 'warning', 'category': 'visual', 'message': f'Low resolution: {w}x{h} (recommend 1920x1080)'})

    # Vision analysis (25 points) — panel / single judge
    vision = metrics.get('vision')
    if vision:
        description = (vision.get('video_description', '') + ' '.join(
            f.get('description', '') for f in vision.get('frames', [])
        )).lower()
        dark = vision.get('panel_dark_background') or 'dark background' in description or 'very dark' in description
        if dark:
            score -= 15
            issues.append({'severity': 'warning', 'category': 'visual', 'message': 'Vision AI detected dark backgrounds in video'})
        for judge in vision.get('judges') or []:
            for ji in judge.get('judge_issues') or []:
                issues.append({
                    'severity': ji.get('severity') or 'info',
                    'category': 'visual',
                    'message': f"[{judge.get('model')}] {ji.get('message', '')}",
                })

    return max(0, min(100, score)), issues


def main():
    parser = argparse.ArgumentParser(description='AutoTube Video Quality Checker')
    parser.add_argument('video_path', help='Path to the video file')
    parser.add_argument('--api-key', help='OpenRouter API key for vision analysis')
    parser.add_argument('--api-url', default='https://openrouter.ai/api/v1', help='API URL')
    parser.add_argument(
        '--model',
        default=','.join(DEFAULT_JUDGES),
        help='Comma-separated judge models (vision + optional text-only)',
    )
    parser.add_argument('--max-frames', type=int, default=8, help='Max frames to analyze')
    parser.add_argument('--skip-vision', action='store_true', help='Skip vision model analysis')
    parser.add_argument('--json', action='store_true', help='Output JSON only')
    args = parser.parse_args()

    if not args.api_key:
        args.api_key = (
            os.environ.get('OPENROUTER_API_KEY')
            or os.environ.get('OPENROUTER_KEY')
            or os.environ.get('VITE_OPENROUTER_KEY')
            or ''
        )

    if not os.path.exists(args.video_path):
        print(f"Error: Video file not found: {args.video_path}", file=sys.stderr)
        sys.exit(1)

    metrics = {}

    # Step 1: ffprobe metadata
    if not args.json:
        print("📊 Analyzing video metadata...", file=sys.stderr)
    metrics['probe'] = run_ffprobe(args.video_path)

    # Step 2: Loudness analysis
    if not args.json:
        print("🔊 Measuring audio loudness...", file=sys.stderr)
    metrics['loudness'] = run_loudness_analysis(args.video_path)

    # Step 3: Silence detection
    if not args.json:
        print("🔇 Detecting silence gaps...", file=sys.stderr)
    metrics['silence'] = run_silence_detection(args.video_path)

    # Step 4: Brightness analysis
    if not args.json:
        print("💡 Analyzing frame brightness...", file=sys.stderr)
    metrics['brightness'] = run_brightness_analysis(args.video_path)

    # Step 5: Multi-judge vision panel (optional)
    vision_error = None
    if not args.skip_vision and args.api_key:
        judges = [m.strip() for m in args.model.split(',') if m.strip()]
        if not args.json:
            print(f"👁  Running judge panel ({len(judges)} models)...", file=sys.stderr)
        metrics['vision'], vision_error = run_multi_judge_vision(
            args.video_path, args.api_key, args.api_url, judges, args.max_frames
        )
    elif not args.api_key:
        vision_error = "No API key provided — skipping vision analysis"

    # Compute quality score
    score, issues = compute_quality_score(metrics)

    report = {
        'score': score,
        'issues': issues,
        'metadata': {
            'duration': float(metrics['probe']['format'].get('duration', 0)) if metrics.get('probe') and metrics['probe'].get('format') else None,
            'size_mb': round(int(metrics['probe']['format'].get('size', 0)) / 1048576, 1) if metrics.get('probe') and metrics['probe'].get('format') else None,
            'resolution': None,
            'video_bitrate_kbps': None,
            'audio_bitrate_kbps': None,
        },
        'loudness': metrics.get('loudness'),
        'silence': metrics.get('silence'),
        'brightness': metrics.get('brightness'),
        'vision': metrics.get('vision'),
        'vision_error': vision_error,
    }

    # Fill in resolution and bitrate from probe
    if metrics.get('probe'):
        for stream in metrics['probe'].get('streams', []):
            if stream.get('codec_type') == 'video':
                report['metadata']['resolution'] = f"{stream.get('width')}x{stream.get('height')}"
                br = stream.get('bit_rate')
                if br:
                    report['metadata']['video_bitrate_kbps'] = round(int(br) / 1000)
            elif stream.get('codec_type') == 'audio':
                br = stream.get('bit_rate')
                if br:
                    report['metadata']['audio_bitrate_kbps'] = round(int(br) / 1000)

    if args.json:
        print(json.dumps(_json_safe(report), indent=2))
    else:
        # Pretty print
        print(f"\n{'='*60}")
        print(f"  VIDEO QUALITY REPORT")
        print(f"{'='*60}")
        print(f"  Score: {score}/100")
        if report['metadata']['duration']:
            print(f"  Duration: {report['metadata']['duration']:.1f}s")
        if report['metadata']['resolution']:
            print(f"  Resolution: {report['metadata']['resolution']}")
        if report['metadata']['size_mb']:
            print(f"  Size: {report['metadata']['size_mb']} MB")
        print()

        if metrics.get('loudness'):
            l = metrics['loudness']
            status = "✅" if not l.get('needs_normalization') else "⚠️"
            print(f"  {status} Loudness: {l['integrated_loudness_lufs']:.1f} LUFS (target: -14)")

        if metrics.get('silence'):
            s = metrics['silence']
            status = "✅" if s['gap_count'] <= 5 else "⚠️"
            print(f"  {status} Silence gaps: {s['gap_count']} ({s['total_gap_duration']:.1f}s total)")

        if metrics.get('brightness'):
            b = metrics['brightness']
            status = "✅" if not b.get('too_dark') else "⚠️"
            print(f"  {status} Brightness: avg {b['average_brightness']:.2f}, min {b['min_brightness']:.2f}")

        if issues:
            print(f"\n  ISSUES:")
            for issue in issues:
                icon = "🔴" if issue['severity'] == 'critical' else "🟡" if issue['severity'] == 'warning' else "🔵"
                print(f"    {icon} [{issue['category']}] {issue['message']}")

        if vision_error:
            print(f"\n  Vision analysis: skipped ({vision_error})")
        elif metrics.get('vision'):
            print(f"\n  ✅ Vision analysis: {metrics['vision']['frame_count']} frames analyzed")

        print(f"\n{'='*60}")

    sys.exit(0)


if __name__ == '__main__':
    main()
