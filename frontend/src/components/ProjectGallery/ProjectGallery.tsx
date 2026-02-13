import { ProjectCard } from './ProjectCard';
import type { StoredProject } from '@/services/storage';
import './ProjectGallery.css';

export interface ProjectGalleryProps {
  projects: StoredProject[];
  onOpenProject: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

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
}: ProjectGalleryProps) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="project-gallery">
      <div className="project-gallery-header">
        <h2 className="project-gallery-title">Your Projects</h2>
        <p className="project-gallery-subtitle">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </p>
      </div>

      <div className="project-gallery-grid">
        {projects.map((project) => (
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
    </section>
  );
}
