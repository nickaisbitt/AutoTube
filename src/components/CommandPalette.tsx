import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Film } from 'lucide-react';

interface PaletteItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ElementType;
  action: () => void;
  section: 'commands' | 'recent_projects';
}

interface Command {
  id: string;
  label: string;
  icon: React.ElementType;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentProjects?: { id: string; title: string; topic: string }[];
  onSelectProject?: (id: string) => void;
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100;
  if (t.includes(q)) return 50;
  if (fuzzyMatch(q, t)) return 10;
  return 0;
}

export default function CommandPalette({ isOpen, onClose, commands, recentProjects = [], onSelectProject }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands = useMemo((): PaletteItem[] => {
    const cmds: PaletteItem[] = commands.map(c => ({ ...c, section: 'commands' as const }));
    const projectCommands: PaletteItem[] = recentProjects.slice(0, 5).map(p => ({
      id: `project-${p.id}`,
      label: p.title,
      subtitle: p.topic,
      icon: Film,
      action: () => onSelectProject?.(p.id),
      section: 'recent_projects' as const,
    }));
    return [...cmds, ...projectCommands];
  }, [commands, recentProjects, onSelectProject]);

  const filtered = useMemo(() => {
    if (!query) return allCommands;
    return allCommands
      .map(c => ({ ...c, score: fuzzyScore(query, c.label) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query, allCommands]);

  const commandItems = filtered.filter(c => c.section === 'commands');
  const projectItems = filtered.filter(c => c.section === 'recent_projects');

  const flatItems = useMemo((): PaletteItem[] => {
    const items: PaletteItem[] = [];
    if (commandItems.length > 0) items.push(...commandItems);
    if (projectItems.length > 0) items.push(...projectItems);
    return items;
  }, [commandItems, projectItems]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatItems.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && flatItems[selectedIndex]) {
        e.preventDefault();
        flatItems[selectedIndex].action();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, flatItems, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const renderSection = (title: string, items: PaletteItem[], startIndex: number) => (
    <div>
      <div className="px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-surface-500">
        {title}
      </div>
      {items.map((item, idx) => {
        const globalIdx = startIndex + idx;
        const isSelected = globalIdx === selectedIndex;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => { item.action(); onClose(); }}
            onMouseEnter={() => setSelectedIndex(globalIdx)}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
              isSelected ? 'bg-brand-500/20 text-white' : 'text-surface-300 hover:bg-surface-800'
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0 text-surface-400" />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{item.label}</span>
              {item.subtitle && (
                <p className="truncate text-[10px] font-mono text-surface-500">{item.subtitle}</p>
              )}
            </div>
            {isSelected && (
              <span className="text-[9px] font-mono text-surface-500">↵</span>
            )}
          </button>
        );
      })}
    </div>
  );

  let offset = 0;
  const sections: React.ReactNode[] = [];
  if (commandItems.length > 0) {
    sections.push(renderSection('Commands', commandItems, offset));
    offset += commandItems.length;
  }
  if (projectItems.length > 0) {
    if (sections.length > 0) sections.push(<div key="divider" className="border-t border-surface-700" />);
    sections.push(renderSection('Recent Projects', projectItems, offset));
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]" data-testid="command-palette">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded border-2 border-surface-700 bg-surface-900 shadow-[4px_4px_0px_#ff5500]">
        <div className="flex items-center gap-2 border-b-2 border-surface-700 px-4 py-3">
          <Search className="h-4 w-4 text-surface-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm font-mono text-white placeholder-surface-500 focus:outline-none"
            data-testid="command-palette-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-surface-500 hover:text-surface-300">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="rounded border border-surface-600 bg-surface-800 px-1.5 py-0.5 text-[9px] font-mono text-surface-500">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {flatItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-mono text-surface-500">
              No results found
            </div>
          ) : (
            sections
          )}
        </div>
        <div className="flex items-center justify-between border-t border-surface-700 px-4 py-2 text-[9px] font-mono text-surface-600">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  );
}
