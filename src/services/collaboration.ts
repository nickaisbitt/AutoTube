import { safeSetItem } from '../utils/storage';
import type { VideoProject } from '../types';

export interface Comment {
  id: string;
  segmentId: string;
  text: string;
  author: string;
  createdAt: string;
}

const COMMENTS_STORAGE_KEY = 'autotube-comments';

function getCommentsStorage(): Record<string, Comment[]> {
  try {
    const raw = localStorage.getItem(COMMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setCommentsStorage(data: Record<string, Comment[]>) {
  try {
    safeSetItem(COMMENTS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded
  }
}

export function shareProject(_projectId: string, project: VideoProject | null): string {
  if (!project) return '';
  const shareData = {
    id: project.id,
    title: project.title,
    topic: project.topic,
    style: project.style,
    targetDuration: project.targetDuration,
    script: project.script,
    media: project.media,
    narration: project.narration,
    topicContext: project.topicContext,
    visualPlans: project.visualPlans,
    editPlan: project.editPlan,
  };
  const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)));
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?shared=${encoded}`;
}

export function loadSharedProject(url: string): VideoProject | null {
  try {
    const urlObj = new URL(url, window.location.origin);
    const encoded = urlObj.searchParams.get('shared');
    if (!encoded) return null;
    const decoded = decodeURIComponent(atob(encoded));
    const data = JSON.parse(decoded);
    return {
      version: 1,
      id: data.id ?? `shared-${Date.now()}`,
      title: data.title ?? 'Shared Project',
      topic: data.topic ?? '',
      style: data.style ?? 'business_insider',
      targetDuration: data.targetDuration ?? 5,
      script: data.script ?? [],
      media: data.media ?? [],
      narration: data.narration ?? [],
      status: 'draft',
      createdAt: new Date(),
      topicContext: data.topicContext,
      visualPlans: data.visualPlans,
      editPlan: data.editPlan,
    } as VideoProject;
  } catch {
    return null;
  }
}

export function addComment(segmentId: string, text: string, author: string = 'You'): Comment | null {
  if (!text.trim()) return null;
  const comment: Comment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    segmentId,
    text: text.trim(),
    author,
    createdAt: new Date().toISOString(),
  };
  const storage = getCommentsStorage();
  const key = segmentId;
  if (!storage[key]) storage[key] = [];
  storage[key].push(comment);
  setCommentsStorage(storage);
  return comment;
}

export function getComments(segmentId: string): Comment[] {
  const storage = getCommentsStorage();
  return storage[segmentId] ?? [];
}

export function deleteComment(segmentId: string, commentId: string): boolean {
  const storage = getCommentsStorage();
  const key = segmentId;
  if (!storage[key]) return false;
  const before = storage[key].length;
  storage[key] = storage[key].filter((c) => c.id !== commentId);
  const changed = storage[key].length < before;
  if (changed) setCommentsStorage(storage);
  return changed;
}
