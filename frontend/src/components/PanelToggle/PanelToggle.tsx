/**
 * Mobile panel selector for responsive design.
 */
export type ActivePanel = 'chat' | 'preview' | 'code';

interface PanelToggleProps {
    activePanel: ActivePanel;
    onPanelChange: (panel: ActivePanel) => void;
}

export function PanelToggle({ activePanel, onPanelChange }: PanelToggleProps) {
    return (
        <div className="panel-toggle-buttons" role="tablist" aria-label="Panel selector">
            <button
                className={`panel-toggle-btn ${activePanel === 'chat' ? 'active' : ''}`}
                onClick={() => onPanelChange('chat')}
                role="tab"
                aria-selected={activePanel === 'chat'}
                aria-label="Show chat panel"
            >
                Chat
            </button>
            <button
                className={`panel-toggle-btn ${activePanel === 'preview' ? 'active' : ''}`}
                onClick={() => onPanelChange('preview')}
                role="tab"
                aria-selected={activePanel === 'preview'}
                aria-label="Show preview panel"
            >
                Preview
            </button>
            <button
                className={`panel-toggle-btn ${activePanel === 'code' ? 'active' : ''}`}
                onClick={() => onPanelChange('code')}
                role="tab"
                aria-selected={activePanel === 'code'}
                aria-label="Show code editor"
            >
                Code
            </button>
        </div>
    );
}
