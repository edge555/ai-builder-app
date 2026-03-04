import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, X, FolderSearch, ArrowUpDown, FolderPlus, Sparkles, Loader2 } from 'lucide-react';
import { useState, useMemo, memo, useRef, useDeferredValue } from 'react';

import type { ProjectMetadata } from '@/services/storage';

import { ProjectCard } from './ProjectCard';
import { ProjectCardSkeleton } from './ProjectCardSkeleton';
import { ProjectGalleryTabs } from './ProjectGalleryTabs';
import { RecentProjects } from './RecentProjects';
import './ProjectGallery.css';

export interface ProjectGalleryProps {
  projects: ProjectMetadata[];
  onOpenProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  isLoading?: boolean;
  onCreateProject?: () => void;
  /** Optional callback fired when hovering a project card or CTA — used to preload the BuilderPage chunk. */
  onPreloadBuilder?: () => void;
}

type SortOption = 'lastModified' | 'nameAsc' | 'oldestFirst';

/**
 * Threshold for enabling virtualization.
 * Lists with more items than this will use virtual scrolling.
 */
const VIRTUALIZATION_THRESHOLD = 20;

/**
 * Estimated height of a project card (in pixels).
 * Used for virtual scrolling calculations.
 */
const ESTIMATED_CARD_HEIGHT = 200;

/**
 * Component that renders projects either as a normal grid or virtualized list
 * based on the number of projects.
 */
interface VirtualizedOrNormalGridProps {
  projects: ProjectMetadata[];
  onOpenProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onPreloadBuilder?: () => void;
}

function VirtualizedOrNormalGrid({
  projects,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  onPreloadBuilder,
}: VirtualizedOrNormalGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Use virtualization for large lists
  const shouldVirtualize = projects.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 5, // Render 5 extra items above/below viewport
    enabled: shouldVirtualize,
  });

  // For small lists, render normally with grid layout
  if (!shouldVirtualize) {
    return (
      <div className="project-gallery-grid" role="tabpanel" id="all-projects-panel">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onOpen={onOpenProject}
            onDuplicate={onDuplicateProject}
            onDelete={onDeleteProject}
            onPreload={onPreloadBuilder}
          />
        ))}
      </div>
    );
  }

  // For large lists, use virtualization
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      role="tabpanel"
      id="all-projects-panel"
      style={{
        height: '600px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        <div className="project-gallery-grid">
          {virtualItems.map((virtualRow) => {
            const project = projects[virtualRow.index];
            return (
              <div
                key={project.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ProjectCard
                  project={project}
                  onOpen={onOpenProject}
                        onDuplicate={onDuplicateProject}
                  onDelete={onDeleteProject}
                  onPreload={onPreloadBuilder}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Grid layout displaying saved projects as cards.
 * Shows projects sorted by most recently updated.
 */
const ProjectGalleryComponent = function ProjectGallery({
  projects,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  isLoading = false,
  onCreateProject,
  onPreloadBuilder,
}: ProjectGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastModified');
  const [activeTab, setActiveTab] = useState<'recent' | 'all'>('recent');

  // Use deferred value for search query to prevent blocking UI during typing
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Detect if the deferred value is stale (user is still typing)
  const isSearchStale = searchQuery !== deferredSearchQuery;

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    // Filter using deferred search query to avoid blocking UI
    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase().trim();
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
  }, [projects, deferredSearchQuery, sortBy]);

  // Get the 3 most recent projects for the Recent tab
  const recentProjects = useMemo(() => {
    const sorted = [...projects].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return sorted.slice(0, 3);
  }, [projects]);

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
            onMouseEnter={onPreloadBuilder}
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

        {/* Show search/sort controls only on "All Projects" tab */}
        {activeTab === 'all' && (
          <div className="project-gallery-controls">
            {/* Search Bar */}
            <div className="project-gallery-search" role="search">
              <div className="project-gallery-search-inner">
                {isSearchStale ? (
                  <Loader2 className="project-gallery-search-icon project-gallery-search-spinner" size={18} aria-hidden="true" />
                ) : (
                  <Search className="project-gallery-search-icon" size={18} aria-hidden="true" />
                )}
                <input
                  type="search"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="project-gallery-search-input"
                  aria-label="Search projects"
                />
                {searchQuery && !isSearchStale && (
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
        )}
      </div>

      {/* Tabs */}
      <ProjectGalleryTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Conditional Content Based on Active Tab */}
      {activeTab === 'recent' ? (
        <RecentProjects
          projects={recentProjects}
          onOpenProject={onOpenProject}
          onDuplicateProject={onDuplicateProject}
          onDeleteProject={onDeleteProject}
          onViewAll={() => setActiveTab('all')}
          totalProjectCount={projects.length}
          onPreloadBuilder={onPreloadBuilder}
        />
      ) : (
        <>
          {filteredAndSortedProjects.length > 0 ? (
            <VirtualizedOrNormalGrid
              projects={filteredAndSortedProjects}
              onOpenProject={onOpenProject}
              onDuplicateProject={onDuplicateProject}
              onDeleteProject={onDeleteProject}
              onPreloadBuilder={onPreloadBuilder}
            />
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
        </>
      )}
    </section>
  );
};

/**
 * Custom comparator for ProjectGallery memoization.
 * Compares projects array by checking each project's id and updatedAt.
 */
function areProjectGalleryPropsEqual(
  prevProps: Readonly<ProjectGalleryProps>,
  nextProps: Readonly<ProjectGalleryProps>
): boolean {
  // Compare primitive props
  if (prevProps.isLoading !== nextProps.isLoading) {
    return false;
  }

  // Compare callbacks (reference equality for stable callbacks)
  if (
    prevProps.onOpenProject !== nextProps.onOpenProject ||
    prevProps.onDuplicateProject !== nextProps.onDuplicateProject ||
    prevProps.onDeleteProject !== nextProps.onDeleteProject ||
    prevProps.onCreateProject !== nextProps.onCreateProject
  ) {
    return false;
  }

  // Compare projects array
  const prevProjects = prevProps.projects;
  const nextProjects = nextProps.projects;

  if (prevProjects.length !== nextProjects.length) {
    return false;
  }

  // Compare each project by id and updatedAt (sufficient for detecting changes)
  for (let i = 0; i < prevProjects.length; i++) {
    const prevProject = prevProjects[i];
    const nextProject = nextProjects[i];

    if (
      prevProject.id !== nextProject.id ||
      prevProject.updatedAt !== nextProject.updatedAt ||
      prevProject.name !== nextProject.name
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Memoized ProjectGallery - avoids re-rendering when projects haven't changed.
 * Useful when the gallery is visible but parent components re-render.
 */
export const ProjectGallery = memo(ProjectGalleryComponent, areProjectGalleryPropsEqual);
