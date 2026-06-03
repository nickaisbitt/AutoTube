# Quality v2 render improvements (post user review)

Addresses: tiny captions, muddy narration, dated 2004 look.

## Audio
- Removed **1.5s `adelay`** on narration (was pushing speech late vs video)
- Segment gaps **0.25s** instead of **1.5s** (matches video with no segment title cards)
- Voice-first mix: narration weight **1.6**, music **0.22**
- Stronger ducking (**-32 dB** during speech), no room tone / ambient / sub-bass by default
- Dry narration path (no reverb), clearer EQ (+2.5 kHz presence)
- edge-tts rate **+0%** (was +10%)

## Visual
- Captions scale with resolution (~**5.2% / 6.2%** of frame height vs fixed 30px)
- Wider caption bar (**88%** width), fewer words on screen (**5**)
- Slimmer letterbox (**1.2%** vs 4%)
- Larger hook text (**7.8%** height), segment titles scale with height
- Slightly punchier image grade (saturation/contrast)

Regenerate: `npm run render:fixture:full` or `npm run generate:video -- "Your topic"`
