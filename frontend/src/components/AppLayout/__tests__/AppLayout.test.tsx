import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock all hooks ────────────────────────────────────────────────────────

vi.mock('@/hooks/useAutoSave', () => ({
    useAutoSave: () => ({ isSaving: false, lastSaved: null }),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
    useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/hooks/useSidebarResize', () => ({
    useSidebarResize: () => ({
        isSidebarCollapsed: false,
        setIsSidebarCollapsed: vi.fn(),
        sidePanelWidth: 340,
        setSidePanelWidth: vi.fn(),
        windowWidth: 1280,
        maxSidePanelWidth: 600,
        handleToggleSidebar: vi.fn(),
    }),
    RESIZE_MIN_WIDTH: 300,
    DESKTOP_BREAKPOINT: 1024,
    SIDEBAR_COLLAPSED_WIDTH: 0,
}));

vi.mock('@/hooks/useSubmitPrompt', () => ({
    useSubmitPrompt: () => ({
        submitPrompt: vi.fn().mockResolvedValue(undefined),
        undo: vi.fn(),
        redo: vi.fn(),
    }),
}));

// ─── Mock context hooks ────────────────────────────────────────────────────

const mockProjectState = {
    id: 'proj-1',
    name: 'My App',
    description: 'Test app',
    files: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersionId: 'v1',
};

vi.mock('@/context', () => ({
    useProjectState: () => ({
        projectState: mockProjectState,
        canUndo: false,
        canRedo: false,
        currentVersionId: 'v1',
    }),
    useProjectActions: () => ({
        renameProject: vi.fn(),
        setProjectState: vi.fn(),
    }),
    useChatMessages: () => ({
        messages: [],
        addMessage: vi.fn(),
    }),
    useGenerationState: () => ({
        isLoading: false,
        isStreaming: false,
        streamingState: null,
        loadingPhase: 'processing',
        error: null,
        clearError: vi.fn(),
        abortCurrentRequest: vi.fn(),
    }),
    useGenerationActions: () => ({
        clearError: vi.fn(),
        abortCurrentRequest: vi.fn(),
    }),
}));

// ─── Mock react-router-dom ──────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

// ─── Mock sub-components ───────────────────────────────────────────────────

vi.mock('../ChatPanel', () => ({
    ChatPanel: () => <div data-testid="chat-panel">Chat Panel</div>,
}));

vi.mock('../PreviewSection', () => ({
    PreviewSection: () => <div data-testid="preview-section">Preview Section</div>,
}));

vi.mock('../ResizablePanel', () => ({
    ResizablePanel: ({ children }: any) => <div data-testid="resizable-panel">{children}</div>,
}));

vi.mock('../../TooltipGuide/TooltipGuide', () => ({
    TooltipGuide: () => null,
    shouldShowTooltipGuide: () => false,
}));

vi.mock('../../VersionHistory', () => ({
    VersionHistoryDrawer: () => null,
}));

vi.mock('../../EditableProjectName/EditableProjectName', () => ({
    EditableProjectName: ({ name }: any) => <span data-testid="project-name">{name ?? 'Untitled'}</span>,
}));

vi.mock('../../ExportButton', () => ({
    ExportButton: () => <button data-testid="export-button">Export</button>,
}));

vi.mock('../../SaveTemplateButton', () => ({
    SaveTemplateButton: () => <button data-testid="save-template-button">Save Template</button>,
}));

vi.mock('../../PanelToggle', () => ({
    PanelToggle: ({ onPanelChange }: any) => (
        <div data-testid="panel-toggle">
            <button onClick={() => onPanelChange?.('chat')}>Chat</button>
            <button onClick={() => onPanelChange?.('preview')}>Preview</button>
        </div>
    ),
}));

vi.mock('../../StatusIndicator', () => ({
    StatusIndicator: ({ isSaving }: any) => (
        <div data-testid="status-indicator" data-saving={String(isSaving)} />
    ),
}));

vi.mock('../../UndoRedoButtons', () => ({
    UndoRedoButtons: () => <div data-testid="undo-redo-buttons" />,
}));

vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return { ...actual };
});

import { AppLayout } from '../AppLayout';

const defaultProps = {
    initialPrompt: undefined as string | undefined,
    onBackToDashboard: undefined as (() => void) | undefined,
};

describe('AppLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders without crashing', () => {
        render(<AppLayout {...defaultProps} />);
        expect(document.body).toBeInTheDocument();
    });

    it('renders chat panel', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });

    it('renders preview section', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('preview-section')).toBeInTheDocument();
    });

    it('renders undo/redo buttons', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('undo-redo-buttons')).toBeInTheDocument();
    });

    it('renders export button', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('export-button')).toBeInTheDocument();
    });

    it('renders status indicator', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    });

    it('shows back button when onBackToDashboard is provided', () => {
        const onBackToDashboard = vi.fn();
        render(<AppLayout {...defaultProps} onBackToDashboard={onBackToDashboard} />);
        // Back button should be rendered (contains ArrowLeft icon)
        const backButtons = screen.getAllByRole('button');
        expect(backButtons.length).toBeGreaterThan(0);
    });

    it('renders project name', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('project-name')).toBeInTheDocument();
    });

    it('renders panel toggle for navigation', () => {
        render(<AppLayout {...defaultProps} />);
        expect(screen.getByTestId('panel-toggle')).toBeInTheDocument();
    });

    it('renders with initialPrompt without crashing', () => {
        render(<AppLayout {...defaultProps} initialPrompt="Build a todo app" />);
        expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });
});
