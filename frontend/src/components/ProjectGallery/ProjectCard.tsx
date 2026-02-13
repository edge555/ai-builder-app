import { Pencil, Copy, Trash2, File } from 'lucide-react';
import type { StoredProject } from '@/services/storage';

export interface ProjectCardProps {
  project: StoredProject;
  onOpen: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDuplicate: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

/**
 * Formats a timestamp as relative time (e.g., "2 hours ago").
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? 's' : ''} ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

/**
 * Individual project card in the gallery.
 * Displays project metadata and provides quick actions.
 */
export function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger open if clicking on action buttons
    if ((e.target as HTMLElement).closest('.project-card-action')) {
      return;
    }
    onOpen(project.id);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRename(project.id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicate(project.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(project.id);
  };

  return (
    <article
      className="project-card"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(project.id);
        }
      }}
      aria-label={`Open project: ${project.name}`}
    >
      <div className="project-card-header">
        <h3 className="project-card-title">{project.name}</h3>
        <div className="project-card-actions">
          <button
            className="project-card-action"
            onClick={handleRename}
            aria-label="Rename project"
            title="Rename"
          >
            <Pencil size={14} />
          </button>
          <button
            className="project-card-action"
            onClick={handleDuplicate}
            aria-label="Duplicate project"
            title="Duplicate"
          >
            <Copy size={14} />
          </button>
          <button
            className="project-card-action project-card-action--danger"
            onClick={handleDelete}
            aria-label="Delete project"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="project-card-meta">
        <span className="project-card-meta-item">
          {project.fileCount} {project.fileCount === 1 ? 'file' : 'files'}
        </span>
        <span className="project-card-meta-divider">•</span>
        <span className="project-card-meta-item">
          {formatRelativeTime(project.updatedAt)}
        </span>
      </div>

      {project.thumbnailFiles.length > 0 && (
        <div className="project-card-files">
          {project.thumbnailFiles.slice(0, 3).map((filename, index) => (
            <div key={index} className="project-card-file">
              <File size={12} />
              <span className="project-card-file-name">{filename}</span>
            </div>
          ))}
          {project.fileCount > 3 && (
            <div className="project-card-file-more">
              +{project.fileCount - 3} more
            </div>
          )}
        </div>
      )}
    </article>
  );
}
