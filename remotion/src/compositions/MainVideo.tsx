import { AbsoluteFill, Series, useCurrentFrame, interpolate } from 'remotion';
import { ProjectProps, SegmentProps } from '../types';
import { SegmentSequence } from '../segments/SegmentSequence';
import { getTopicPalette, hexToRgba } from '../utils/colors';

interface MainVideoProps extends ProjectProps {
  startFrame: number;
}

export const MainVideo: React.FC<MainVideoProps> = (props) => {
  const fps = props.fps;
  const palette = getTopicPalette(props.topic);

  return (
    <AbsoluteFill>
      <Series>
        {props.segments.map((seg, i) => {
          const durationFrames = Math.round(seg.duration * fps);
          return (
            <Series.Sequence key={seg.id} durationInFrames={durationFrames}>
              <SegmentSequence
                segment={seg}
                index={i}
                totalSegments={props.segments.length}
                {...props}
              />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
