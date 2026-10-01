import { safeSetItem } from '../utils/storage';

/**
 * Workspace Management Service
 *
 * Multi-user organization support via localStorage.
 * Workspaces scope projects — each project belongs to exactly one workspace.
 */

export interface Workspace {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
}

const WORKSPACES_KEY = 'autotube_workspaces';
const ACTIVE_WORKSPACE_KEY = 'autotube_active_workspace';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWorkspaces(workspaces: Workspace[]): void {
  try {
    safeSetItem(WORKSPACES_KEY, JSON.stringify(workspaces));
  } catch {
    // quota exceeded — silently fail
  }
}

export function createWorkspace(name: string): Workspace {
  const workspaces = loadWorkspaces();
  const workspace: Workspace = {
    id: generateId(),
    name: name.trim() || 'My Workspace',
    inviteCode: generateInviteCode(),
    createdAt: new Date().toISOString(),
    memberCount: 1,
  };
  workspaces.push(workspace);
  saveWorkspaces(workspaces);
  setActiveWorkspace(workspace.id);
  return workspace;
}

export function joinWorkspace(code: string): Workspace | null {
  const workspaces = loadWorkspaces();
  const target = workspaces.find((w) => w.inviteCode.toUpperCase() === code.toUpperCase());
  if (!target) return null;
  target.memberCount += 1;
  saveWorkspaces(workspaces);
  setActiveWorkspace(target.id);
  return target;
}

export function getWorkspaces(): Workspace[] {
  return loadWorkspaces();
}

export function getActiveWorkspaceId(): string | null {
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
}

export function getActiveWorkspace(): Workspace | null {
  const activeId = getActiveWorkspaceId();
  if (!activeId) return null;
  return loadWorkspaces().find((w) => w.id === activeId) ?? null;
}

export function switchWorkspace(workspaceId: string): boolean {
  const workspaces = loadWorkspaces();
  const exists = workspaces.some((w) => w.id === workspaceId);
  if (!exists) return false;
  setActiveWorkspace(workspaceId);
  return true;
}

function setActiveWorkspace(workspaceId: string): void {
  try {
    safeSetItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch (err) {
    console.error('Failed to set active workspace:', err);
  }
}

export function deleteWorkspace(workspaceId: string): boolean {
  const workspaces = loadWorkspaces();
  const filtered = workspaces.filter((w) => w.id !== workspaceId);
  if (filtered.length === workspaces.length) return false;
  saveWorkspaces(filtered);

  // Clear active workspace if it was deleted
  if (getActiveWorkspaceId() === workspaceId) {
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  }

  // Delete all projects scoped to this workspace
  const projectKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('autotube-project-')) {
      projectKeys.push(key);
    }
  }
  for (const key of projectKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.project?.workspaceId === workspaceId) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore corrupt entries
    }
  }

  return true;
}

export function ensureDefaultWorkspace(): Workspace | null {
  const workspaces = loadWorkspaces();
  if (workspaces.length > 0) {
    // Ensure an active workspace is set
    if (!getActiveWorkspaceId()) {
      setActiveWorkspace(workspaces[0].id);
    }
    return workspaces[0];
  }
  return createWorkspace('Default Workspace');
}
