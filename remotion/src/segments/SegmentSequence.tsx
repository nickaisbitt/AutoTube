import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { getTopicPalette, hexToRgba } from '../utils/colors';

// Backgrounds
import { ProceduralBackground } from '../backgrounds/ProceduralBackground';
import { ImageBackground } from '../backgrounds/ImageBackground';
import { VideoBackground } from '../backgrounds/VideoBackground';
import { getKenBurnsParams } from '../utils/kenBurns';

// Layouts
import { StatCardLayout } from '../layouts/StatCardLayout';
import { QuoteCardLayout } from '../layouts/QuoteCardLayout';
import { LeftTextRightImageLayout } from '../layouts/LeftTextRightImageLayout';
import { LowerThirdOverlayLayout } from '../layouts/LowerThirdOverlayLayout';
import { CenteredTextLayout } from '../layouts/CenteredTextLayout';

// Effects
import { Vignette } from '../effects/Vignette';
import { FilmGrain } from '../effects/FilmGrain';
import { FilmScratch } from '../effects/FilmScratch';
import { FlashFrame } from '../effects/FlashFrame';

// Segment components
import { SegmentTitleCard } from './SegmentTitleCard';

interface SegmentSequenceProps extends ProjectProps {
  segment: SegmentProps;
  index: number;
  totalSegments: number;
}

function resolveLayout(segment: SegmentProps) {
  const layout = (segment.sceneLayout || '').toLowerCase();
  if (layout.includes('stat') || layout.includes('data')) return 'stat';
  if (layout.includes('quote') || layout.includes('cite')) return 'quote';
  if (layout.includes('split') || layout.includes('left')) return 'split';
  if (layout.includes('lower') || layout.includes('third') || layout.includes('overlay')) return 'lowerThird';
  if (layout.includes('center') || layout.includes('title')) return 'centered';
  // Default: pick based on segment type
  if (segment.type === 'intro' || segment.type === 'outro') return 'centered';
  if (segment.type === 'transition') return 'titleCard';
  return 'centered';
}

