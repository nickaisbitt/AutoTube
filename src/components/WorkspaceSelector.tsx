import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, LogIn, Check, X } from 'lucide-react';
import {
  getWorkspaces,
  getActiveWorkspace,
  createWorkspace,
  joinWorkspace,
  switchWorkspace,
  type Workspace,
} from '../services/workspaces';
import { logger } from '../services/logger';

interface WorkspaceSelectorProps {
  onWorkspaceChange: (workspaceId: string) => void;
}

export default function WorkspaceSelector({ onWorkspaceChange }: WorkspaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => {
    setWorkspaces(getWorkspaces());
    setActiveWorkspace(getActiveWorkspace());
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMode('list');
      setNewName('');
      setInviteCode('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleCreate = () => {
    if (!newName.trim()) {
      setError('Workspace name is required');
      return;
    }
    const ws = createWorkspace(newName);
    logger.success('Workspace', `Created workspace: ${ws.name}`);
    refresh();
    onWorkspaceChange(ws.id);
    setIsOpen(false);
  };

  const handleJoin = () => {
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }
    const ws = joinWorkspace(inviteCode);
    if (!ws) {
      setError('Invalid invite code');
      return;
    }
    logger.success('Workspace', `Joined workspace: ${ws.name}`);
    refresh();
    onWorkspaceChange(ws.id);
    setIsOpen(false);
  };

  const handleSwitch = (wsId: string) => {
    switchWorkspace(wsId);
    refresh();
    onWorkspaceChange(wsId);
    setIsOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 border-2 border-surface-700 bg-surface-800 px-3 py-1.5 text-sm font-mono text-surface-300 hover:border-brand-500 hover:text-white"
      >
        <span className="max-w-[120px] truncate">
          {activeWorkspace?.name || 'Workspace'}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-72 border-2 border-surface-700 bg-surface-900 shadow-[4px_4px_0px_#ff5500]">
          {mode === 'list' && (
            <div className="p-2">
              <div className="mb-2 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-surface-500">
                Your Workspaces
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitch(ws.id)}
                    className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm font-mono ${
                      ws.id === activeWorkspace?.id
                        ? 'bg-brand-500/20 text-brand-400'
                        : 'text-surface-300 hover:bg-surface-800'
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === activeWorkspace?.id && (
                      <Check className="h-3 w-3 text-brand-500" />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t-2 border-surface-700 pt-2 space-y-1">
                <button
                  onClick={() => setMode('create')}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-mono text-surface-400 hover:bg-surface-800 hover:text-white"
                >
                  <Plus className="h-3 w-3" />
                  New Workspace
                </button>
                <button
                  onClick={() => setMode('join')}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-mono text-surface-400 hover:bg-surface-800 hover:text-white"
                >
                  <LogIn className="h-3 w-3" />
                  Join via Code
                </button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-medium text-white">New Workspace</span>
                <button onClick={() => setMode('list')} className="text-surface-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setError(null); }}
                placeholder="Workspace name"
                className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm font-mono text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              {error && <p className="text-xs font-mono text-red-400">{error}</p>}
              <button
                onClick={handleCreate}
                className="w-full bg-brand-500 py-2 text-sm font-bold font-mono text-black hover:bg-brand-400"
              >
                Create
              </button>
            </div>
          )}

          {mode === 'join' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-medium text-white">Join Workspace</span>
                <button onClick={() => setMode('list')} className="text-surface-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setError(null); }}
                placeholder="Invite code"
                maxLength={8}
                className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm font-mono text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none uppercase tracking-widest"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                autoFocus
              />
              {error && <p className="text-xs font-mono text-red-400">{error}</p>}
              <button
                onClick={handleJoin}
                className="w-full bg-brand-500 py-2 text-sm font-bold font-mono text-black hover:bg-brand-400"
              >
                Join
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
