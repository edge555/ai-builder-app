import { Sparkles, ArrowLeft, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';

import { useAutoSave } from '@/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

import { useProject, useChatMessages, useGenerationState } from '../../context';
import { useSubmitPrompt } from '../../hooks/useSubmitPrompt';
import { EditableProjectName } from '../EditableProjectName/EditableProjectName';
import { ExportButton } from '../ExportButton';
import { PanelToggle, type ActivePanel } from '../PanelToggle';
import { StatusIndicator } from '../StatusIndicator';
import { UndoRedoButtons } from '../UndoRedoButtons';

import { ChatPanel } from './ChatPanel';
import { PreviewSection } from './PreviewSection';
import { ResizablePanel } from './ResizablePanel';




const RESIZE_MIN_WIDTH = 300;
const RESIZE_MAX_FRACTION = 0.6;
const DESKTOP_BREAKPOINT = 1023;
const SIDE_PANEL_WIDTH_STORAGE_KEY = 'ai_app_builder:sidePanelWidth';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ai_app_builder:sidebarCollapsed';
const SIDEBAR_COLLAPSED_WIDTH = 48;
const SIDEBAR_DEFAULT_WIDTH = 340;

/**
 * Formats a timestamp for the save indicator.
 * Shows relative time (e.g., "just now", "2 min ago") for recent saves.
 */
function formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    return date.toLocaleDateString();
}


export interface AppLayoutProps {
    /** Optional initial prompt to submit on mount */
    initialPrompt?: string;
    /** Optional callback when user wants to return to dashboard */
    onBackToDashboard?: () => void;
}

/**
 * Main application layout component.
 * Two-panel layout: Chat and Preview
 * Responsive design for different screen sizes.
 *
 * Requirements: 8.1, 9.1
 */
