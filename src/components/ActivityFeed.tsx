import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface ActivityEntry {
  id: string;
  type: 'project_created' | 'render_completed' | 'settings_updated' | 'project_deleted' | 'export_started' | 'narration_generated' | 'media_sourced';
  message: string;
  timestamp: string;
}

const STORAGE_KEY = 'autotube_activity_feed';
const MAX_ENTRIES = 20;

export function addActivity(type: ActivityEntry['type'], message: string) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const entries: ActivityEntry[] = stored ? JSON.parse(stored) : [];
    const newEntry: ActivityEntry = {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    entries.unshift(newEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Ignore storage errors
  }
}

export function getActivities(): ActivityEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearActivities() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString();
}

const typeIcons: Record<ActivityEntry['type'], string> = {
  project_created: '+',
  render_completed: '▶',
  settings_updated: '⚙',
  project_deleted: '×',
  export_started: '↓',
  narration_generated: '♪',
  media_sourced: '◉',
};

export default function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setActivities(getActivities());
  }, []);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearActivities();
    setActivities([]);
  }, []);

  if (activities.length === 0) return null;

  return (
    <div className="border-t-2 border-surface-700">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-widest text-surface-500 hover:text-surface-300"
      >
        <span>Recent Activity</span>
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto px-3 pb-3">
          <div className="mb-1 flex justify-end">
            <button
              onClick={handleClear}
              className="text-[9px] font-mono text-surface-600 hover:text-red-400"
              title="Clear activity"
            >
              Clear
            </button>
          </div>
          <div className="space-y-1">
            {activities.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 rounded border border-surface-800 bg-surface-900/50 px-2 py-1.5 text-[11px]"
              >
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-brand-500/20 font-mono text-[8px] text-brand-400">
                  {typeIcons[a.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-surface-300">{a.message}</p>
                  <p className="text-[9px] font-mono text-surface-600">{formatRelativeTime(a.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
