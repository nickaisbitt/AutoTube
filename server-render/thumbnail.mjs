/**
 * Thumbnail Generation Module
 *
 * Generates video thumbnail images using node-canvas.
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

/**
 * Generate a thumbnail PNG for the video project.
 *
 * Uses the best-scored media asset as the background with a gradient overlay,
 * accent bar, title text, and channel branding.
 *
 * @param {object} project        The VideoProject object.
 * @param {Map} imgCache          Pre-loaded image cache (url → Image).
 * @param {Function} fetchImage   Function to fetch an image by URL.
 * @param {Function} fetchVideoFrame  Function to extract a frame from a video clip.
 * @param {string} outputDir      Directory to write the thumbnail.
 * @returns {Promise<string|null>} Path to the generated thumbnail, or null on failure.
 */
export async function generateThumbnail(project, imgCache, fetchImage, fetchVideoFrame, outputDir) {
  console.log('\nGenerating thumbnail...');
  try {
    const thumbCanvas = createCanvas(1280, 720);
    const thumbCtx = thumbCanvas.getContext('2d');

    // Find the best-scored media asset
    const bestAsset = project.media.reduce((best, a) => (a.score || 0) > (best.score || 0) ? a : best, project.media[0]);
    let bestImg = null;

    if (bestAsset) {
      try {
        if (bestAsset.type === 'video') {
          bestImg = await fetchVideoFrame(bestAsset.url, 0.5, bestAsset.thumbnailUrl);
        } else {
          bestImg = imgCache.get(bestAsset.url) || await fetchImage(bestAsset.url);
        }
      } catch {
        bestImg = null;
      }
    }

    if (bestImg) {
      // Draw the best-scored image full-bleed
      const iw = bestImg.width || bestImg.naturalWidth || 1280;
      const ih = bestImg.height || bestImg.naturalHeight || 720;
      const scale = Math.max(1280 / iw, 720 / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      thumbCtx.drawImage(bestImg, (1280 - dw) / 2, (720 - dh) / 2, dw, dh);

      // Dark gradient overlay on the bottom 40%
      const gradY = 720 * 0.60;
      const grad = thumbCtx.createLinearGradient(0, gradY, 0, 720);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.3, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0.85)');
      thumbCtx.fillStyle = grad;
      thumbCtx.fillRect(0, gradY, 1280, 720 - gradY);

      // Accent bar
      const thumbAccentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
      const thumbAccent = thumbAccentColors[project.script[0]?.type] || '#e74c3c';
      thumbCtx.fillStyle = thumbAccent;
      thumbCtx.fillRect((1280 - 200) / 2, 720 * 0.58, 200, 4);

      // Title text
      const fullTitle = project.title || 'AutoTube Video';
      const words = fullTitle.split(/\s+/);
      let longestIdx = 0;
      for (let i = 1; i < words.length; i++) {
        if (words[i].length > words[longestIdx].length) longestIdx = i;
      }
      const start = Math.max(0, longestIdx - 1);
      const end = Math.min(words.length, longestIdx + 2);
      const thumbTitle = words.slice(start, end).join(' ');

      thumbCtx.save();
      thumbCtx.shadowColor = 'rgba(0,0,0,0.9)';
      thumbCtx.shadowBlur = 20;
      thumbCtx.shadowOffsetX = 3;
      thumbCtx.shadowOffsetY = 3;
      thumbCtx.fillStyle = '#ffffff';
      thumbCtx.font = 'bold 64px sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      thumbCtx.fillText(thumbTitle.substring(0, 35), 1280 / 2, 720 * 0.65);
      thumbCtx.restore();

      // Channel branding
      thumbCtx.save();
      thumbCtx.fillStyle = 'rgba(255,255,255,0.8)';
      thumbCtx.font = 'bold 18px sans-serif';
      thumbCtx.textAlign = 'left';
      thumbCtx.textBaseline = 'top';
      thumbCtx.fillText('The Update Desk', 20, 20);
      thumbCtx.restore();
    } else {
      // Fallback: procedural background
      const hookSeg = project.script[0];
      thumbCtx.fillStyle = '#0a0a1a';
      thumbCtx.fillRect(0, 0, 1280, 720);

      const fullTitle2 = project.title || 'AutoTube Video';
      thumbCtx.save();
      thumbCtx.shadowColor = 'rgba(0,0,0,0.9)';
      thumbCtx.shadowBlur = 20;
      thumbCtx.shadowOffsetX = 3;
      thumbCtx.shadowOffsetY = 3;
      thumbCtx.fillStyle = '#ffffff';
      thumbCtx.font = 'bold 64px sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      thumbCtx.fillText(fullTitle2.substring(0, 35), 1280 / 2, 720 * 0.60);
      thumbCtx.restore();
    }

    // Save thumbnail
    const thumbPath = join(outputDir, 'thumbnail.png');
    const thumbBuffer = thumbCanvas.toBuffer('image/png');
    writeFileSync(thumbPath, thumbBuffer);
    console.log(`🖼️  Thumbnail saved: ${thumbPath}`);

    // Copy to ~/Downloads
    const safeTopic = (project.title || project.topic || 'video')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 60);
    const thumbDownloadName = `autotube-${safeTopic}-thumbnail.png`;
    const thumbDownloadPath = `${process.env.HOME}/Downloads/${thumbDownloadName}`;
    spawnSync('cp', [thumbPath, thumbDownloadPath]);
    console.log(`📁 Thumbnail copied to ~/Downloads/${thumbDownloadName}`);

    return thumbPath;
  } catch (thumbErr) {
    console.warn('⚠ Thumbnail generation failed:', thumbErr.message);
    return null;
  }
}
