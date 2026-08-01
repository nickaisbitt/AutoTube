import React from 'react';
import { Sequence } from 'remotion';
import { ProjectProps } from '../types';
import { NarrationAudio } from './NarrationAudio';
import { BackgroundMusic } from './BackgroundMusic';

interface RenderAudioProps {
  project: ProjectProps;
  narrationAudioUrls?: Record<string, string>; // segmentId → audio URL
  /**
   * Frames to delay the narration/music timeline by so it lines up with the
   * MainVideo visuals (which start after the cold open + title card).
   */
  offsetFrames?: number;
}

export const RenderAudio: React.FC<RenderAudioProps> = ({
  project,
  narrationAudioUrls,
  offsetFrames = 0,
}) => {
  // Merge narration URLs into segments
  const segmentsWithAudio = project.segments.map(seg => ({
    ...seg,
    narrationAudioUrl: narrationAudioUrls?.[seg.id] || seg.narrationAudioUrl,
  }));

  return (
    <>
      {/* Delay narration so per-segment audio starts when MainVideo starts. */}
      <Sequence from={offsetFrames}>
        <NarrationAudio segments={segmentsWithAudio} fps={project.fps} />
      </Sequence>

      {/*
        Background music is opt-in: it only renders when the project supplies a
        `backgroundMusicUrl` (a URL served by REMOTION_SERVE_URL, e.g.
        `${DEV_SERVER_URL}/audio/bg-neutral.aac`). It plays across the whole
        composition and ducks under narration using the same offset.
      */}
      {project.backgroundMusicUrl ? (
        <BackgroundMusic
          musicUrl={project.backgroundMusicUrl}
          segments={segmentsWithAudio}
          fps={project.fps}
          offsetFrames={offsetFrames}
        />
      ) : null}
    </>
  );
};
