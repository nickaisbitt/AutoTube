#!/usr/bin/env python3
"""
Image upscaler — upscales an image to target resolution using Pillow LANCZOS.
For production use, replace with Real-ESRGAN or waifu2x for better quality.
Usage: python3 upscale.py <input_path> <output_path> [target_width] [target_height]
"""

from __future__ import annotations

import sys
import os
from PIL import Image


def upscale(input_path: str, output_path: str, target_w: int = 1920, target_h: int = 1080) -> dict:
    try:
        img = Image.open(input_path)
        orig_w, orig_h = img.size

        # Only upscale if the image is smaller than target
        if orig_w >= target_w and orig_h >= target_h:
            return {
                "changed": False,
                "reason": f"already >= target ({orig_w}x{orig_h} >= {target_w}x{target_h})",
            }

        # Calculate aspect-ratio-preserving new size
        ratio = min(target_w / orig_w, target_h / orig_h)
        new_w = int(orig_w * ratio)
        new_h = int(orig_h * ratio)

        upscaled = img.resize((new_w, new_h), Image.LANCZOS)

        # Determine save format from output path extension
        ext = os.path.splitext(output_path)[1].lower()
        is_jpeg = ext in ('.jpg', '.jpeg')

        # If still smaller than target on one dimension, pad with black bars
        if new_w < target_w or new_h < target_h:
            canvas = Image.new('RGB', (target_w, target_h), (0, 0, 0))
            x_offset = (target_w - new_w) // 2
            y_offset = (target_h - new_h) // 2
            canvas.paste(upscaled, (x_offset, y_offset))
            if is_jpeg:
                canvas.save(output_path, quality=95)
            else:
                canvas.save(output_path)
        else:
            if is_jpeg:
                upscaled.save(output_path, quality=95)
            else:
                upscaled.save(output_path)

        return {
            "changed": True,
            "original": f"{orig_w}x{orig_h}",
            "new": f"{new_w}x{new_h}",
            "ratio": round(ratio, 3),
        }
    except Exception as e:
        return {"changed": False, "error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: upscale.py <input_path> <output_path> [target_width] [target_height]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    target_w = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
    target_h = int(sys.argv[4]) if len(sys.argv) > 4 else 1080

    import json
    result = upscale(input_path, output_path, target_w, target_h)
    print(json.dumps(result))
