# Media Sourcing Runbook
## Scope
- src/media/, src/services/pexels*, src/services/unsplash*, image/video fetch pipelines
## Questions to ask
1. Are API keys stored securely and rotated on schedule?
2. Is there rate-limit handling (backoff, retry, quota tracking)?
3. Are fetched assets validated for format/size before use?
4. Is there a caching layer to avoid redundant API calls?
5. Are there fallback sources if a primary provider is down?
6. Do downloads respect timeout limits and disk-space constraints?
7. Is attribution metadata preserved where required by license?
## Tools
- grep for hardcoded API keys, missing try/catch around fetch
- Check for missing abort-controller usage on long downloads
