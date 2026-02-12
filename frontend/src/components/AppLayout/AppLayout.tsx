import { useEffect, useState, useCallback, useRef, useMemo } from 'react';

import { ChatInterface, PreviewPanel, RepairStatus } from '../../components';
import { PreviewErrorBoundary } from '../PreviewPanel/PreviewErrorBoundary';
import { ExportButton } from '../ExportButton';
import { PanelToggle, type ActivePanel } from '../PanelToggle';
import { UndoRedoButtons } from '../UndoRedoButtons';
import { StatusIndicator } from '../StatusIndicator';
import { KeyboardHint } from '../KeyboardHint';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { initialSuggestions, analyzeProjectForSuggestions } from '@/data/prompt-suggestions';
import { type RuntimeError } from '@/shared';
import type { AggregatedErrors } from '@/services/ErrorAggregator';
import { Sparkles } from 'lucide-react';
import { useProject, useChatMessages, useGeneration, usePreviewError } from '../../context';
import { useSubmitPrompt } from '../../hooks/useSubmitPrompt';

const RESIZE_MIN_WIDTH = 300;
const RESIZE_MAX_FRACTION = 0.6;
const DESKTOP_BREAKPOINT = 1023;
const SIDE_PANEL_WIDTH_STORAGE_KEY = 'ai_app_builder:sidePanelWidth';

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
                <PreviewPanel
                    projectState={projectState}
                    isLoading={isLoading}
                    loadingPhase={loadingPhase}
                    onErrorsReady={handleErrorsReady}
                    errorMonitoringEnabled={!isLoading && projectState !== null}
                    onBundlerIdle={handleBundlerIdle}
                />
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

/**
 * Main application layout component.
 * Two-panel layout: Chat and Preview
 * Responsive design for different screen sizes.
 * 
 * Requirements: 8.1, 9.1
 */
export function AppLayout({ initialPrompt }: { initialPrompt?: string }) {
    const { undo, redo, submitPrompt } = useSubmitPrompt();
    const project = useProject();
    const { isLoading, loadingPhase } = useGeneration();
    const { canUndo, canRedo } = project;

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

    return (
        <div className="app">
            <header className="app-header">
                <div className="app-header-left">
                    <div className="app-logo" aria-hidden="true">
                        <Sparkles size={18} />
                    </div>
                    <h1>AI App Builder</h1>
                    <div className="app-header-divider" />
                    <StatusIndicator phase={loadingPhase} isLoading={isLoading} />
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
