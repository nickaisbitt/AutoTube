# Bugfix Requirements Document

## Introduction

The media sourcing pipeline (visual director / media harvester) pulls images from open search sources including DuckDuckGo, Wikimedia Commons, and Openverse, but performs no filtering on the source domain of harvested images. This allows images from state propaganda outlets (e.g., Sputnik News, RT), watermarked stock photo previews, low-quality meme sites, and adult content domains to be selected and used in generated videos. For a professional video generator, this is unacceptable — a concrete example is a Sputnik News watermarked image of soldiers appearing in a video about NATO/Sweden membership.

The root cause is that `src/services/media.ts` harvesting functions (`searchDDGLocal`, `searchWikimedia`, `searchDDGVideos`, and paid fallbacks) return candidates without checking the source URL domain against any quality or safety blocklist. The `scoreCandidate` function awards bonus points to high-trust domains but never rejects or filters out unacceptable ones.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the media harvester retrieves image candidates from DuckDuckGo whose source URL belongs to a state propaganda domain (e.g., sputniknews.com, rt.com, presstv.ir, cgtn.com) THEN the system includes those candidates in the scoring pool and may select them for the final video

1.2 WHEN the media harvester retrieves image candidates whose source URL belongs to a known watermarked stock preview domain (e.g., shutterstock.com preview URLs, gettyimages.com preview URLs, istockphoto.com, 123rf.com, dreamstime.com) THEN the system includes those watermarked preview images in the scoring pool and may select them for the final video

1.3 WHEN the media harvester retrieves image candidates whose source URL belongs to a low-quality meme site, content farm, or adult content domain THEN the system includes those candidates in the scoring pool and may select them for the final video

1.4 WHEN images from blocked domains are included in the candidate pool THEN the system provides no log entry or indication that unacceptable sources were considered or filtered

1.5 WHEN images from unknown or untrusted source domains are scored THEN the system treats them equally to images from high-quality editorial sources (aside from the existing high-trust bonus), providing no scoring differentiation based on source trustworthiness

### Expected Behavior (Correct)

2.1 WHEN the media harvester retrieves image candidates from DuckDuckGo whose source URL belongs to a blocked domain (state propaganda outlets such as sputniknews.com, rt.com, presstv.ir, cgtn.com, tass.com, xinhua.net, globalresearch.ca) THEN the system SHALL reject those candidates before they enter the scoring pool, using a configurable blocklist of domain patterns

2.2 WHEN the media harvester retrieves image candidates whose source URL belongs to a blocked watermarked stock preview domain (shutterstock.com preview URLs, gettyimages.com preview URLs, istockphoto.com, 123rf.com, dreamstime.com, depositphotos.com, alamy.com preview URLs) THEN the system SHALL reject those candidates before they enter the scoring pool

2.3 WHEN the media harvester retrieves image candidates whose source URL belongs to a blocked low-quality or adult content domain THEN the system SHALL reject those candidates before they enter the scoring pool

2.4 WHEN images are rejected due to domain filtering THEN the system SHALL log each rejection with the rejected URL, the matched blocklist pattern, and the reason category (propaganda, watermarked-stock, low-quality, adult-content) so the user can see what was filtered and why

2.5 WHEN images from unknown source domains (not on the blocklist and not on the high-trust list) pass domain filtering THEN the system SHALL apply a scoring penalty relative to images from known high-quality sources, so that trusted editorial sources (Reuters, AP, BBC, Wikimedia Commons, Unsplash, Pexels) are preferred over unknown domains

2.6 WHEN the blocklist is evaluated THEN the system SHALL match against both the candidate's `sourceUrl` hostname and the candidate's `url` hostname to catch cases where the image is hosted directly on a blocked domain

### Vision Model Quality Check (Reka Edge)

4.1 WHEN a media candidate passes domain filtering AND has an OpenRouter API key configured THEN the system SHALL send the candidate image (or a key frame for video candidates) to the `rekaai/reka-edge` vision model via OpenRouter for a physical quality inspection before final selection

