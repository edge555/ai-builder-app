import { forwardRef } from 'react';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

interface PreviewToolbarProps {
    currentMode: DeviceMode;
    isRotated: boolean;
    onModeChange: (mode: DeviceMode) => void;
    onRotate: () => void;
}

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
                    <span className="preview-toolbar-icon" aria-hidden="true">◻︎</span>
                    <span>Desktop</span>
                </button>
                <button
                    className={`preview-toolbar-btn ${currentMode === 'tablet' ? 'active' : ''}`}
                    onClick={() => onModeChange('tablet')}
                    title="Tablet View (768px)"
                    aria-label="Switch to tablet preview"
                >
                    <span className="preview-toolbar-icon" aria-hidden="true">▭</span>
                    <span>Tablet</span>
                </button>
                <button
                    className={`preview-toolbar-btn ${currentMode === 'mobile' ? 'active' : ''}`}
                    onClick={() => onModeChange('mobile')}
                    title="Mobile View (375px)"
                    aria-label="Switch to mobile preview"
                >
                    <span className="preview-toolbar-icon" aria-hidden="true">▯</span>
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
                        <span className="preview-toolbar-icon" aria-hidden="true">↻</span>
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
