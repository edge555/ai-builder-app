import { forwardRef } from 'react';
import './PreviewSkeleton.css';

interface PreviewSkeletonProps {
  phase?: 'planning' | 'generating' | 'modifying' | 'validating' | 'processing';
}

/**
 * Skeleton loading component for the preview panel.
 * Shows animated placeholders while content is being generated.
 */
export const PreviewSkeleton = forwardRef<HTMLDivElement, PreviewSkeletonProps>(
  function PreviewSkeleton({ phase = 'generating' }, ref) {
    const phaseMessages = {
      planning: 'Planning your application...',
      generating: 'Generating your application...',
      modifying: 'Applying changes...',
      validating: 'Validating code...',
      processing: 'Processing...',
    };

    return (
      <div className="preview-skeleton" ref={ref}>
        <div className="skeleton-header">
          <div className="skeleton-status">
            <div className="skeleton-spinner" />
            <span className="skeleton-phase-text">{phaseMessages[phase]}</span>
          </div>
        </div>

        <div className="skeleton-content">
          {/* Code editor skeleton */}
          <div className="skeleton-editor">
            <div className="skeleton-file-tree">
              <div className="skeleton-file-item skeleton-shimmer" style={{ width: '70%' }} />
              <div className="skeleton-file-item skeleton-shimmer" style={{ width: '85%', animationDelay: '0.1s' }} />
              <div className="skeleton-file-item skeleton-shimmer" style={{ width: '60%', animationDelay: '0.2s' }} />
              <div className="skeleton-file-item skeleton-shimmer" style={{ width: '90%', animationDelay: '0.3s' }} />
              <div className="skeleton-file-item skeleton-shimmer" style={{ width: '55%', animationDelay: '0.4s' }} />
            </div>
            
            <div className="skeleton-code-area">
              <div className="skeleton-code-lines">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton-code-line skeleton-shimmer"
                    style={{
                      width: `${40 + Math.random() * 50}%`,
                      animationDelay: `${i * 0.08}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Preview window skeleton */}
          <div className="skeleton-preview">
            <div className="skeleton-browser-bar">
              <div className="skeleton-browser-dots">
                <span /><span /><span />
              </div>
              <div className="skeleton-url-bar skeleton-shimmer" />
            </div>
            
            <div className="skeleton-preview-content">
              {/* Navbar skeleton */}
              <div className="skeleton-navbar">
                <div className="skeleton-logo skeleton-shimmer" />
                <div className="skeleton-nav-items">
                  <div className="skeleton-nav-item skeleton-shimmer" />
                  <div className="skeleton-nav-item skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
                  <div className="skeleton-nav-item skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>

              {/* Hero skeleton */}
              <div className="skeleton-hero">
                <div className="skeleton-hero-title skeleton-shimmer" />
                <div className="skeleton-hero-subtitle skeleton-shimmer" style={{ animationDelay: '0.15s' }} />
                <div className="skeleton-hero-button skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
              </div>

              {/* Cards skeleton */}
              <div className="skeleton-cards">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-card" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
                    <div className="skeleton-card-image skeleton-shimmer" />
                    <div className="skeleton-card-content">
                      <div className="skeleton-card-title skeleton-shimmer" />
                      <div className="skeleton-card-text skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
                      <div className="skeleton-card-text skeleton-shimmer" style={{ width: '70%', animationDelay: '0.2s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export default PreviewSkeleton;
