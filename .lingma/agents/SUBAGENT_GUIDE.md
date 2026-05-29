# AutoTube Sub-Agents Guide

## Overview

5 specialized sub-agents have been created to tackle the remaining critical and high-priority issues from the Video Quality Audit. Each agent has specific expertise and tool access tailored to their domain.

## Available Sub-Agents

### 1. video-quality-auditor
**Focus**: Video encoding quality, codecs, hardware acceleration

**Use when**:
- Working with ffmpeg configuration
- Optimizing video quality settings
- Debugging color space or resolution issues
- Reviewing codec selection and bitrate allocation

**Example usage**:
```
Use the video-quality-auditor subagent to review our current encoding pipeline and identify quality improvements
```

---

### 2. audio-engineer
**Focus**: Audio processing, TTS, mixing, normalization

**Use when**:
- Fixing audio sample rate mismatches
- Implementing background music integration
- Debugging crossfade artifacts
- Optimizing audio normalization

**Example usage**:
```
Use the audio-engineer subagent to fix the background music missing issue (C4) and implement proper audio ducking
```

---

### 3. performance-optimizer
**Focus**: Caching, bottlenecks, memory leaks, concurrency

**Use when**:
- Analyzing render performance
- Fixing cache leaks (C6)
- Optimizing image preloading
- Reducing memory usage

**Example usage**:
```
Use the performance-optimizer subagent to implement a proper LRU cache and fix the memory leak issues
```

---

### 4. security-auditor
**Focus**: SSRF prevention, API keys, input validation, file permissions

**Use when**:
- Reviewing proxy endpoints
- Auditing external API integrations
- Checking for credential exposure
- Validating input sanitization

**Example usage**:
```
Use the security-auditor subagent to audit the proxyImage endpoint for SSRF vulnerabilities
```

---

### 5. reliability-engineer
**Focus**: Error handling, retry logic, checkpoint/resume, process monitoring

**Use when**:
- Fixing ffmpeg death detection (C7)
- Implementing checkpoint system
- Adding retry logic for transient failures
- Improving error handling coverage

**Example usage**:
```
Use the reliability-engineer subagent to improve ffmpeg death detection and implement graceful degradation
```

---

## Priority Roadmap

Based on the audit report, here's the recommended order to address remaining issues:

### Critical Issues (Address First)
1. **C4 - Background Music Missing** → Use `audio-engineer`
2. **C5 - Image Validation Gaps** → Use `video-quality-auditor` + `security-auditor`
3. **C6 - Cache Memory Leaks** → Use `performance-optimizer`
4. **C7 - FFmpeg Death Detection** → Use `reliability-engineer`
5. **C8 - 4K Support Broken** → ✅ Already fixed!

### High Priority Issues (Address Second)
6. Crossfade banding → Use `audio-engineer`
7. No audio normalization → Use `audio-engineer`
8. Subtitle support missing → Use `video-quality-auditor`
9. Checkpoint system incomplete → Use `reliability-engineer`
10. Resolution downscaling → ✅ Already fixed!

## How to Invoke Sub-Agents

Simply mention the agent name in your request:

```
"Use the [agent-name] subagent to [task description]"
```

Examples:
- "Use the performance-optimizer to analyze our current cache implementation"
- "Use the security-auditor to check for API key exposure in our codebase"
- "Use the reliability-engineer to add retry logic to image fetching"

## Agent Capabilities Matrix

| Agent | Read | Write | Edit | Bash | Grep | Glob |
|-------|------|-------|------|------|------|------|
| video-quality-auditor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audio-engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| performance-optimizer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| security-auditor | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| reliability-engineer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Note: Security auditor is read-only by design to prevent accidental changes during audits.

## Next Steps

1. Start with critical issues C4-C7
2. Launch agents in parallel when possible
3. Review agent findings and approve changes
4. Test fixes before committing
5. Update audit report as issues are resolved

Good luck with the remaining work! 🚀
