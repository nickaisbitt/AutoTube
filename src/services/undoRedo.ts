import type { VideoProject } from '../types';
import { startRender, completeRender, getAnalyticsSummary } from './analytics';

const UNDO_STORAGE_KEY = 'autotube_undo_stack';
const MAX_UNDO_STATES = 50;

interface UndoStackEntry {
  state: VideoProject;
  timestamp: number;
}

class UndoRedoManager {
  private undoStack: UndoStackEntry[] = [];
  private redoStack: UndoStackEntry[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(UNDO_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { undo?: UndoStackEntry[]; redo?: UndoStackEntry[] };
        if (data.undo) this.undoStack = data.undo.slice(-MAX_UNDO_STATES);
        if (data.redo) this.redoStack = data.redo;
      }
    } catch {
      // ignore
    }
  }

  private saveToStorage() {
    try {
      const data = {
        undo: this.undoStack.slice(-MAX_UNDO_STATES),
        redo: this.redoStack,
      };
      localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // quota exceeded — silently drop
    }
  }

  pushState(state: VideoProject) {
    const snapshot = JSON.parse(JSON.stringify(state)) as VideoProject;
    this.undoStack.push({ state: snapshot, timestamp: Date.now() });
    if (this.undoStack.length > MAX_UNDO_STATES) {
      this.undoStack = this.undoStack.slice(-MAX_UNDO_STATES);
    }
    this.redoStack = [];
    this.saveToStorage();
  }

  undo(): VideoProject | null {
    if (this.undoStack.length === 0) return null;
    const entry = this.undoStack.pop()!;
    const currentState = JSON.parse(JSON.stringify(entry.state)) as VideoProject;
    this.redoStack.push({ state: currentState, timestamp: Date.now() });
    this.saveToStorage();
    if (this.undoStack.length === 0) return null;
    const prevEntry = this.undoStack[this.undoStack.length - 1];
    return JSON.parse(JSON.stringify(prevEntry.state)) as VideoProject;
  }

  redo(): VideoProject | null {
    if (this.redoStack.length === 0) return null;
    const entry = this.redoStack.pop()!;
    const currentState = JSON.parse(JSON.stringify(entry.state)) as VideoProject;
    this.undoStack.push({ state: currentState, timestamp: Date.now() });
    this.saveToStorage();
    return JSON.parse(JSON.stringify(entry.state)) as VideoProject;
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(projectId?: string) {
    if (projectId) {
      this.undoStack = this.undoStack.filter(e => e.state.id !== projectId);
      this.redoStack = this.redoStack.filter(e => e.state.id !== projectId);
    } else {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.saveToStorage();
  }
}

export const undoRedo = new UndoRedoManager();

export function estimateRenderTime(project: VideoProject, quality: string): number {
  const totalSec = project.script.reduce((s, seg) => s + seg.duration, 0);
  const durationMin = totalSec / 60;
  const resolution = project.exportSettings?.resolution || '1080p';
  const hasNarration = project.narration.some(n => n.status === 'ready');

  const analytics = getAnalyticsSummary();
  const recentRenders = analytics.renderTrend.filter(d => d.count > 0);

  if (recentRenders.length >= 5) {
    const last5Avg = analytics.averageRenderTimeMs;
    if (last5Avg > 0) {
      const resolutionMultiplier = resolution === '4K' ? 4 : resolution === '720p' ? 0.5 : 1;
      const qualityMultiplier = quality === 'high' ? 1.5 : 1;
      const durationRatio = durationMin / (analytics.totalRenderTimeMs > 0 ? (analytics.totalRenderTimeMs / 60000) / Math.max(1, analytics.totalRenders) : 1);
      const adjusted = last5Avg * resolutionMultiplier * qualityMultiplier * Math.min(durationRatio, 2);
      return Math.round(adjusted);
    }
  }

  const baseMsPerMinute = 60_000;
  let estimateMs = baseMsPerMinute * durationMin;

  const resolutionMultiplier = resolution === '4K' ? 4 : resolution === '720p' ? 0.5 : 1;
  estimateMs *= resolutionMultiplier;

  const qualityMultiplier = quality === 'high' ? 1.5 : 1;
  estimateMs *= qualityMultiplier;

  if (hasNarration) {
    estimateMs *= 1.3;
  }

  return Math.round(estimateMs);
}

export function formatTimeEstimate(ms: number): string {
  if (ms < 60_000) {
    return `~${Math.max(1, Math.round(ms / 1000))}s`;
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `~${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `~${hours}h${remainingMin > 0 ? ` ${remainingMin}m` : ''}`;
}

export function getRenderTrackStatus(estimatedMs: number, elapsedMs: number): { status: 'on_track' | 'running_slow' | 'complete'; ratio: number } {
  if (elapsedMs >= estimatedMs) {
    return { status: elapsedMs > estimatedMs * 1.5 ? 'running_slow' : 'complete', ratio: elapsedMs / estimatedMs };
  }
  const ratio = elapsedMs / estimatedMs;
  return { status: ratio > 1.2 ? 'running_slow' : 'on_track', ratio };
}

let activeRenderId: string | null = null;
let activeRenderStart = 0;

export function startRenderTracking(projectDuration: number, resolution: string, format: string): string {
  activeRenderId = startRender(projectDuration, resolution, format);
  activeRenderStart = Date.now();
  return activeRenderId;
}

export function completeRenderTracking(status: 'success' | 'failure' | 'cancelled', errorType?: string) {
  if (activeRenderId) {
    completeRender(activeRenderId, status, errorType);
    activeRenderId = null;
  }
}

export function getActiveRenderElapsed(): number {
  return activeRenderStart > 0 ? Date.now() - activeRenderStart : 0;
}
