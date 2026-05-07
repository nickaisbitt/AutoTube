import { useState, useCallback } from 'react';
import type { VideoProject, TopicConfig, ScriptSegment } from '../../types';

export interface ProjectSliceState {
  project: VideoProject | null;
  topicConfig: TopicConfig;
}

export interface ProjectSliceActions {
  setProject: (p: VideoProject | null | ((prev: VideoProject | null) => VideoProject | null)) => void;
  setTopicConfig: (config: TopicConfig) => void;
  updateSegment: (id: string, patch: Partial<ScriptSegment>) => void;
  updateNarrationText: (segmentId: string, text: string) => void;
}

export function useProjectSlice(): ProjectSliceState & ProjectSliceActions {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [topicConfig, setTopicConfig] = useState<TopicConfig>({
    topic: '',
    style: 'business_insider',
    targetDuration: 8,
    tone: 'informative',
    audience: 'General audience interested in current events',
  });

  const updateSegment = useCallback((id: string, patch: Partial<ScriptSegment>) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        script: prev.script.map((seg) =>
          seg.id === id ? { ...seg, ...patch } : seg,
        ),
      };
    });
  }, []);

  const updateNarrationText = useCallback((segmentId: string, text: string) => {
    setProject((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        script: prev.script.map((seg) =>
          seg.id === segmentId ? { ...seg, narration: text } : seg,
        ),
      };
    });
  }, []);

  return {
    project,
    topicConfig,
    setProject,
    setTopicConfig,
    updateSegment,
    updateNarrationText,
  };
}
