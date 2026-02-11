import { forwardRef } from 'react';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

interface PreviewToolbarProps {
    currentMode: DeviceMode;
    isRotated: boolean;
    onModeChange: (mode: DeviceMode) => void;
    onRotate: () => void;
}

const DesktopIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
);

const TabletIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
    </svg>
);

const MobileIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
    </svg>
);

const RotateIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <polyline points="23 20 23 14 17 14"></polyline>
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
    </svg>
);

export const PreviewToolbar = forwardRef<HTMLDivElement, PreviewToolbarProps>(function PreviewToolbar({
    currentMode,
    isRotated,
    onModeChange,
    onRotate,
}, ref) {
    return (
        <div className="preview-toolbar" ref={ref}>
            <div className="preview-toolbar-group">
                <button
                    className={`preview-toolbar-btn ${currentMode === 'desktop' ? 'active' : ''}`}
                    onClick={() => onModeChange('desktop')}
                    title="Desktop View (100%)"
                    aria-label="Switch to desktop preview"
                >
                    <span className="preview-toolbar-icon" aria-hidden="true"><DesktopIcon /></span>
                    <span>Desktop</span>
                </button>
                <button
                    className={`preview-toolbar-btn ${currentMode === 'tablet' ? 'active' : ''}`}
                    onClick={() => onModeChange('tablet')}
                    title="Tablet View (768px)"
                    aria-label="Switch to tablet preview"
                >
                    <span className="preview-toolbar-icon" aria-hidden="true"><TabletIcon /></span>
                    <span>Tablet</span>
                </button>
                <button
                    className={`preview-toolbar-btn ${currentMode === 'mobile' ? 'active' : ''}`}
                    onClick={() => onModeChange('mobile')}
                    title="Mobile View (375px)"
                    aria-label="Switch to mobile preview"
                >
                    <span className="preview-toolbar-icon" aria-hidden="true"><MobileIcon /></span>
                    <span>Mobile</span>
                </button>
            </div>

            {currentMode !== 'desktop' && (
                <div className="preview-toolbar-group">
                    <div className="preview-toolbar-separator" />
                    <button
                        className={`preview-toolbar-btn ${isRotated ? 'active' : ''}`}
                        onClick={onRotate}
                        title="Rotate Device"
                        aria-label="Rotate preview device"
                    >
                        <span className="preview-toolbar-icon" aria-hidden="true"><RotateIcon /></span>
                        <span>Rotate</span>
                    </button>
                    <span className="preview-dimensions">
                        {currentMode === 'mobile'
                            ? isRotated ? '667 × 375' : '375 × 667'
                            : isRotated ? '1024 × 768' : '768 × 1024'
                        }
                    </span>
                </div>
            )}
        </div>
    );
});
