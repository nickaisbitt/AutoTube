import { useState, useMemo, useRef } from 'react';
import { Search, Filter, Calendar, X, Tag, Download, Upload, Copy, FileSpreadsheet, Pin, PinOff } from 'lucide-react';
import type { VideoProject } from '../types';
import { logger } from '../services/logger';
import EmptyState from './EmptyState';

interface SavedProject {
  id: string;
  title: string;
  topic: string;
  status: string;
  createdAt: string;
  tags?: string[];
  pinned?: boolean;
}

interface ProjectSearchProps {
  projects: SavedProject[];
  onSelect: (project: SavedProject) => void;
  onDelete: (id: string) => void;
  onImport?: (project: VideoProject) => void;
  onClone?: (project: VideoProject) => void;
  onCloneAsTemplate?: (project: VideoProject) => void;
  onTogglePin?: (id: string) => void;
}

export default function ProjectSearch({ projects, onSelect, onDelete, onImport, onClone, onCloneAsTemplate, onTogglePin }: ProjectSearchProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach(p => p.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [projects]);

  const toggleTagFilter = (tag: string) => {
    setActiveTagFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return projects.filter((p) => {
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.topic.toLowerCase().includes(q) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)));
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesTags = activeTagFilters.length === 0 || activeTagFilters.every(tf => p.tags?.includes(tf));
      return matchesQuery && matchesStatus && matchesTags;
    });
  }, [projects, query, statusFilter, activeTagFilters]);

  const pinnedProjects = useMemo(() => {
    return filtered.filter(p => p.pinned);
  }, [filtered]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [projects]);

  if (projects.length === 0) return null;

  const handleExportProject = (project: SavedProject) => {
    try {
      const key = `autotube-project-${project.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        setImportError('Project data not found');
        return;
      }
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${project.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logger.success('ImportExport', `Exported project: ${project.title}`);
    } catch (err) {
      setImportError(`Export failed: ${(err as Error).message}`);
    }
  };

  const handleExportAll = () => {
    try {
      const allProjects: VideoProject[] = [];
      for (const project of projects) {
        const key = `autotube-project-${project.id}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw) as { project?: VideoProject };
          if (data.project) allProjects.push(data.project);
        }
      }
      const blob = new Blob([JSON.stringify(allProjects, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autotube-projects-bulk-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logger.success('ImportExport', `Exported ${allProjects.length} projects`);
    } catch (err) {
      setImportError(`Bulk export failed: ${(err as Error).message}`);
    }
  };

  const validateProjectStructure = (data: unknown): data is VideoProject => {
    if (!data || typeof data !== 'object') return false;
    const p = data as Record<string, unknown>;
    return (
      typeof p.id === 'string' &&
      typeof p.title === 'string' &&
      typeof p.topic === 'string' &&
      typeof p.style === 'string' &&
      Array.isArray(p.script) &&
      Array.isArray(p.media) &&
      Array.isArray(p.narration) &&
      typeof p.status === 'string' &&
      typeof p.createdAt === 'string'
    );
  };

  const handleImportFile = (file: File) => {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        // Handle bulk import (array of projects)
        if (Array.isArray(parsed)) {
          let imported = 0;
          for (const item of parsed) {
            const projectData = (item as Record<string, unknown>)?.project ?? item;
            if (validateProjectStructure(projectData)) {
              const key = `autotube-project-${(projectData as VideoProject).id}`;
              localStorage.setItem(key, JSON.stringify({ project: projectData, savedAt: new Date().toISOString() }));
              imported++;
            }
          }
          if (imported > 0 && onImport) {
            // Load the first imported project
            const firstValid = parsed.find((item) => {
              const p = (item as Record<string, unknown>)?.project ?? item;
              return validateProjectStructure(p);
            });
            if (firstValid) {
              const p = (firstValid as Record<string, unknown>)?.project ?? firstValid;
              onImport(p as VideoProject);
            }
          }
          logger.success('ImportExport', `Bulk imported ${imported}/${parsed.length} projects`);
          return;
        }

        // Handle single project import
        const projectData = (parsed as Record<string, unknown>)?.project ?? parsed;
        if (!validateProjectStructure(projectData)) {
          setImportError('Invalid project structure — missing required fields');
          return;
        }
        const key = `autotube-project-${(projectData as VideoProject).id}`;
        localStorage.setItem(key, JSON.stringify({ project: projectData, savedAt: new Date().toISOString() }));
        if (onImport) onImport(projectData as VideoProject);
        logger.success('ImportExport', `Imported project: ${(projectData as VideoProject).title}`);
      } catch (err) {
        setImportError(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleCloneProject = (project: SavedProject) => {
    try {
      const key = `autotube-project-${project.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        setImportError('Project data not found');
        return;
      }
      const data = JSON.parse(raw) as { project?: VideoProject };
      if (!data.project) {
        setImportError('Project data not found');
        return;
      }
      const cloned = JSON.parse(JSON.stringify(data.project)) as VideoProject;
      cloned.id = `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      cloned.title = `${project.title} (Copy)`;
      cloned.createdAt = new Date();
      cloned.status = 'draft';
      const newKey = `autotube-project-${cloned.id}`;
      localStorage.setItem(newKey, JSON.stringify({ project: cloned, savedAt: new Date().toISOString() }));
      logger.success('Clone', `Cloned project: "${project.title}" → "${cloned.title}"`);
      onClone?.(cloned);
    } catch (err) {
      setImportError(`Clone failed: ${(err as Error).message}`);
    }
  };

  const handleCloneAsTemplate = (project: SavedProject) => {
    try {
      const key = `autotube-project-${project.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        setImportError('Project data not found');
        return;
      }
      const data = JSON.parse(raw) as { project?: VideoProject };
      if (!data.project) {
        setImportError('Project data not found');
        return;
      }
      const template = JSON.parse(JSON.stringify(data.project)) as VideoProject;
      template.id = `template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      template.title = `${project.title} (Template)`;
      template.createdAt = new Date();
      template.status = 'draft';
      template.media = [];
      template.narration = [];
      template.thumbnail = undefined;
      template.editPlan = undefined;
      template.blindReview = undefined;
      const newKey = `autotube-project-${template.id}`;
      localStorage.setItem(newKey, JSON.stringify({ project: template, savedAt: new Date().toISOString() }));
      logger.success('Clone', `Cloned as template: "${project.title}" → "${template.title}"`);
      onCloneAsTemplate?.(template);
    } catch (err) {
      setImportError(`Clone as template failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects by title, topic, or tags..."
          className="w-full border-2 border-surface-700 bg-surface-900 py-2.5 pl-10 pr-10 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter Toggle & Import/Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium ${
              showFilters || statusFilter !== 'all' || activeTagFilters.length > 0
                ? 'border-2 border-brand-500 bg-brand-500 text-black'
                : 'border-2 border-surface-700 bg-surface-900 text-surface-400 hover:border-surface-500'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {(statusFilter !== 'all' || activeTagFilters.length > 0) && (
              <span className="ml-1 rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                {statusFilter !== 'all' ? statusFilter : ''}{activeTagFilters.length > 0 ? ` +${activeTagFilters.length}` : ''}
              </span>
            )}
          </button>
          {onImport && (
            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 border-2 border-surface-700 bg-surface-900 px-3 py-1.5 text-xs font-mono font-medium text-surface-400 hover:border-brand-500 hover:text-white"
              title="Import Project(s)"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
          )}
          <button
            onClick={handleExportAll}
            className="flex items-center gap-2 border-2 border-surface-700 bg-surface-900 px-3 py-1.5 text-xs font-mono font-medium text-surface-400 hover:border-brand-500 hover:text-white"
            title="Export All Projects"
          >
            <Download className="h-3.5 w-3.5" />
            Export All
          </button>
        </div>
        <span className="text-xs font-mono text-surface-500">
          {filtered.length} of {projects.length} projects
        </span>
      </div>

      {/* Import Error */}
      {importError && (
        <div className="border-2 border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-400">
          {importError}
          <button onClick={() => setImportError(null)} className="ml-2 text-red-300 hover:text-white">
            <X className="inline h-3 w-3" />
          </button>
        </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          e.target.value = '';
        }}
      />

      {/* Filter Dropdowns & Tag Chips */}
      {showFilters && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="h-3.5 w-3.5 text-surface-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-2 border-surface-700 bg-surface-900 px-3 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="complete">Rendered</option>
              <option value="processing">Processing</option>
            </select>
            {activeTagFilters.length > 0 && (
              <button
                onClick={() => setActiveTagFilters([])}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-red-400 hover:text-red-300"
              >
                <X className="h-3 w-3" />
                Clear tags
              </button>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(tag => {
                const isActive = activeTagFilters.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono border transition-colors ${
                      isActive
                        ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                        : 'border-surface-700 bg-surface-900 text-surface-400 hover:border-surface-500'
                    }`}
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pinned Projects Section */}
      {pinnedProjects.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <Pin className="h-3.5 w-3.5" />
            Pinned
          </h3>
          <div className="space-y-1.5">
            {pinnedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelect(project)}
                className="group flex w-full items-center gap-3 border-2 border-amber-500/30 bg-surface-900 p-2.5 text-left hover:border-amber-500 hover:bg-surface-800"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-amber-500 text-black">
                  <Pin className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{project.title}</p>
                  <p className="truncate text-[11px] text-surface-500">{project.topic}</p>
                  {project.tags && project.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {project.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] font-mono text-surface-500 bg-surface-800 px-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-medium font-mono ${
                      project.status === 'complete'
                        ? 'bg-emerald-500 text-black'
                        : project.status === 'draft'
                          ? 'bg-surface-600 text-surface-200'
                          : 'bg-amber-500 text-black'
                    }`}
                  >
                    {project.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin?.(project.id);
                    }}
                    className="border-2 border-surface-700 p-1 text-amber-400 opacity-0 hover:border-amber-500 hover:text-amber-300 group-hover:opacity-100"
                    aria-label={`Unpin project ${project.title}`}
                    title="Unpin project"
                  >
                    <PinOff className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloneProject(project);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Clone project ${project.title}`}
                    title="Clone project"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloneAsTemplate(project);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Clone ${project.title} as template`}
                    title="Clone as template (strips media)"
                  >
                    <FileSpreadsheet className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportProject(project);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Export project ${project.title}`}
                    title="Export project"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project.id);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Delete project ${project.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Projects Section */}
      {recentProjects.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
            Recent Projects
          </h3>
          <div className="space-y-1.5">
            {recentProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelect(project)}
                className="group flex w-full items-center gap-3 border-2 border-surface-700 bg-surface-900 p-2.5 text-left hover:border-brand-500 hover:bg-surface-800"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-brand-500 text-black">
                  <span className="text-[10px] font-bold font-mono">
                    {project.title.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{project.title}</p>
                  <p className="truncate text-[11px] text-surface-500">{project.topic}</p>
                  {project.tags && project.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {project.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] font-mono text-surface-500 bg-surface-800 px-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-medium font-mono ${
                      project.status === 'complete'
                        ? 'bg-emerald-500 text-black'
                        : project.status === 'draft'
                          ? 'bg-surface-600 text-surface-200'
                          : 'bg-amber-500 text-black'
                    }`}
                  >
                    {project.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin?.(project.id);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-amber-500 hover:text-amber-400 group-hover:opacity-100"
                    aria-label={`Pin project ${project.title}`}
                    title="Pin project"
                  >
                    <Pin className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloneProject(project);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Clone project ${project.title}`}
                    title="Clone project"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloneAsTemplate(project);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Clone ${project.title} as template`}
                    title="Clone as template (strips media)"
                  >
                    <FileSpreadsheet className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportProject(project);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Export project ${project.title}`}
                    title="Export project"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project.id);
                    }}
                    className="border-2 border-surface-700 p-1 text-surface-500 opacity-0 hover:border-brand-500 hover:text-brand-400 group-hover:opacity-100"
                    aria-label={`Delete project ${project.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when filters yield no results */}
      {(query || statusFilter !== 'all' || activeTagFilters.length > 0) && filtered.length === 0 && (
        <EmptyState
          variant="no-projects"
          title="No projects found"
          description="Try adjusting your search or filters."
          actionLabel="Clear Filters"
          onAction={() => {
            setQuery('');
            setStatusFilter('all');
            setActiveTagFilters([]);
          }}
        />
      )}

      {/* Full Filtered List */}
      {(query || statusFilter !== 'all' || activeTagFilters.length > 0) && filtered.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
            Search Results
          </h3>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {filtered.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelect(project)}
                className="group flex w-full items-center gap-3 border-2 border-surface-700 bg-surface-900 p-2.5 text-left hover:border-brand-500 hover:bg-surface-800"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-brand-500 text-black">
                  <span className="text-[10px] font-bold font-mono">
                    {project.title.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{project.title}</p>
                  <p className="truncate text-[11px] text-surface-500">{project.topic}</p>
                  {project.tags && project.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {project.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] font-mono text-surface-500 bg-surface-800 px-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-medium font-mono ${
                      project.status === 'complete'
                        ? 'bg-emerald-500 text-black'
                        : project.status === 'draft'
                          ? 'bg-surface-600 text-surface-200'
                          : 'bg-amber-500 text-black'
                    }`}
                  >
                    {project.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin?.(project.id);
                    }}
                    className={`border-2 border-surface-700 p-1 opacity-0 group-hover:opacity-100 ${
                      project.pinned ? 'text-amber-400 hover:border-amber-500' : 'text-surface-500 hover:border-amber-500 hover:text-amber-400'
                    }`}
                    aria-label={project.pinned ? `Unpin project ${project.title}` : `Pin project ${project.title}`}
                    title={project.pinned ? 'Unpin project' : 'Pin project'}
                  >
                    {project.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
