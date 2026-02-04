import { useEffect, useState, useCallback, useRef } from 'react';
import { useChat } from '../../context';
import { ChatInterface, PreviewPanel, ErrorBoundary } from '../../components';
import { ExportButton } from '../ExportButton';
import { PanelToggle, type ActivePanel } from '../PanelToggle';

const RESIZE_MIN_WIDTH = 300;
const RESIZE_MAX_FRACTION = 0.6;
const DESKTOP_BREAKPOINT = 1023;
const SIDE_PANEL_WIDTH_STORAGE_KEY = 'ai_app_builder:sidePanelWidth';

/**
 * Main chat panel component that uses the chat context.
 */
function ChatPanel() {
    const { messages, isLoading, loadingPhase, submitPrompt, error, clearError } = useChat();
    const [lastPrompt, setLastPrompt] = useState<string | null>(null);

    const handleSubmit = async (prompt: string) => {
        setLastPrompt(prompt);
        await submitPrompt(prompt);
    };

    const handleRetry = () => {
        if (lastPrompt) {
            clearError();
            submitPrompt(lastPrompt);
        }
    };

    return (
        <ChatInterface
            messages={messages}
            isLoading={isLoading}
            loadingPhase={loadingPhase}
            onSubmitPrompt={handleSubmit}
            error={error}
            onClearError={clearError}
            onRetry={handleRetry}
        />
    );
}

/**
 * Preview panel component that uses the chat context for project state.
 * Updates automatically when ProjectState changes.
 * Wrapped with ErrorBoundary for graceful error handling.
 * 
 * Requirements: 9.2, 9.3
 */
function PreviewSection() {
    const { projectState } = useChat();

    const handlePreviewError = (error: Error) => {
        console.error('Preview error:', error);
    };

    return (
        <ErrorBoundary
            errorMessage="The preview encountered an error. Try refreshing or modifying your code."
            showRetry={true}
        >
            <PreviewPanel
                projectState={projectState}
                onError={handlePreviewError}
            />
        </ErrorBoundary>
    );
}

/**
 * Main application layout component.
 * Two-panel layout: Chat and Preview
 * Responsive design for different screen sizes.
 * 
 * Requirements: 8.1, 9.1
 */
export function AppLayout() {
    const [activePanel, setActivePanel] = useState<ActivePanel>('chat');
    const [sidePanelWidth, setSidePanelWidth] = useState(() => {
        const raw = localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : 380;
    });
    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
    const isResizing = useRef(false);

    const maxSidePanelWidth = Math.max(
        RESIZE_MIN_WIDTH,
        Math.floor(windowWidth * RESIZE_MAX_FRACTION)
    );

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Persist split width locally (no cloud)
    useEffect(() => {
        localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(sidePanelWidth));
    }, [sidePanelWidth]);

    // If the viewport shrinks, clamp the stored width to avoid layout issues.
    useEffect(() => {
        setSidePanelWidth((w) => Math.max(RESIZE_MIN_WIDTH, Math.min(w, maxSidePanelWidth)));
    }, [maxSidePanelWidth]);

    const startResizing = useCallback(() => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;

        // Constraints: min 300px, max 600px or some reasonable fraction of window width
        const newWidth = Math.max(
            RESIZE_MIN_WIDTH,
            Math.min(e.clientX, windowWidth * RESIZE_MAX_FRACTION)
        );
        setSidePanelWidth(newWidth);
    }, [windowWidth]);

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <div className="app">
            <header className="app-header">
                <div className="app-header-left">
                    <h1>AI App Builder</h1>
                </div>
                <div className="app-header-right">
                    <ExportButton />
                </div>
            </header>

            <PanelToggle activePanel={activePanel} onPanelChange={setActivePanel} />

            <main className="app-main">
                <section
                    className={`chat-panel ${activePanel === 'chat' ? 'active' : ''}`}
                    style={{
                        flexBasis: windowWidth > DESKTOP_BREAKPOINT ? `${sidePanelWidth}px` : undefined,
                        width: windowWidth > DESKTOP_BREAKPOINT ? `${sidePanelWidth}px` : undefined
                    }}
                >
                    <ChatPanel />
                </section>

                <div
                    className="resizer"
                    onMouseDown={startResizing}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panels"
                    tabIndex={0}
                    aria-valuemin={RESIZE_MIN_WIDTH}
                    aria-valuemax={maxSidePanelWidth}
                    aria-valuenow={sidePanelWidth}
                    onKeyDown={(e) => {
                        const step = e.shiftKey ? 72 : 24;

                        if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            setSidePanelWidth((w) => Math.max(RESIZE_MIN_WIDTH, w - step));
                            return;
                        }

                        if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            setSidePanelWidth((w) => Math.min(maxSidePanelWidth, w + step));
                            return;
                        }

                        if (e.key === 'Home') {
                            e.preventDefault();
                            setSidePanelWidth(RESIZE_MIN_WIDTH);
                            return;
                        }

                        if (e.key === 'End') {
                            e.preventDefault();
                            setSidePanelWidth(maxSidePanelWidth);
                            return;
                        }
                    }}
                />

                <section className={`preview-section ${activePanel === 'preview' ? 'active' : ''}`}>
                    <PreviewSection />
                </section>
            </main>
        </div>
    );
}
