import React from 'react';
import './CodeEditorSkeleton.css';

/**
 * Skeleton loading component for the code editor.
 * Matches the layout of CodeEditorView with shimmering placeholders.
 */
export function CodeEditorSkeleton() {
    return (
        <div className="code-editor-skeleton">
            {/* Mock File Tree Sidebar */}
            <div className="skeleton-sidebar">
                <div className="skeleton-sidebar-header skeleton-shimmer" />
                <div className="skeleton-file-items">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className="skeleton-file-item skeleton-shimmer"
                            style={{
                                width: `${60 + Math.random() * 30}%`,
                                animationDelay: `${i * 0.1}s`,
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Mock Editor Area */}
            <div className="skeleton-editor-container">
                {/* Mock Tab Bar */}
                <div className="skeleton-tab-bar">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="skeleton-tab skeleton-shimmer"
                            style={{ width: i === 0 ? '120px' : '100px', opacity: i === 0 ? 1 : 0.6 }}
                        />
                    ))}
                </div>

                {/* Mock Code Area */}
                <div className="skeleton-code-content">
                    <div className="skeleton-code-lines">
                        {Array.from({ length: 15 }).map((_, i) => (
                            <div
                                key={i}
                                className="skeleton-code-line skeleton-shimmer"
                                style={{
                                    width: `${30 + Math.random() * 60}%`,
                                    animationDelay: `${i * 0.05}s`,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CodeEditorSkeleton;
