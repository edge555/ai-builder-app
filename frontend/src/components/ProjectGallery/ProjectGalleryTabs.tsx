import './ProjectGalleryTabs.css';

export interface ProjectGalleryTabsProps {
    activeTab: 'recent' | 'all';
    onTabChange: (tab: 'recent' | 'all') => void;
}

/**
 * Tab switcher for ProjectGallery.
 * Allows switching between "Recent" and "All Projects" views.
 */
export function ProjectGalleryTabs({ activeTab, onTabChange }: ProjectGalleryTabsProps) {
    return (
        <div className="project-gallery-tabs" role="tablist">
            <button
                role="tab"
                aria-selected={activeTab === 'recent'}
                aria-controls="recent-projects-panel"
                className={`project-gallery-tab ${activeTab === 'recent' ? 'project-gallery-tab--active' : ''}`}
                onClick={() => onTabChange('recent')}
            >
                Recent
            </button>
            <button
                role="tab"
                aria-selected={activeTab === 'all'}
                aria-controls="all-projects-panel"
                className={`project-gallery-tab ${activeTab === 'all' ? 'project-gallery-tab--active' : ''}`}
                onClick={() => onTabChange('all')}
            >
                All Projects
            </button>
            <div
                className="project-gallery-tab-indicator"
                data-active-tab={activeTab}
            />
        </div>
    );
}