export function AppLayout({ initialPrompt, onBackToDashboard }: AppLayoutProps) {
    const { undo, redo, submitPrompt } = useSubmitPrompt();
    const project = useProject();
    const { messages } = useChatMessages();
    const { isLoading, loadingPhase } = useGenerationState();
    const { projectState, canUndo, canRedo, renameProject } = project;

    // Auto-save project state and messages
    const { isSaving, lastSavedAt } = useAutoSave(projectState, messages);

    const initialPromptSubmittedRef = useRef(false);

    // Submit initial prompt on mount if provided
    useEffect(() => {
        if (initialPrompt && !initialPromptSubmittedRef.current) {
            initialPromptSubmittedRef.current = true;
            // Short delay to ensure everything is ready
            const timer = setTimeout(() => {
                submitPrompt(initialPrompt);
            }, 150);
            return () => {
                clearTimeout(timer);
                // Reset ref on cleanup so React Strict Mode re-mount can fire again
                initialPromptSubmittedRef.current = false;
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPrompt]);
    const [activePanel, setActivePanel] = useState<ActivePanel>('chat');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const raw = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
        // Default to collapsed on tablet/mobile, expanded on desktop
        if (raw === null) {
            return window.innerWidth <= DESKTOP_BREAKPOINT;
        }
        return raw === 'true';
    });
    const [sidePanelWidth, setSidePanelWidth] = useState(() => {
        const raw = localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : SIDEBAR_DEFAULT_WIDTH;
    });
    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

    const maxSidePanelWidth = Math.max(
        RESIZE_MIN_WIDTH,
        Math.floor(windowWidth * RESIZE_MAX_FRACTION)
    );

    useEffect(() => {
        const onResize = () => {
            setWindowWidth(window.innerWidth);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Persist split width locally (no cloud)
    useEffect(() => {
        localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(sidePanelWidth));
    }, [sidePanelWidth]);

    // Persist sidebar collapsed state
    useEffect(() => {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    // If the viewport shrinks, clamp the stored width to avoid layout issues.
    useEffect(() => {
        setSidePanelWidth((w) => Math.max(RESIZE_MIN_WIDTH, Math.min(w, maxSidePanelWidth)));
    }, [maxSidePanelWidth]);

    // Toggle sidebar collapse
    const toggleSidebar = useCallback(() => {
        setIsSidebarCollapsed((prev) => !prev);
    }, []);

    // Close sidebar when clicking backdrop on tablet
    const handleBackdropClick = useCallback(() => {
        if (windowWidth <= DESKTOP_BREAKPOINT && !isSidebarCollapsed) {
            setIsSidebarCollapsed(true);
        }
    }, [windowWidth, isSidebarCollapsed]);

    // Register keyboard shortcuts for undo/redo and sidebar toggle
    useKeyboardShortcuts({
        onUndo: undo,
        onRedo: redo,
        onToggleSidebar: toggleSidebar,
    });

    // Format save indicator text
    const saveIndicatorText = isSaving
        ? 'Saving...'
        : lastSavedAt
            ? `Saved ${formatTimestamp(lastSavedAt)}`
            : '';

    return (
        <div className="app">
            <header className="app-header">
                <div className="app-header-left">
                    <button
                        className="sidebar-toggle-button"
                        onClick={toggleSidebar}
                        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
                    >
                        {isSidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                    </button>
                    {onBackToDashboard && (
                        <button
                            className="back-button"
                            onClick={onBackToDashboard}
                            aria-label="Back to dashboard"
                            title="Back to dashboard"
                        >
                            <ArrowLeft size={18} />
                        </button>
                    )}
                    <div className="app-logo" aria-label="App Logo">
                        <Sparkles size={18} aria-hidden="true" />
                    </div>
                    {projectState ? (
                        <EditableProjectName
                            name={projectState.name}
                            onRename={renameProject}
                            disabled={isLoading}
                        />
                    ) : (
                        <h1>AI App Builder</h1>
                    )}
                    <div className="app-header-divider" />
                    <StatusIndicator phase={loadingPhase} isLoading={isLoading} />
                    {saveIndicatorText && (
                        <span className="save-indicator" aria-live="polite">
                            {saveIndicatorText}
                        </span>
                    )}
                </div>
                <div className="app-header-right">
                    <div className="app-header-actions">
                        <div className="app-header-action-group">
                            <UndoRedoButtons
                                canUndo={canUndo}
                                canRedo={canRedo}
                                onUndo={undo}
                                onRedo={redo}
                                disabled={isLoading}
                            />
                        </div>
                        <ExportButton />
                    </div>
                </div>
            </header>

            <PanelToggle activePanel={activePanel} onPanelChange={setActivePanel} />

            <main className="app-main">
                {/* Backdrop for tablet overlay */}
                {windowWidth <= DESKTOP_BREAKPOINT && !isSidebarCollapsed && (
                    <div className="sidebar-backdrop" onClick={handleBackdropClick} />
                )}

                <ResizablePanel
                    width={sidePanelWidth}
                    onWidthChange={setSidePanelWidth}
                    minWidth={RESIZE_MIN_WIDTH}
                    maxWidth={maxSidePanelWidth}
                    className={`chat-panel ${activePanel === 'chat' ? 'active' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}
                    style={{
                        flexBasis: windowWidth > DESKTOP_BREAKPOINT
                            ? `${isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidePanelWidth}px`
                            : undefined,
                        width: windowWidth > DESKTOP_BREAKPOINT
                            ? `${isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidePanelWidth}px`
                            : undefined
                    }}
                >
                    {!isSidebarCollapsed && <ChatPanel onFileClick={() => {
                        setActivePanel('preview');
                    }} />}
                    {isSidebarCollapsed && windowWidth > DESKTOP_BREAKPOINT && (
                        <div className="sidebar-collapsed-rail">
                            <button
                                className="sidebar-rail-toggle"
                                onClick={toggleSidebar}
                                aria-label="Expand sidebar"
                                title="Expand sidebar (Ctrl+B)"
                            >
                                <PanelLeft size={20} />
                            </button>
                        </div>
                    )}
                </ResizablePanel>

                <section className={`preview-section ${activePanel === 'preview' || activePanel === 'code' ? 'active' : ''}`} data-view={activePanel === 'code' ? 'code' : 'preview'}>
                    <PreviewSection activePanel={activePanel} />
                </section>
            </main>
        </div>
    );
}