export const SegmentSequence: React.FC<SegmentSequenceProps> = (props) => {
  const { segment, index, totalSegments, fps, brand, topic, editPlan } = props;
  const frame = useCurrentFrame();
  const totalFrames = Math.round(segment.duration * fps);
  const progress = frame / totalFrames;
  const palette = getTopicPalette(topic);

  const mediaSrc = segment.media?.url;
  const mediaType = segment.media?.type || 'image';
  const isFallback = segment.media?.isFallback || false;
  const shotType = segment.media?.shotType || 'primary';
  const hasMedia = !!mediaSrc && mediaSrc.length > 0;
  const layout = resolveLayout(segment);

  // Find edit plan for this segment
  const segEditPlan = editPlan?.find(ep => ep.segmentId === segment.id);
  const mediaAssetId = segment.media?.id || '';
  const kbPlanParams = segEditPlan?.kenBurns?.[mediaAssetId];

  // Resolve Ken Burns parameters
  let kenBurns = kbPlanParams;
  if (!kenBurns) {
    const baseParams = getKenBurnsParams(segment.id, mediaAssetId);
    if (shotType === 'secondary') {
      // Secondary shots should have a distinct Ken Burns profile (reverse pan and zoom direction)
      kenBurns = {
        zoomStart: baseParams.zoomEnd,
        zoomEnd: baseParams.zoomStart,
        panDirectionX: -baseParams.panDirectionX,
        panDirectionY: -baseParams.panDirectionY,
      };
    } else {
      kenBurns = baseParams;
    }
  }

  // Fallback assets get slightly dimmed to improve readability/premium feel
  const brightness = isFallback ? 0.42 : 0.55;

  // Karaoke word timings
  const hasWordTimings = segment.narrationWordTimings && segment.narrationWordTimings.length > 0;
  const words = segment.narration.split(/\s+/);

  // Progress bar
  const barWidth = interpolate(progress, [0, 1], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Determine if we should show a title card (transition segments or explicit layout)
  const showTitleCard = segment.type === 'transition' || layout === 'titleCard';

  return (
    <AbsoluteFill>
      {/* ── Background ── */}
      {hasMedia ? (
        mediaType === 'video' ? (
          <VideoBackground
            src={mediaSrc!}
            kenBurns={kenBurns}
            width={1920}
            height={1080}
            brightness={brightness}
          />
        ) : (
          <ImageBackground
            src={mediaSrc!}
            kenBurns={kenBurns}
            width={1920}
            height={1080}
            brightness={brightness}
          />
        )
      ) : (
        <ProceduralBackground topic={topic} accentColor={brand.accentColor} />
      )}

      {/* ── Main layout content ── */}
      {showTitleCard ? (
        <SegmentTitleCard
          segment={segment}
          index={index}
          totalSegments={totalSegments}
          brand={brand}
          topic={topic}
        />
      ) : layout === 'stat' ? (
        <StatCardLayout segment={segment} brand={brand} topic={topic} mediaSrc={mediaSrc} />
      ) : layout === 'quote' ? (
        <QuoteCardLayout segment={segment} brand={brand} />
      ) : layout === 'split' ? (
        <LeftTextRightImageLayout segment={segment} brand={brand} mediaSrc={mediaSrc} mediaType={mediaType} />
      ) : layout === 'lowerThird' ? (
        <LowerThirdOverlayLayout segment={segment} brand={brand} />
      ) : (
        <CenteredTextLayout segment={segment} brand={brand} />
      )}

      {/* ── Karaoke subtitles ── */}
      {segment.type !== 'transition' && (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 60 }}>
          <div style={{
            maxWidth: '85%',
            textAlign: 'center',
            lineHeight: 1.5,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '2px 6px',
          }}>
            {hasWordTimings
              ? segment.narrationWordTimings!.map((wt, i) => {
                  const currentTimeMs = (frame / fps) * 1000;
                  const isActive = currentTimeMs >= wt.startMs && currentTimeMs <= wt.endMs;
                  const isPast = currentTimeMs > wt.endMs;
                  return (
                    <span key={i} style={{
                      fontSize: 26,
                      fontFamily: brand.fontFamily,
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? brand.accentColor : isPast ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
                      textShadow: isActive ? `0 0 16px ${hexToRgba(brand.accentColor, 0.5)}` : 'none',
                    }}>
                      {wt.word}
                    </span>
                  );
                })
              : (() => {
                  const msPerWord = (segment.duration * 1000) / words.length;
                  const currentTimeMs = (frame / fps) * 1000;
                  const currentWordIndex = Math.min(Math.floor(currentTimeMs / msPerWord), words.length - 1);
                  return words.map((word, i) => {
                    const isActive = i === currentWordIndex;
                    const isPast = i < currentWordIndex;
                    return (
                      <span key={i} style={{
                        fontSize: 26,
                        fontFamily: brand.fontFamily,
                        fontWeight: isActive ? 700 : 400,
                        color: isActive ? brand.accentColor : isPast ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
                        textShadow: isActive ? `0 0 16px ${hexToRgba(brand.accentColor, 0.5)}` : 'none',
                      }}>
                        {word}{' '}
                      </span>
                    );
                  });
                })()}
          </div>
        </AbsoluteFill>
      )}

      {/* ── Effects ── */}
      <Vignette intensity={0.45} />
      <FilmGrain opacity={0.035} />
      <FilmScratch count={2} />

      {/* Flash frame at segment start */}
      {frame < 3 && (
        <FlashFrame color={brand.accentColor} peakOpacity={0.4} duration={3} />
      )}

      {/* ── Letterbox bars ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
      }} />
      {/* Accent glow on inner edges */}
      <div style={{
        position: 'absolute', top: 38, left: 0, right: 0, height: 2,
        backgroundColor: hexToRgba(brand.accentColor, 0.4),
      }} />
      <div style={{
        position: 'absolute', bottom: 38, left: 0, right: 0, height: 2,
        backgroundColor: hexToRgba(brand.accentColor, 0.4),
      }} />

      {/* ── Chapter indicator ── */}
      <div style={{
        position: 'absolute', top: 48, left: 40,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontFamily: brand.fontFamily,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        CHAPTER {index + 1} OF {totalSegments}
      </div>

      {/* ── Progress bar ── */}
      <div style={{
        position: 'absolute', bottom: 50, left: '10%', right: '10%', height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
      }}>
        <div style={{
          width: `${barWidth}%`,
          height: '100%',
          backgroundColor: brand.accentColor,
          borderRadius: 1,
          boxShadow: `0 0 8px ${hexToRgba(brand.accentColor, 0.5)}`,
        }} />
      </div>

      {/* ── Watermark ── */}
      <div style={{
        position: 'absolute', bottom: 50, right: 40,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontFamily: brand.fontFamily,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        {brand.channelName}
      </div>
    </AbsoluteFill>
  );
};
