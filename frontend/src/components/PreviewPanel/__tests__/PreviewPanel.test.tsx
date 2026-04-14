import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @webcontainer/api
vi.mock('@webcontainer/api', () => ({
    WebContainer: {
        boot: vi.fn().mockResolvedValue({
            mount: vi.fn().mockResolvedValue(undefined),
            spawn: vi.fn().mockResolvedValue({
                output: { pipeTo: vi.fn() },
                exit: Promise.resolve(0),
                kill: vi.fn(),
            }),
            on: vi.fn(),
            fs: {
                writeFile: vi.fn().mockResolvedValue(undefined),
                mkdir: vi.fn().mockResolvedValue(undefined),
            },
        }),
    },
}));

// Mock useWebContainer hook
vi.mock('@/hooks/useWebContainer', () => ({
    useWebContainer: vi.fn(() => ({
        phase: 'idle',
        previewUrl: null,
        bootError: null,
        installOutput: '',
        serverOutput: '',
        terminalLines: [],
        refresh: vi.fn(),
        updateFiles: vi.fn(),
    })),
}));

vi.mock('lucide-react', () => ({
    RefreshCw: () => <div data-testid="icon-refresh" />,
    Code: () => <div data-testid="icon-code" />,
    Code2: () => <div data-testid="icon-code2" />,
    Monitor: () => <div data-testid="icon-monitor" />,
    MonitorPlay: () => <div data-testid="icon-monitor-play" />,
    Sparkles: () => <div data-testid="icon-sparkles" />,
    History: () => <div data-testid="icon-history" />,
    ChevronLeft: () => <div data-testid="icon-chevron-left" />,
    ChevronRight: () => <div data-testid="icon-chevron-right" />,
    Terminal: () => <div data-testid="icon-terminal" />,
    Download: () => <div data-testid="icon-download" />,
    Server: () => <div data-testid="icon-server" />,
}));

vi.mock('../../CodeEditor', () => ({
    CodeEditorView: () => <div data-testid="code-editor-view" />,
}));

vi.mock('../PreviewToolbar', () => ({
    PreviewToolbar: () => <div data-testid="preview-toolbar" />,
    DEVICE_PRESETS: [],
}));

vi.mock('../PreviewSkeleton', () => {
    const MockSkeleton = ({ phase }: { phase: string }) => (
        <div data-testid="preview-skeleton">{phase}</div>
    );
    return {
        PreviewSkeleton: MockSkeleton,
        default: MockSkeleton,
    };
});

vi.mock('../WebContainerErrorListener', () => ({
    WebContainerErrorListener: () => null,
}));

vi.mock('../../EmptyProjectState/EmptyProjectState', () => ({
    EmptyProjectState: () => <div data-testid="empty-project-state">Start by describing your application</div>,
}));

vi.mock('../../TabBar/TabBar', () => ({
    TabBar: ({ tabs, activeTab, onTabChange }: any) => (
        <div data-testid="tab-bar">
            {tabs.map((tab: any) => (
                <button
                    key={tab.id}
                    data-testid={`tab-${tab.id}`}
                    onClick={() => onTabChange(tab.id)}
                    aria-selected={activeTab === tab.id}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    ),
}));

// Now import PreviewPanel
import PreviewPanel from '../PreviewPanel';

describe('PreviewPanel', () => {
    const mockProjectState = {
        name: 'test-project',
        files: {
            'src/App.tsx': 'export default function App() { return <div>App</div>; }',
            'src/index.tsx': 'import "./App";',
            'package.json': '{"name":"test","scripts":{"dev":"vite"}}',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render placeholder when no project state and not loading', () => {
        render(<PreviewPanel projectState={null} isLoading={false} />);
        expect(screen.getByTestId('empty-project-state')).toBeDefined();
    });

    it('should render skeleton when loading', () => {
        render(<PreviewPanel projectState={null} isLoading={true} loadingPhase="generating" />);
        const skeleton = screen.getByTestId('preview-skeleton');
        expect(skeleton.textContent).toBe('generating');
    });

    it('should toggle between preview and code view using tabs', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        // Should start in preview mode (tabpanel-preview)
        expect(screen.getByRole('tabpanel', { name: /Live preview/i })).toBeDefined();

        // Click code tab
        const codeTab = screen.getByTestId('tab-code');
        fireEvent.click(codeTab);

        expect(screen.getByTestId('code-editor-view')).toBeDefined();

        // Click preview tab
        const previewTab = screen.getByTestId('tab-preview');
        fireEvent.click(previewTab);

        expect(screen.getByRole('tabpanel', { name: /Live preview/i })).toBeDefined();
    });

    it('should render TabBar component', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        expect(screen.getByTestId('tab-bar')).toBeDefined();
        expect(screen.getByTestId('tab-preview')).toBeDefined();
        expect(screen.getByTestId('tab-code')).toBeDefined();
    });

    it('should render project URL in preview mode', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        // PreviewHeader shows project name in url bar
        expect(screen.getByText(/test-project/i)).toBeDefined();
    });

    it('should not render project URL in code mode', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        // Switch to code mode
        const codeTab = screen.getByTestId('tab-code');
        fireEvent.click(codeTab);

        expect(screen.queryByText('test-project.app/')).toBeNull();
    });

    it('should not render browser controls when loading', () => {
        render(<PreviewPanel projectState={mockProjectState as any} isLoading={true} loadingPhase="generating" />);

        // When loading, PreviewHeader hides browser controls
        expect(screen.queryByText('test-project.app/')).toBeNull();
    });

    it('should trigger refresh when refresh button is clicked', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        const refreshButton = screen.getByRole('button', { name: /Refresh preview/i });
        fireEvent.click(refreshButton);

        // The preview content should still be visible after refresh
        expect(screen.getByRole('tabpanel', { name: /Live preview/i })).toBeDefined();
    });
});
