import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';

import { ChatInterface, RepairStatus } from '../../components';
import { PreviewSkeleton } from '../PreviewPanel/PreviewSkeleton';
const PreviewPanel = lazy(() => import('../PreviewPanel/PreviewPanel'));
import { PreviewErrorBoundary } from '../PreviewPanel/PreviewErrorBoundary';
import { ExportButton } from '../ExportButton';
import { PanelToggle, type ActivePanel } from '../PanelToggle';
import { UndoRedoButtons } from '../UndoRedoButtons';
import { StatusIndicator } from '../StatusIndicator';
import { KeyboardHint } from '../KeyboardHint';
import { EditableProjectName } from '../EditableProjectName/EditableProjectName';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAutoSave } from '@/hooks/useAutoSave';
import { initialSuggestions, analyzeProjectForSuggestions } from '@/data/prompt-suggestions';
import { type RuntimeError } from '@/shared';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useProject, useChatMessages, useGeneration, usePreviewError } from '../../context';
import { useSubmitPrompt } from '../../hooks/useSubmitPrompt';

const RESIZE_MIN_WIDTH = 300;
const RESIZE_MAX_FRACTION = 0.6;
const DESKTOP_BREAKPOINT = 1023;
const SIDE_PANEL_WIDTH_STORAGE_KEY = 'ai_app_builder:sidePanelWidth';

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

/**
 * Main chat panel component that uses the chat context.
 */
function ChatPanel() {
    const { messages, clearMessages } = useChatMessages();
    const { isLoading, loadingPhase, error, clearError, streamingState, isStreaming } = useGeneration();
    const { projectState } = useProject();
    const { submitPrompt } = useSubmitPrompt();
    const [lastPrompt, setLastPrompt] = useState<string | null>(null);

    // Generate context-aware suggestions
    const suggestions = useMemo(() => {
        if (!projectState) {
            return initialSuggestions;
        }
        return analyzeProjectForSuggestions(projectState.files);
    }, [projectState]);

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
            suggestions={suggestions}
            streamingState={streamingState}
            isStreaming={isStreaming}
        />
    );
}

/**
 * Preview panel component that uses the chat context for project state.
 * Updates automatically when ProjectState changes.
 * Wrapped with PreviewErrorBoundary for auto-repair functionality.
 * 
 * Requirements: 9.2, 9.3
 */
function PreviewSection() {
    const { projectState } = useProject();
    const { isLoading, loadingPhase, autoRepair, isAutoRepairing, autoRepairAttempt, resetAutoRepair } = useGeneration();
    const {
        reportError,
        reportAggregatedErrors,
        repairPhase,
        setRepairPhase,
        startAutoRepair,
        completeAutoRepair,
        clearAllErrors,
        dismissRepairStatus,
        shouldAutoRepair,
        aggregatedErrors,
        maxRepairAttempts,
        repairAttempts,
    } = usePreviewError();

    // Reset auto-repair attempts when project state changes successfully
    useEffect(() => {
        if (repairPhase === 'idle' || repairPhase === 'success') {
            resetAutoRepair();
        }
    }, [projectState?.currentVersionId, repairPhase, resetAutoRepair]);

    const handlePreviewError = useCallback((runtimeError: RuntimeError) => {
        console.error('[PreviewSection] Error captured:', runtimeError.type, runtimeError.message.slice(0, 100));
        reportError(runtimeError);
    }, [reportError]);

    const handleErrorsReady = useCallback((errors: AggregatedErrors) => {
        console.log('[PreviewSection] Errors ready for repair:', errors.totalCount);
        reportAggregatedErrors(errors);
    }, [reportAggregatedErrors]);

    const handleAutoRepair = useCallback(async (runtimeError: RuntimeError) => {
        if (!shouldAutoRepair()) {
            return;
        }

        startAutoRepair();

        try {
            const success = await autoRepair(runtimeError, projectState);
            completeAutoRepair(success);
        } catch (err) {
            console.error('[PreviewSection] Auto-repair failed:', err);
            completeAutoRepair(false);
        }
    }, [autoRepair, shouldAutoRepair, startAutoRepair, completeAutoRepair]);

    const handleBundlerIdle = useCallback(() => {
        // Bundler recovered, clear errors
        if (repairPhase !== 'repairing') {
            clearAllErrors();
            setRepairPhase('idle');
        }
    }, [clearAllErrors, setRepairPhase, repairPhase]);

    // Auto-trigger repair when errors are ready and repair phase is 'repairing'
    useEffect(() => {
        if (repairPhase === 'repairing' && aggregatedErrors && aggregatedErrors.totalCount > 0 && !isAutoRepairing) {
            const firstError = aggregatedErrors.errors[0];
            if (firstError) {
                handleAutoRepair(firstError);
            }
        }
    }, [repairPhase, aggregatedErrors, isAutoRepairing, handleAutoRepair]);

    // Determine if auto-repair button should be available
    const canAutoRepair = projectState !== null && autoRepairAttempt < maxRepairAttempts;

    // Get current file being repaired for display
    const currentFile = aggregatedErrors?.affectedFiles[0];

    return (
        <>
            <PreviewErrorBoundary
                onError={handlePreviewError}
                onAutoRepair={handleAutoRepair}
                canAutoRepair={canAutoRepair}
                isAutoRepairing={isAutoRepairing}
            >
                <Suspense fallback={loadingPhase !== 'idle' ? <PreviewSkeleton phase={loadingPhase} /> : null}>
                    <PreviewPanel
                        projectState={projectState}
                        isLoading={isLoading}
                        loadingPhase={loadingPhase}
                        onErrorsReady={handleErrorsReady}
                        errorMonitoringEnabled={!isLoading && projectState !== null}
                        onBundlerIdle={handleBundlerIdle}
                    />
                </Suspense>
            </PreviewErrorBoundary>

            {/* Repair status toast */}
            <RepairStatus
                phase={repairPhase}
                attempt={repairAttempts}
                maxAttempts={maxRepairAttempts}
                errorCount={aggregatedErrors?.totalCount || 1}
                currentFile={currentFile}
                onDismiss={dismissRepairStatus}
            />
        </>
    );
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
    const { isLoading, loadingPhase } = useGeneration();
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
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [initialPrompt, submitPrompt]);
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

    // Register keyboard shortcuts for undo/redo
    useKeyboardShortcuts({
        onUndo: undo,
        onRedo: redo,
    });

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
                    <div className="app-logo" aria-hidden="true">
                        <Sparkles size={18} />
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
                            <div className="app-header-shortcuts">
                                <KeyboardHint keys={['⌘', 'Z']} />
                            </div>
                        </div>
                        <ExportButton />
                    </div>
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
