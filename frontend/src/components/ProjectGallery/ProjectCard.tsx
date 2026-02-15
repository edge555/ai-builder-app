import { Copy, Trash2, File, Clock } from 'lucide-react';
import type { ProjectMetadata } from '@/services/storage';
import { EditableProjectName } from '../EditableProjectName/EditableProjectName';

export interface ProjectCardProps {
  project: ProjectMetadata;
  onOpen: (projectId: string) => void;
  onRename: (projectId: string, newName: string) => void;
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
 * Generates a consistent accent color based on the project ID.
 */
function getProjectAccentColor(id: string): string {
  const colors = [
    '#7c3aed', // Violet 600 (Primary)
    '#0ea5e9', // Sky 500
    '#10b981', // Emerald 500
    '#f59e0b', // Amber 500
    '#ef4444', // Red 500
    '#ec4899', // Pink 500
    '#8b5cf6', // Violet 500
    '#06b6d4', // Cyan 500
  ];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index];
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
    // Don't trigger open if clicking on action buttons or editable name
    if (
      (e.target as HTMLElement).closest('.project-card-action') ||
      (e.target as HTMLElement).closest('.editable-project-name') ||
      (e.target as HTMLElement).closest('input')
    ) {
      return;
    }
    onOpen(project.id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicate(project.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(project.id);
  };

  const accentColor = getProjectAccentColor(project.id);

  return (
    <article
      className="project-card"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // Only trigger if directly on the card, not children
          if (e.target === e.currentTarget) {
            e.preventDefault();
            onOpen(project.id);
          }
        }
      }}
      aria-label={`Open project: ${project.name}`}
      style={{ '--accent-color': accentColor } as React.CSSProperties}
    >
      <div className="project-card-accent-strip" />

      <div className="project-card-header">
        <div className="project-card-title-wrapper">
          <EditableProjectName
            name={project.name}
            onRename={(newName) => onRename(project.id, newName)}
            className="project-card-title-input"
          />
        </div>
        <div className="project-card-actions">
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
        <div className="project-card-files">
          {project.thumbnailFiles.slice(0, 3).map((filename, index) => (
            <div key={index} className="project-card-file-pill">
              <span className="project-card-file-name">{filename}</span>
            </div>
          ))}
          {project.fileCount > 3 && (
            <div className="project-card-file-more">
              +{project.fileCount - 3}
            </div>
          )}
        </div>

        <div className="project-card-meta-row">
          <Clock size={12} />
          <span>{formatRelativeTime(project.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}
