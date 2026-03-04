import { ArrowRight } from 'lucide-react';

import type { ProjectMetadata } from '@/services/storage';

import { ProjectCard } from './ProjectCard';
import './RecentProjects.css';

export interface RecentProjectsProps {
    projects: ProjectMetadata[];
    onOpenProject: (projectId: string) => void;
    onDuplicateProject: (projectId: string) => void;
    onDeleteProject: (projectId: string) => void;
    onViewAll: () => void;
    totalProjectCount: number;
    onPreloadBuilder?: () => void;
}

/**
 * Displays the most recent projects in a horizontal row.
 * Shows up to 3 projects with a "View all" link if more exist.
 */
export function RecentProjects({
    projects,
    onOpenProject,
    onDuplicateProject,
    onDeleteProject,
    onViewAll,
    totalProjectCount,
    onPreloadBuilder,
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
                            onDuplicate={onDuplicateProject}
                            onDelete={onDeleteProject}
                            onPreload={onPreloadBuilder}
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
