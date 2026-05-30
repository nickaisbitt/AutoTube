import { AbsoluteFill, Series, useCurrentFrame } from 'remotion';
import { ProjectProps } from '../types';
import { ColdOpen } from './ColdOpen';
import { MainVideo } from './MainVideo';
import { EndScreen } from './EndScreen';

export const FullVideo: React.FC<ProjectProps> = (props) => {
  const coldOpenFrames = 72; // 3s at 24fps
  const endScreenFrames = 96; // 4s at 24fps
  const mainFrames = props.totalDurationFrames - coldOpenFrames - endScreenFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={coldOpenFrames}>
          <ColdOpen {...props} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={mainFrames}>
          <MainVideo {...props} startFrame={0} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={endScreenFrames}>
          <EndScreen {...props} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
