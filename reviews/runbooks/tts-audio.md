# TTS & Audio Runbook
## Scope
- src/tts/, src/audio/, Kokoro ONNX service, audio pipeline
## Questions to ask
1. Is the ONNX model loaded once and reused (no per-request reload)?
2. Are audio files written to tmp/ and cleaned up after render?
3. Is SSML or phoneme input sanitized against injection?
4. Are sample rate and channel config consistent across pipeline stages?
5. Is there error handling for GPU/CPU fallback in ONNX runtime?
6. Are long narrations chunked to avoid memory spikes?
7. Is audio duration validated against script timing expectations?
## Tools
- grep for new OnnxModel or similar inside request handlers
- Check for missing fs.unlink or tmp cleanup in finally blocks