4.2 THE vision model check SHALL evaluate each candidate against the following BLOCKING criteria (any match = immediate rejection):
  - Visible watermarks (stock photo watermarks, agency logos, "shutterstock", "getty", "alamy" text overlays)
  - State media branding or logos (RT, Sputnik, CGTN, TASS, Xinhua, PressTV logos/bugs)
  - Meme text overlays (Impact font captions, rage comic elements, "imgflip" watermarks)
  - Adult or graphic violence content
  - Extremely low resolution or heavily compressed/artifacted images
  - Screenshots of social media posts (Twitter/X cards, Facebook posts, Instagram screenshots)
  - AI-generated images with obvious artifacts (extra fingers, distorted faces, text gibberish)

4.3 THE vision model check SHALL evaluate each candidate against the following GO criteria (positive signals that boost scoring):
  - Professional editorial photography (clean composition, proper lighting, no overlays)
  - High resolution and sharp detail
  - Relevant subject matter matching the visual concept
  - Clean background or professional setting
  - Official/institutional imagery (government press photos, corporate press releases)
  - News wire quality (Reuters, AP, AFP style)

4.4 THE vision model SHALL return a structured JSON response with: `pass` (boolean), `confidence` (0-100), `issues` (array of detected problems from the blocking list), `quality_signals` (array of detected positive signals from the go list), and `quality_score` (1-10)

4.5 WHEN the vision model returns `pass: false` for a candidate THEN the system SHALL reject that candidate with a log entry containing the detected issues, and attempt the next-best candidate from the scoring pool

4.6 WHEN the vision model returns `pass: true` THEN the system SHALL add the `quality_score` (scaled to 0-200) as a bonus to the candidate's existing score, so vision-verified high-quality assets rank higher

4.7 IF the OpenRouter API key is not configured OR the vision model call fails OR times out (15s limit) THEN the system SHALL fall back to domain-only filtering and log a warning — the vision check is non-blocking and the pipeline SHALL continue without it

4.8 THE vision model check SHALL use `fetchWithTimeout` with a 15-second timeout and 1 retry, consistent with the existing OpenRouter call pattern

4.9 THE system SHALL batch vision checks where possible — sending up to 3 candidates concurrently per segment to minimize latency while respecting rate limits

### Resolution Preference (4K+)

5.1 WHEN scoring media candidates THEN the system SHALL apply a resolution-based scoring bonus: 4K+ (≥3840×2160) receives +200 bonus, 2K/1440p (≥2560×1440) receives +100 bonus, 1080p (≥1920×1080) receives +50 bonus, 720p (≥1280×720) receives +0 (baseline), below 720p receives -100 penalty

5.2 WHEN the media harvester constructs search queries for DuckDuckGo THEN the system SHALL append resolution hints (e.g., "4K", "high resolution", "UHD") to image search queries to bias results toward higher-resolution assets

5.3 WHEN multiple candidates for the same segment have similar relevance scores (within 100 points) THEN the system SHALL prefer the higher-resolution candidate, effectively using resolution as a tiebreaker

5.4 WHEN a candidate's dimensions are unknown (width/height not available from the search API) THEN the system SHALL NOT apply any resolution bonus or penalty — the candidate is scored at baseline

5.5 WHEN the media harvester retrieves candidates from Wikimedia Commons THEN the system SHALL request the highest available resolution version of each image using the Wikimedia API's `thumbwidth` parameter set to 3840

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the media harvester retrieves image candidates from Wikimedia Commons THEN the system SHALL CONTINUE TO include and score those candidates normally, as Wikimedia Commons is a trusted source

3.2 WHEN the media harvester retrieves image candidates from DuckDuckGo whose source URL belongs to a non-blocked, legitimate news or editorial domain (e.g., reuters.com, apnews.com, bbc.co.uk) THEN the system SHALL CONTINUE TO include and score those candidates normally with their existing high-trust bonus

3.3 WHEN the media harvester uses Picsum/Unsplash fallback sources THEN the system SHALL CONTINUE TO generate and include those fallback candidates normally, as they have no external source domain to filter

3.4 WHEN the media harvester retrieves video candidates from DuckDuckGo Video search THEN the system SHALL CONTINUE TO include and score those candidates normally when their source URL does not match a blocked domain

3.5 WHEN the `scoreCandidate` function evaluates keyword relevance, resolution, aspect ratio, topic relevance, and negative keyword filters THEN the system SHALL CONTINUE TO apply all existing scoring logic unchanged

3.6 WHEN paid fallback sources (Serper, Firecrawl) return candidates from non-blocked domains THEN the system SHALL CONTINUE TO include and score those candidates normally
