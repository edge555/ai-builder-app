import './ProjectGallery.css';

/**
 * Skeleton loading state for project cards.
 * Displays a placeholder with shimmer animation while projects load.
 */
export function ProjectCardSkeleton() {
    return (
        <div className="project-card project-card-skeleton">
            {/* Accent Strip */}
            <div className="project-card-accent-strip skeleton-shimmer" />

            {/* Card Header */}
            <div className="project-card-header">
                <div className="project-card-title-wrapper">
                    <div className="skeleton-title skeleton-shimmer" />
                </div>
            </div>

            {/* Card Meta */}
            <div className="project-card-meta">
                {/* File Pills */}
                <div className="project-card-files">
                    <div className="skeleton-file-pill skeleton-shimmer" />
                    <div className="skeleton-file-pill skeleton-shimmer" />
                    <div className="skeleton-file-pill skeleton-shimmer" />
                </div>

                {/* Meta Row */}
                <div className="project-card-meta-row">
                    <div className="skeleton-meta skeleton-shimmer" />
                </div>
            </div>
        </div>
    );
}
