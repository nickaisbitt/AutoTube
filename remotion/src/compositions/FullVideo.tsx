import { AbsoluteFill, Series } from 'remotion';
import { ProjectProps } from '../types';
import { ColdOpen } from './ColdOpen';
import { TitleCard } from './TitleCard';
import { MainVideo } from './MainVideo';
import { EndScreen } from './EndScreen';
import { RenderAudio } from '../audio/RenderAudio';

export const FullVideo: React.FC<ProjectProps> = (props) => {
  const coldOpenFrames = 72; // 3s at 24fps
  const titleCardFrames = 96; // 4s at 24fps
  const endScreenFrames = 96; // 4s at 24fps
  const mainFrames = props.totalDurationFrames - coldOpenFrames - titleCardFrames - endScreenFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Visual layers */}
      <Series>
        <Series.Sequence durationInFrames={coldOpenFrames}>
          <ColdOpen {...props} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={titleCardFrames}>
          <TitleCard {...props} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={mainFrames}>
          <MainVideo {...props} startFrame={0} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={endScreenFrames}>
          <EndScreen {...props} />
        </Series.Sequence>
      </Series>

      {/* Audio layer (narration) */}
      <RenderAudio project={props} />
    </AbsoluteFill>
  );
};
