import { Sparkles, ArrowLeft, PanelLeftClose, PanelLeft, Settings, History } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAutoSave } from '@/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import {
    useSidebarResize,
    RESIZE_MIN_WIDTH,
    DESKTOP_BREAKPOINT,
    SIDEBAR_COLLAPSED_WIDTH,
} from '@/hooks/useSidebarResize';

import { useProjectState, useProjectActions, useChatMessages, useGenerationState } from '../../context';
import { TooltipGuide, shouldShowTooltipGuide } from '../TooltipGuide/TooltipGuide';
import type { TooltipItem } from '../TooltipGuide/TooltipGuide';
import { VersionHistoryDrawer } from '../VersionHistory';
import { useSubmitPrompt } from '../../hooks/useSubmitPrompt';
import { EditableProjectName } from '../EditableProjectName/EditableProjectName';
import { ExportButton } from '../ExportButton';
import { SaveTemplateButton } from '../SaveTemplateButton';
import { PanelToggle, type ActivePanel } from '../PanelToggle';
import { StatusIndicator } from '../StatusIndicator';
import { UndoRedoButtons } from '../UndoRedoButtons';

import { ChatPanel } from './ChatPanel';
import { PreviewSection } from './PreviewSection';
import { ResizablePanel } from './ResizablePanel';

const builderTooltips: TooltipItem[] = [
    { targetSelector: '.chat-panel', message: 'Describe what you want to build or change. The AI will generate or update your app.', placement: 'right' },
    { targetSelector: '.preview-section', message: 'Your app preview updates live as the AI generates code.', placement: 'left' },
    { targetSelector: '.app-header-action-group', message: 'Undo or redo changes with these buttons, or use Ctrl+Z / Ctrl+Y.', placement: 'bottom' },
];





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
    /** Disable IndexedDB/cloud auto-save (workspace member mode uses its own save path) */
    disableAutoSave?: boolean;
}

/**
 * Main application layout component.
 * Two-panel layout: Chat and Preview
 * Responsive design for different screen sizes.
 *
 * Requirements: 8.1, 9.1
 */
export function AppLayout({ initialPrompt, onBackToDashboard, disableAutoSave }: AppLayoutProps) {
    const navigate = useNavigate();
    const { undo, redo, submitPrompt } = useSubmitPrompt();
    const { projectState, canUndo, canRedo } = useProjectState();
    const { renameProject, setProjectState } = useProjectActions();
    const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
    const { messages } = useChatMessages();
    const { isLoading, loadingPhase } = useGenerationState();

    // Auto-save project state and messages (suppressed in workspace member mode)
    const { isSaving, lastSavedAt } = useAutoSave(disableAutoSave ? null : projectState, messages);

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
    const {
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        sidePanelWidth,
        setSidePanelWidth,
        windowWidth,
        maxSidePanelWidth,
        handleToggleSidebar,
    } = useSidebarResize();

    const prevIsLoadingRef = useRef(false);

    // Mobile: auto-switch to preview when generation finishes and files exist
    useEffect(() => {
        const wasLoading = prevIsLoadingRef.current;
        prevIsLoadingRef.current = isLoading;
        if (wasLoading && !isLoading && projectState && windowWidth <= DESKTOP_BREAKPOINT) {
            setActivePanel('preview');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading]);

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
        onToggleSidebar: handleToggleSidebar,
    });

    const [showTooltips] = useState(() => shouldShowTooltipGuide());

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
                        onClick={handleToggleSidebar}
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
                        <SaveTemplateButton />
                        <button
                            className="settings-button"
                            onClick={() => setIsVersionDrawerOpen(true)}
                            disabled={!projectState}
                            aria-label="Version history"
                            title="Version history"
                        >
                            <History size={18} />
                        </button>
                        <button
                            className="settings-button"
                            onClick={() => navigate('/settings/agents')}
                            aria-label="Agent Settings"
                            title="Agent Settings"
                        >
                            <Settings size={18} />
                        </button>
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
                                onClick={handleToggleSidebar}
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

            {showTooltips && <TooltipGuide tooltips={builderTooltips} />}

            <VersionHistoryDrawer
                isOpen={isVersionDrawerOpen}
                onClose={() => setIsVersionDrawerOpen(false)}
                projectId={projectState?.id ?? ''}
                onRevert={(newState) => {
                    setProjectState(newState, true);
                    setIsVersionDrawerOpen(false);
                }}
            />

        </div>
    );
}
