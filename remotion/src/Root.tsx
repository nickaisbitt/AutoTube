import { Composition } from 'remotion';
import { FullVideo } from './compositions/FullVideo';
import { ProjectProps } from './types';

const defaultProps: ProjectProps = {
  title: 'Test Video',
  topic: 'Test Topic',
  style: 'documentary',
  segments: [
    {
      id: 'seg-1',
      title: 'Introduction',
      narration: 'This is a test video to verify the Remotion renderer works correctly.',
      type: 'intro',
      duration: 5,
      pacingScore: 3,
      sceneLayout: 'centered-text',
    },
    {
      id: 'seg-2',
      title: 'Main Content',
      narration: 'Here we explore the main topic with engaging visuals and narration.',
      type: 'section',
      duration: 6,
      pacingScore: 3,
      sceneLayout: 'left-text-right-image',
    },
    {
      id: 'seg-3',
      title: 'Conclusion',
      narration: 'Thank you for watching. Subscribe for more content like this.',
      type: 'outro',
      duration: 4,
      pacingScore: 2,
      sceneLayout: 'centered-text',
    },
  ],
  brand: {
    accentColor: '#3498db',
    channelName: 'AutoTube',
    fontFamily: 'Inter, system-ui, sans-serif',
    particleStyle: 'documentary',
  },
  editPlan: [],
  retentionBeats: [],
  totalDurationFrames: 360, // 15s at 24fps
  fps: 24,
  width: 1920,
  height: 1080,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FullVideo"
      component={FullVideo as any}
      durationInFrames={defaultProps.totalDurationFrames}
      fps={defaultProps.fps}
      width={defaultProps.width}
      height={defaultProps.height}
      defaultProps={defaultProps}
    />
  );
};
