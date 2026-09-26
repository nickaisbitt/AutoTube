# Playable gallery

Previews are re-encoded **H.264 Main @ level 3.1**, 720p, AAC, `+faststart` for Chrome / Safari / QuickTime.

## Watch

1. Open this folder’s `index.html` after linking/copying the MP4s:
   ```bash
   for id in tide-ink-v2 glass-keeper pixel-wizard orange-cosmos tile-hatch mosaic-flock sand-america; do
     cp -f ../$id/out/${id}-preview.mp4 ./${id}.mp4
   done
   python3 -m http.server 8765
   ```
   Then open http://127.0.0.1:8765/

2. Or open any `demos/<id>/out/<id>-preview.mp4` directly in VLC / QuickTime / Chrome.
