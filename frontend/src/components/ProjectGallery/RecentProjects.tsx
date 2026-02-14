import { ArrowRight } from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import type { StoredProject } from '@/services/storage';
import './RecentProjects.css';

export interface RecentProjectsProps {
    projects: StoredProject[];
    onOpenProject: (projectId: string) => void;
    onRenameProject: (projectId: string, newName: string) => void;
    onDuplicateProject: (projectId: string) => void;
    onDeleteProject: (projectId: string) => void;
    onViewAll: () => void;
    totalProjectCount: number;
}

/**
 * Displays the most recent projects in a horizontal row.
 * Shows up to 3 projects with a "View all" link if more exist.
 */
export function RecentProjects({
    projects,
    onOpenProject,
    onRenameProject,
    onDuplicateProject,
    onDeleteProject,
    onViewAll,
    totalProjectCount,
}: RecentProjectsProps) {
    const hasMoreProjects = totalProjectCount > 3;

    return (
        <div className="recent-projects" role="tabpanel" id="recent-projects-panel">
            <div className="recent-projects-row">
                {projects.map((project) => (
                    <div key={project.id} className="recent-projects-card-wrapper">
                        <ProjectCard
                            project={project}
                            onOpen={onOpenProject}
                            onRename={onRenameProject}
                            onDuplicate={onDuplicateProject}
                            onDelete={onDeleteProject}
                        />
                    </div>
                ))}
            </div>

            {hasMoreProjects && (
                <button
                    className="recent-projects-view-all"
                    onClick={onViewAll}
                    aria-label="View all projects"
                >
                    View all projects
                    <ArrowRight size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
