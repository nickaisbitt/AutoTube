# Video Render Runbook
## Scope
- src/render/, src/services/remotion*, serverRender.ts, composition configs
## Questions to ask
1. Are Remotion compositions typed and validated against schema?
2. Is there a timeout on server-side rendering to avoid hung processes?
3. Are temp files (frames, audio, video) cleaned up on success and failure?
4. Is the render queue protected against concurrent duplicate jobs?
5. Are there memory limits enforced per render process?
6. Do transitions and overlays handle edge cases (empty clips, zero duration)?
7. Is the output codec/container validated before upload?
8. Are error messages surfaced to the user actionable (not raw stack traces)?
## Tools
- grep for spawn/child_process without timeout, missing finally cleanup
- Check for missing concurrency guards on render endpoint
