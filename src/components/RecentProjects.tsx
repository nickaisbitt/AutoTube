import { useState, useEffect } from 'react';
import { Clock, Trash2, Play, ChevronRight } from 'lucide-react';

interface RecentProject {
  id: string;
  title: string;
  topic: string;
  style: string;
  createdAt: string;
  status: string;
}

interface RecentProjectsProps {
  onSelect: (project: RecentProject) => void;
  onDelete: (id: string) => void;
}

export default function RecentProjects({ onSelect, onDelete }: RecentProjectsProps) {
  const [projects, setProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('autotube_recent_projects');
      if (stored) {
        setProjects(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    localStorage.setItem('autotube_recent_projects', JSON.stringify(updated));
    onDelete(id);
  };

  if (projects.length === 0) {
    return (
      <div className="border-2 border-surface-700 bg-surface-900 p-6 text-center">
        <Clock className="mx-auto mb-3 h-8 w-8 text-surface-600" />
        <p className="text-sm font-medium text-surface-400">No recent projects</p>
        <p className="mt-1 text-xs font-mono text-surface-500">Your generated videos will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-surface-300">Recent Projects</h3>
      {projects.map((project) => (
        <button
          key={project.id}
          onClick={() => onSelect(project)}
          className="group flex w-full items-center gap-3 border-2 border-surface-700 bg-surface-900 p-3 text-left transition-colors duration-200 hover:bg-brand-500 hover:text-black hover:border-brand-500"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-brand-500 text-black">
            <Play className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{project.title}</p>
            <p className="truncate text-[11px] text-surface-500">{project.topic}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 text-[10px] font-medium font-mono ${
              project.status === 'complete' ? 'bg-emerald-500 text-black' : 'bg-amber-500 text-black'
            }`}>
              {project.status}
            </span>
            <ChevronRight className="h-4 w-4 text-surface-500" />
            <button
              onClick={(e) => handleDelete(project.id, e)}
              className="border-2 border-surface-700 p-1 text-surface-500 transition-colors duration-200 hover:bg-brand-500 hover:text-black hover:border-brand-500"
              aria-label={`Delete project ${project.title}`}
              title={`Delete project ${project.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </button>
      ))}
    </div>
  );
}
