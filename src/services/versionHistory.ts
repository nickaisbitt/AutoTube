import { safeSetItem } from '../utils/storage';
import type { VideoProject } from '../types';

export interface VersionEntry {
  id: string;
  projectId: string;
  label: string;
  timestamp: string;
  snapshot: VideoProject;
}

const VERSIONS_STORAGE_KEY = 'autotube-versions';

function getVersionsStorage(): Record<string, VersionEntry[]> {
  try {
    const raw = localStorage.getItem(VERSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setVersionsStorage(data: Record<string, VersionEntry[]>) {
  try {
    safeSetItem(VERSIONS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded
  }
}

export function saveVersion(project: VideoProject, label: string): VersionEntry | null {
  if (!project?.id) return null;
  const version: VersionEntry = {
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: project.id,
    label: label || `Version ${new Date().toLocaleString()}`,
    timestamp: new Date().toISOString(),
    snapshot: JSON.parse(JSON.stringify(project)),
  };
  const storage = getVersionsStorage();
  const key = project.id;
  if (!storage[key]) storage[key] = [];
  storage[key].push(version);
  if (storage[key].length > 20) {
    storage[key] = storage[key].slice(-20);
  }
  setVersionsStorage(storage);
  return version;
}

export function getVersions(projectId: string): VersionEntry[] {
  const storage = getVersionsStorage();
  return storage[projectId] ?? [];
}

export function restoreVersion(versionId: string, projectId: string): VideoProject | null {
  const storage = getVersionsStorage();
  const versions = storage[projectId] ?? [];
  const entry = versions.find((v) => v.id === versionId);
  if (!entry) return null;
  return JSON.parse(JSON.stringify(entry.snapshot)) as VideoProject;
}

export function deleteVersion(versionId: string, projectId: string): boolean {
  const storage = getVersionsStorage();
  const key = projectId;
  if (!storage[key]) return false;
  const before = storage[key].length;
  storage[key] = storage[key].filter((v) => v.id !== versionId);
  const changed = storage[key].length < before;
  if (changed) setVersionsStorage(storage);
  return changed;
}

export function compareVersions(a: VideoProject, b: VideoProject): string[] {
  const diffs: string[] = [];
  if (a.title !== b.title) {
    diffs.push(`Title changed: "${a.title}" -> "${b.title}"`);
  }
  if (a.topic !== b.topic) {
    diffs.push(`Topic changed: "${a.topic}" -> "${b.topic}"`);
  }
  if (a.style !== b.style) {
    diffs.push(`Style changed: ${a.style} -> ${b.style}`);
  }
  if (a.script.length !== b.script.length) {
    diffs.push(`Script segments changed: ${a.script.length} -> ${b.script.length}`);
  } else {
    for (let i = 0; i < a.script.length; i++) {
      const sa = a.script[i];
      const sb = b.script[i];
      if (sa.narration !== sb.narration) {
        diffs.push(`Segment ${i + 1} narration changed`);
      }
      if (sa.duration !== sb.duration) {
        diffs.push(`Segment ${i + 1} duration changed: ${sa.duration}s -> ${sb.duration}s`);
      }
      if (sa.visualNote !== sb.visualNote) {
        diffs.push(`Segment ${i + 1} visual note changed`);
      }
    }
  }
  if (a.media.length !== b.media.length) {
    diffs.push(`Media assets changed: ${a.media.length} -> ${b.media.length}`);
  }
  if (a.narration.length !== b.narration.length) {
    diffs.push(`Narration clips changed: ${a.narration.length} -> ${b.narration.length}`);
  }
  if (a.thumbnail !== b.thumbnail) {
    diffs.push('Thumbnail changed');
  }
  if (a.status !== b.status) {
    diffs.push(`Status changed: ${a.status} -> ${b.status}`);
  }
  if (diffs.length === 0) {
    diffs.push('No changes detected');
  }
  return diffs;
}
