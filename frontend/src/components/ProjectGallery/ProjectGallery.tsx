import { useState, useMemo } from 'react';
import { Search, X, FolderSearch, ArrowUpDown, FolderPlus, Sparkles } from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import { ProjectCardSkeleton } from './ProjectCardSkeleton';
import type { StoredProject } from '@/services/storage';
import './ProjectGallery.css';

export interface ProjectGalleryProps {
  projects: StoredProject[];
  onOpenProject: (projectId: string) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  isLoading?: boolean;
  onCreateProject?: () => void;
}

type SortOption = 'lastModified' | 'nameAsc' | 'oldestFirst';

/**
 * Grid layout displaying saved projects as cards.
 * Shows projects sorted by most recently updated.
 */
export function ProjectGallery({
  projects,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  isLoading = false,
  onCreateProject,
}: ProjectGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastModified');

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    // Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((project) =>
        project.name.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'nameAsc':
          return a.name.localeCompare(b.name);
        case 'oldestFirst':
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          // Fallback to reversed modification time if created time is missing
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'lastModified':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [projects, searchQuery, sortBy]);

  // Show loading state
  if (isLoading) {
    return (
      <section className="project-gallery">
        <div className="project-gallery-header">
          <div className="project-gallery-header-left">
            <h2 className="project-gallery-title">Your Projects</h2>
            <p className="project-gallery-subtitle">Loading...</p>
          </div>
        </div>
        <div className="project-gallery-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  // Show empty state when no projects exist
  if (projects.length === 0) {
    return (
      <section className="project-gallery">
        <div className="project-gallery-empty-state">
          <div className="project-gallery-empty-state-icon">
            <FolderPlus size={48} />
          </div>
          <h3 className="project-gallery-empty-state-title">No projects yet</h3>
          <p className="project-gallery-empty-state-desc">
            Start building your first app with AI. Describe your idea and watch it come to life in seconds.
          </p>
          <button
            className="project-gallery-empty-state-cta"
            onClick={onCreateProject}
          >
            <Sparkles size={20} />
            Create Your First Project
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="project-gallery">
      <div className="project-gallery-header">
        <div className="project-gallery-header-left">
          <h2 className="project-gallery-title">Your Projects</h2>
          <p className="project-gallery-subtitle">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </p>
        </div>

        <div className="project-gallery-controls">
          {/* Search Bar */}
          <div className="project-gallery-search" role="search">
            <div className="project-gallery-search-inner">
              <Search className="project-gallery-search-icon" size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="project-gallery-search-input"
                aria-label="Search projects"
              />
              {searchQuery && (
                <button
                  className="project-gallery-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="project-gallery-sort">
            <div className="project-gallery-sort-icon">
              <ArrowUpDown size={16} />
            </div>
            <select
              className="project-gallery-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort projects"
            >
              <option value="lastModified">Last modified</option>
              <option value="nameAsc">Name (A-Z)</option>
              <option value="oldestFirst">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {filteredAndSortedProjects.length > 0 ? (
        <div className="project-gallery-grid">
          {filteredAndSortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={onOpenProject}
              onRename={onRenameProject}
              onDuplicate={onDuplicateProject}
              onDelete={onDeleteProject}
            />
          ))}
        </div>
      ) : (
        <div className="project-gallery-empty-search">
          <div className="project-gallery-empty-icon">
            <FolderSearch size={48} />
          </div>
          <h3 className="project-gallery-empty-title">No projects found</h3>
          <p className="project-gallery-empty-desc">
            No projects match "{searchQuery}"
          </p>
          <button
            className="project-gallery-empty-clear"
            onClick={() => setSearchQuery('')}
          >
            Clear Search
          </button>
        </div>
      )}
    </section>
  );
}
