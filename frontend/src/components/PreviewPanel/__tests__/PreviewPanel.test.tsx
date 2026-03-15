import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sub-components with CORRECT paths relative to THIS test file
vi.mock('@codesandbox/sandpack-react', () => ({
    SandpackProvider: vi.fn(({ children, files }) => (
        <div data-testid="sandpack-provider" data-files={JSON.stringify(files)}>
            {children}
        </div>
    )),
    SandpackLayout: vi.fn(({ children }) => <div data-testid="sandpack-layout">{children}</div>),
    SandpackPreview: vi.fn(() => <div data-testid="sandpack-preview" />),
    useSandpack: vi.fn(() => ({ sandpack: {}, listen: vi.fn(), dispatch: vi.fn() })),
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

vi.mock('../SandpackErrorListener', () => ({
    SandpackErrorListener: () => <div data-testid="sandpack-error-listener" />,
}));

vi.mock('../SandpackRefresher', () => ({
    SandpackRefresher: () => null,
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
            'frontend/src/App.tsx': 'export default function App() { return <div>App</div>; }',
            'frontend/src/index.tsx': 'import "./App";',
            'frontend/styles.css': 'body { color: red; }',
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

    it('should transform files for Sandpack (remove frontend prefix, add slash)', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        const provider = screen.getByTestId('sandpack-provider');
        const files = JSON.parse(provider.getAttribute('data-files') || '{}');

        expect(files).toHaveProperty('/src/App.tsx');
        expect(files).toHaveProperty('/src/index.tsx');
        expect(files).toHaveProperty('/styles.css');
    });

    it('should toggle between preview and code view using tabs', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        // Should start in preview mode
        expect(screen.getByTestId('sandpack-provider')).toBeDefined();

        // Click code tab
        const codeTab = screen.getByTestId('tab-code');
        fireEvent.click(codeTab);

        expect(screen.getByTestId('code-editor-view')).toBeDefined();

        // Click preview tab
        const previewTab = screen.getByTestId('tab-preview');
        fireEvent.click(previewTab);

        expect(screen.getByTestId('sandpack-provider')).toBeDefined();
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

        // The preview should still be visible after refresh
        expect(screen.getByTestId('sandpack-provider')).toBeDefined();
    });

    it('should use default files if required files are missing', () => {
        const incompleteState = {
            name: 'broken',
            files: { 'utils.ts': 'export const x = 1;' }
        };

        render(<PreviewPanel projectState={incompleteState as any} />);

        const provider = screen.getByTestId('sandpack-provider');
        const files = JSON.parse(provider.getAttribute('data-files') || '{}');

        expect(files).toHaveProperty('/App.tsx');
        expect(files).toHaveProperty('/index.tsx');
        expect(files).toHaveProperty('/utils.ts');
    });
});
