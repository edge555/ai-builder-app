import { forwardRef, useRef, useState, useEffect } from 'react';

/** A named device preset with fixed dimensions. */
export interface DevicePreset {
    id: string;
    label: string;
    /** null = fill available width/height (desktop) */
    width: number | null;
    height: number | null;
    category: 'phone' | 'tablet' | 'desktop';
}

export const DEVICE_PRESETS: DevicePreset[] = [
    { id: 'desktop',   label: 'Desktop',   width: null, height: null, category: 'desktop' },
    { id: 'iphone-se', label: 'iPhone SE', width: 375,  height: 667,  category: 'phone'   },
    { id: 'iphone-14', label: 'iPhone 14', width: 393,  height: 852,  category: 'phone'   },
    { id: 'ipad',      label: 'iPad',      width: 768,  height: 1024, category: 'tablet'  },
    { id: 'ipad-pro',  label: 'iPad Pro',  width: 1024, height: 1366, category: 'tablet'  },
    { id: 'custom',    label: 'Custom',    width: null, height: null, category: 'desktop' },
];

export interface PreviewToolbarProps {
    presetId: string;
    customWidth: number;
    customHeight: number;
    isRotated: boolean;
    zoom: number;
    compareMode: boolean;
    onPresetChange: (presetId: string) => void;
    onCustomDimensionChange: (width: number, height: number) => void;
    onRotate: () => void;
    onZoomChange: (zoom: number) => void;
    onCompareModeChange: (compare: boolean) => void;
}

const RotateIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <polyline points="23 20 23 14 17 14"></polyline>
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
    </svg>
);

const CompareIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="5" height="14" rx="1"></rect>
        <rect x="9" y="7" width="6" height="10" rx="1"></rect>
        <rect x="17" y="9" width="5" height="6" rx="1"></rect>
    </svg>
);

const ChevronDown = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, flexShrink: 0 }}>
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const CATEGORY_LABELS: Record<string, string> = {
    phone: 'Phone',
    tablet: 'Tablet',
    desktop: 'Desktop',
};

export const PreviewToolbar = forwardRef<HTMLDivElement, PreviewToolbarProps>(function PreviewToolbar({
    presetId,
    customWidth,
    customHeight,
    isRotated,
    zoom,
    compareMode,
    onPresetChange,
    onCustomDimensionChange,
    onRotate,
    onZoomChange,
    onCompareModeChange,
}, ref) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!dropdownOpen) return;
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [dropdownOpen]);

    const selectedPreset = DEVICE_PRESETS.find(p => p.id === presetId) ?? DEVICE_PRESETS[0];
    const isDevice = presetId !== 'desktop';

    // Effective dimensions accounting for rotation
    const baseWidth = presetId === 'custom' ? customWidth : selectedPreset.width;
    const baseHeight = presetId === 'custom' ? customHeight : selectedPreset.height;
    const displayW = isRotated ? baseHeight : baseWidth;
    const displayH = isRotated ? baseWidth : baseHeight;

    return (
        <div className="preview-toolbar" ref={ref}>
            {/* ── Preset dropdown ── */}
            <div className="preview-toolbar-group">
                <div className="preview-preset-dropdown" ref={dropdownRef}>
                    <button
                        className="preview-preset-trigger"
                        onClick={() => setDropdownOpen(prev => !prev)}
                        aria-haspopup="listbox"
                        aria-expanded={dropdownOpen}
                        title="Select device preset"
                    >
                        <span className="preview-preset-label">{selectedPreset.label}</span>
                        <ChevronDown />
                    </button>

                    {dropdownOpen && (
                        <div className="preview-preset-menu" role="listbox">
                            {(['phone', 'tablet', 'desktop'] as const).map(cat => {
                                const items = DEVICE_PRESETS.filter(p => p.category === cat);
                                return (
                                    <div key={cat} className="preview-preset-group">
                                        <div className="preview-preset-group-label">{CATEGORY_LABELS[cat]}</div>
                                        {items.map(preset => (
                                            <button
                                                key={preset.id}
                                                className={`preview-preset-option ${preset.id === presetId ? 'active' : ''}`}
                                                role="option"
                                                aria-selected={preset.id === presetId}
                                                onClick={() => { onPresetChange(preset.id); setDropdownOpen(false); }}
                                            >
                                                <span>{preset.label}</span>
                                                {preset.width && (
                                                    <span className="preview-preset-dims">{preset.width}×{preset.height}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Custom dimension inputs */}
                {presetId === 'custom' && (
                    <div className="preview-custom-dims">
                        <input
                            type="number"
                            className="preview-dim-input"
                            value={customWidth}
                            min={200}
                            max={2560}
                            onChange={e => onCustomDimensionChange(Number(e.target.value) || customWidth, customHeight)}
                            aria-label="Custom width in pixels"
                            title="Width (px)"
                        />
                        <span className="preview-dim-sep">×</span>
                        <input
                            type="number"
                            className="preview-dim-input"
                            value={customHeight}
                            min={200}
                            max={2560}
                            onChange={e => onCustomDimensionChange(customWidth, Number(e.target.value) || customHeight)}
                            aria-label="Custom height in pixels"
                            title="Height (px)"
                        />
                    </div>
                )}

                {/* Dimensions badge for named device presets */}
                {isDevice && presetId !== 'custom' && displayW && displayH && (
                    <span className="preview-dimensions">{displayW} × {displayH}</span>
                )}
            </div>

            {/* ── Rotate + Zoom (device mode only, not in compare) ── */}
            {isDevice && !compareMode && (
                <div className="preview-toolbar-group">
                    <div className="preview-toolbar-separator" />
                    <button
                        className={`preview-toolbar-btn ${isRotated ? 'active' : ''}`}
                        onClick={onRotate}
                        title="Rotate device"
                        aria-label="Rotate preview device"
                    >
                        <span className="preview-toolbar-icon" aria-hidden="true"><RotateIcon /></span>
                        <span>Rotate</span>
                    </button>
                    <div className="preview-zoom-control">
                        <span className="preview-zoom-label">{zoom}%</span>
                        <input
                            type="range"
                            className="preview-zoom-slider"
                            min={50}
                            max={150}
                            step={10}
                            value={zoom}
                            onChange={e => onZoomChange(Number(e.target.value))}
                            aria-label={`Zoom: ${zoom}%`}
                            title={`Zoom: ${zoom}%`}
                        />
                    </div>
                </div>
            )}

            {/* ── Compare toggle ── */}
            <div className="preview-toolbar-group">
                <div className="preview-toolbar-separator" />
                <button
                    className={`preview-toolbar-btn ${compareMode ? 'active' : ''}`}
                    onClick={() => onCompareModeChange(!compareMode)}
                    title="Compare devices side by side"
                    aria-label="Toggle device comparison view"
                    aria-pressed={compareMode}
                >
                    <span className="preview-toolbar-icon" aria-hidden="true"><CompareIcon /></span>
                    <span>Compare</span>
                </button>
            </div>
        </div>
    );
});
