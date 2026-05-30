#!/usr/bin/env python3
"""
JPEG artifact detector — analyses an image for compression artifacts,
blur, and blockiness. Returns a quality score 1-10.
Usage: python3 detect_quality.py <image_path>
"""

from __future__ import annotations

import sys
import json
from PIL import Image
import numpy as np


def detect_blur(image_path: str) -> float:
    """Laplacian variance — higher = sharper, lower = blurrier.
    Thresholds: < 100 = blurry, 100-300 = acceptable, > 300 = sharp"""
    with Image.open(image_path).convert('L') as img:
        arr = np.array(img, dtype=np.float32)
    laplacian = np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]])
    laplacian_arr = np.zeros_like(arr)
    # Simple edge detection via laplacian convolution
    for i in range(1, arr.shape[0] - 1):
        for j in range(1, arr.shape[1] - 1):
            laplacian_arr[i, j] = np.abs(np.sum(arr[i-1:i+2, j-1:j+2] * laplacian))
    variance = np.var(laplacian_arr)
    return float(variance)


def detect_blockiness(image_path: str) -> float:
    """JPEG blockiness score — detects 8×8 block boundaries.
    Higher = more blocky. Thresholds: < 5 = clean, 5-15 = moderate, > 15 = heavy"""
    with Image.open(image_path).convert('L') as img:
        arr = np.array(img, dtype=np.float32)

    h, w = arr.shape
    if h < 16 or w < 16:
        return 0.0

    # Measure horizontal block boundaries at every 8th pixel
    h_blockiness = 0.0
    count = 0
    for y in range(1, h - 1):
        for x in range(8, w - 8, 8):
            diff = abs(float(arr[y, x]) - float(arr[y, x - 1]))
            diff += abs(float(arr[y, x]) - float(arr[y, x + 1]))
            h_blockiness += diff / 2.0
            count += 1

    # Measure vertical block boundaries
    v_blockiness = 0.0
    for x in range(1, w - 1):
        for y in range(8, h - 8, 8):
            diff = abs(float(arr[y, x]) - float(arr[y - 1, x]))
            diff += abs(float(arr[y, x]) - float(arr[y + 1, x]))
            v_blockiness += diff / 2.0
            count += 1

    if count == 0:
        return 0.0
    return (h_blockiness + v_blockiness) / count


def detect_low_resolution(image_path: str) -> tuple:
    """Returns (width, height, is_low_res)"""
    with Image.open(image_path) as img:
        w, h = img.size
    pixels = w * h
    is_low = pixels < 1280 * 720  # below 720p
    return w, h, is_low


def score_image(image_path: str) -> dict:
    """Overall quality score 1-10"""
    try:
        w, h, is_low = detect_low_resolution(image_path)
        blur = detect_blur(image_path)
        blockiness = detect_blockiness(image_path)
    except Exception as e:
        return {"score": 1, "issues": [str(e)], "pass": False}

    issues = []
    score = 10

    # Resolution penalty
    if is_low:
        issues.append(f"low resolution: {w}x{h}")
        score -= 4
    elif w * h < 1920 * 1080:
        score -= 1  # below 1080p but above 720p

    # Blur penalty
    if blur < 100:
        issues.append(f"blurry (variance={blur:.1f})")
        score -= 3
    elif blur < 300:
        score -= 1

    # Blockiness penalty (JPEG artifacts)
    if blockiness > 15:
        issues.append(f"heavy JPEG artifacts (blockiness={blockiness:.1f})")
        score -= 2
    elif blockiness > 8:
        score -= 1

    # Aspect ratio penalty — only penalize extreme ratios not matching target format
    # For Shorts/TikTok (9:16), portrait is preferred; for YouTube (16:9), landscape is preferred
    if w > 0 and h > 0:
        ratio = w / h
        target_ratio = float(sys.argv[2]) if len(sys.argv) > 2 else 16/9  # default 16:9
        ratio_diff = abs(ratio - target_ratio)
        if ratio_diff > 0.5:
            issues.append(f"aspect ratio mismatch: {w}x{h} (ratio={ratio:.2f}, target={target_ratio:.2f})")
            score -= 2

    score = max(1, min(10, score))
    return {
        "score": score,
        "pass": score >= 5,
        "issues": issues,
        "blur_variance": round(blur, 1),
        "blockiness": round(blockiness, 1),
        "resolution": f"{w}x{h}",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: detect_quality.py <image_path>"}))
        sys.exit(1)

    result = score_image(sys.argv[1])
    print(json.dumps(result))
