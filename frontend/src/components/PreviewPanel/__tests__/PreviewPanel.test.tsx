import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock sub-components with CORRECT paths relative to THIS test file
vi.mock('@codesandbox/sandpack-react', () => ({
    SandpackProvider: vi.fn(({ children, files }) => (
        <div data-testid="sandpack-provider" data-files={JSON.stringify(files)}>
            {children}
        </div>
    )),
    SandpackLayout: vi.fn(({ children }) => <div data-testid="sandpack-layout">{children}</div>),
    SandpackPreview: vi.fn(() => <div data-testid="sandpack-preview" />),
}));

vi.mock('lucide-react', () => ({
    RefreshCw: () => <div data-testid="icon-refresh" />,
    Code: () => <div data-testid="icon-code" />,
    Monitor: () => <div data-testid="icon-monitor" />,
}));

vi.mock('../../CodeEditor', () => ({
    CodeEditorView: () => <div data-testid="code-editor-view" />,
}));

vi.mock('../PreviewToolbar', () => ({
    PreviewToolbar: () => <div data-testid="preview-toolbar" />,
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
        expect(screen.getByText(/Start by describing your application/i)).toBeDefined();
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

    it('should toggle between preview and code view', () => {
        render(<PreviewPanel projectState={mockProjectState as any} />);

        const codeBtn = screen.getByLabelText(/Switch to code editor/i);
        fireEvent.click(codeBtn);

        expect(screen.getByTestId('code-editor-view')).toBeDefined();

        const previewBtn = screen.getByLabelText(/Switch to preview/i);
        fireEvent.click(previewBtn);

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
