import React from 'react';
import { ProjectProps } from '../types';
import { NarrationAudio } from './NarrationAudio';

interface RenderAudioProps {
  project: ProjectProps;
  narrationAudioUrls?: Record<string, string>; // segmentId → audio URL
}

export const RenderAudio: React.FC<RenderAudioProps> = ({
  project,
  narrationAudioUrls,
}) => {
  // Merge narration URLs into segments
  const segmentsWithAudio = project.segments.map(seg => ({
    ...seg,
    narrationAudioUrl: narrationAudioUrls?.[seg.id] || seg.narrationAudioUrl,
  }));

  return (
    <>
      <NarrationAudio segments={segmentsWithAudio} fps={project.fps} />
      {/* Background music would go here if musicUrl is provided */}
    </>
  );
};
