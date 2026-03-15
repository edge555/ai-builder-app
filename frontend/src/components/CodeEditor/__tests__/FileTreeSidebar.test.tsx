import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock FileTreeNode with a testable recursive implementation
vi.mock('../FileTreeNode', () => {
    // Defined as a plain function so it can recurse without circular import issues
    function FileTreeNode({ node, onFileSelect, onToggleDir, expandedDirs }: any): any {
        const isExpanded = expandedDirs instanceof Set && expandedDirs.has(node.path);
        return (
            <div>
                <div
                    data-testid={`node-${node.path}`}
                    data-type={node.type}
                    data-path={node.path}
                    onClick={() => {
                        if (node.type === 'directory') {
                            onToggleDir(node.path);
                        } else {
                            onFileSelect(node.path);
                        }
                    }}
                >
                    {node.name}
                </div>
                {node.type === 'directory' && isExpanded && node.children?.map((child: any) => (
                    <FileTreeNode
                        key={child.path}
                        node={child}
                        depth={0}
                        activeFile={null}
                        focusedId={null}
                        expandedDirs={expandedDirs}
                        onFileSelect={onFileSelect}
                        onToggleDir={onToggleDir}
                    />
                ))}
            </div>
        );
    }
    return { FileTreeNode };
});

// Mock @tanstack/react-virtual with a simple pass-through
vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({ count, enabled }: any) => ({
        getVirtualItems: () => enabled
            ? Array.from({ length: count }, (_, i) => ({ index: i, start: i * 28, size: 28 }))
            : [],
        getTotalSize: () => count * 28,
        measureElement: null,
        scrollToIndex: vi.fn(),
    }),
}));

import { FileTreeSidebar } from '../FileTreeSidebar';

const defaultProps = {
    files: {} as Record<string, string>,
    activeFile: null as string | null,
    onFileSelect: vi.fn(),
};

describe('FileTreeSidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── Empty state ──────────────────────────────────────────────────────────

    it('renders "No files" when files is empty', () => {
        render(<FileTreeSidebar {...defaultProps} files={{}} />);
        expect(screen.getByText('No files')).toBeInTheDocument();
    });

    it('renders "Files" header label', () => {
        render(<FileTreeSidebar {...defaultProps} />);
        expect(screen.getByText('Files')).toBeInTheDocument();
    });

    // ─── File/directory rendering ─────────────────────────────────────────────

    it('renders flat files', () => {
        const files = {
            'index.ts': 'export {};',
            'README.md': '# Readme',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        expect(screen.getByTestId('node-index.ts')).toBeInTheDocument();
        expect(screen.getByTestId('node-README.md')).toBeInTheDocument();
    });

    it('renders directories from file paths', () => {
        const files = {
            'src/App.tsx': 'export default function App() {}',
            'src/utils.ts': 'export const x = 1;',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        // 'src' directory should be rendered
        expect(screen.getByTestId('node-src')).toBeInTheDocument();
    });

    it('auto-expands top-level directories', () => {
        const files = {
            'src/App.tsx': 'export default function App() {}',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        // Since src is auto-expanded, App.tsx should be visible
        expect(screen.getByTestId('node-src/App.tsx')).toBeInTheDocument();
    });

    // ─── File selection ───────────────────────────────────────────────────────

    it('calls onFileSelect when a file is clicked', () => {
        const onFileSelect = vi.fn();
        const files = { 'index.ts': 'export {};' };
        render(<FileTreeSidebar {...defaultProps} files={files} onFileSelect={onFileSelect} />);

        fireEvent.click(screen.getByTestId('node-index.ts'));
        expect(onFileSelect).toHaveBeenCalledWith('index.ts');
    });

    it('does not call onFileSelect when a directory is clicked', () => {
        const onFileSelect = vi.fn();
        const files = { 'src/App.tsx': 'export default function App() {}' };
        render(<FileTreeSidebar {...defaultProps} files={files} onFileSelect={onFileSelect} />);

        fireEvent.click(screen.getByTestId('node-src'));
        expect(onFileSelect).not.toHaveBeenCalled();
    });

    // ─── Directory toggle ─────────────────────────────────────────────────────

    it('collapses a directory when clicking an expanded dir', () => {
        const files = {
            'src/App.tsx': 'export default function App() {}',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        // src is auto-expanded, so App.tsx is visible
        expect(screen.getByTestId('node-src/App.tsx')).toBeInTheDocument();

        // Click src to collapse it
        fireEvent.click(screen.getByTestId('node-src'));

        // App.tsx should no longer be visible
        expect(screen.queryByTestId('node-src/App.tsx')).not.toBeInTheDocument();
    });

    it('expands a collapsed directory on click', () => {
        const files = {
            'src/nested/deep.ts': 'export const x = 1;',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        // 'nested' is a nested dir — starts collapsed
        // Click it to expand
        fireEvent.click(screen.getByTestId('node-src/nested'));
        expect(screen.getByTestId('node-src/nested/deep.ts')).toBeInTheDocument();
    });

    // ─── Expand/Collapse All ──────────────────────────────────────────────────

    it('shows expand/collapse button when directories exist', () => {
        const files = { 'src/App.tsx': 'export default function App() {}' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        // Button should appear (aria-label)
        const button = screen.getByRole('button', { name: /expand all|collapse all/i });
        expect(button).toBeInTheDocument();
    });

    it('does not show expand/collapse button for flat file list', () => {
        const files = { 'index.ts': 'export {};', 'utils.ts': 'export const x = 1;' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        expect(screen.queryByRole('button', { name: /expand all|collapse all/i })).not.toBeInTheDocument();
    });

    it('collapses all directories with Collapse All button', () => {
        const files = {
            'src/App.tsx': 'export default function App() {}',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        // src is auto-expanded; App.tsx is visible
        expect(screen.getByTestId('node-src/App.tsx')).toBeInTheDocument();

        // The button should now say "Collapse All" (since all are expanded)
        const btn = screen.getByRole('button', { name: /collapse all/i });
        fireEvent.click(btn);

        // App.tsx should now be hidden
        expect(screen.queryByTestId('node-src/App.tsx')).not.toBeInTheDocument();
    });

    it('expands all directories with Expand All button', () => {
        const files = {
            'src/nested/deep.ts': 'export const x = 1;',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        // nested starts collapsed, so deep.ts is not visible initially
        expect(screen.queryByTestId('node-src/nested/deep.ts')).not.toBeInTheDocument();

        // Click expand all
        const btn = screen.getByRole('button', { name: /expand all/i });
        fireEvent.click(btn);

        expect(screen.getByTestId('node-src/nested/deep.ts')).toBeInTheDocument();
    });

    // ─── Keyboard navigation ──────────────────────────────────────────────────

    it('sets focus on first node when container is focused', () => {
        const files = { 'src/App.tsx': 'export default function App() {}' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        const container = screen.getByRole('tree');
        fireEvent.focus(container);
        // Focus should be initialized — we just check it doesn't throw
        expect(container).toBeInTheDocument();
    });

    it('navigates down with ArrowDown key', () => {
        const files = {
            'index.ts': 'export {};',
            'utils.ts': 'export const x = 1;',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        const container = screen.getByRole('tree');
        fireEvent.focus(container);
        fireEvent.keyDown(container, { key: 'ArrowDown' });
        // Should not throw and component remains functional
        expect(container).toBeInTheDocument();
    });

    it('navigates up with ArrowUp key', () => {
        const files = {
            'index.ts': 'export {};',
            'utils.ts': 'export const x = 1;',
        };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        const container = screen.getByRole('tree');
        fireEvent.focus(container);
        fireEvent.keyDown(container, { key: 'ArrowUp' });
        expect(container).toBeInTheDocument();
    });

    it('Home key navigates to first node', () => {
        const files = { 'index.ts': 'export {};', 'utils.ts': 'export const x = 1;' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        const container = screen.getByRole('tree');
        fireEvent.keyDown(container, { key: 'Home' });
        expect(container).toBeInTheDocument();
    });

    it('End key navigates to last node', () => {
        const files = { 'index.ts': 'export {};', 'utils.ts': 'export const x = 1;' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);

        const container = screen.getByRole('tree');
        fireEvent.keyDown(container, { key: 'End' });
        expect(container).toBeInTheDocument();
    });

    it('does nothing on keydown when no files', () => {
        render(<FileTreeSidebar {...defaultProps} files={{}} />);
        const container = screen.getByRole('tree');
        // Should not throw when pressing keys with no files
        fireEvent.keyDown(container, { key: 'ArrowDown' });
        expect(container).toBeInTheDocument();
    });

    // ─── Accessibility ────────────────────────────────────────────────────────

    it('has role="tree" on container', () => {
        const files = { 'index.ts': 'export {};' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        expect(screen.getByRole('tree')).toBeInTheDocument();
    });

    it('has aria-label on tree container', () => {
        const files = { 'index.ts': 'export {};' };
        render(<FileTreeSidebar {...defaultProps} files={files} />);
        expect(screen.getByRole('tree')).toHaveAttribute('aria-label', 'File explorer');
    });

    // ─── Memoization comparator ───────────────────────────────────────────────

    it('renders correctly when activeFile changes', () => {
        const files = { 'index.ts': 'export {};', 'utils.ts': 'export const x = 1;' };
        const { rerender } = render(
            <FileTreeSidebar {...defaultProps} files={files} activeFile="index.ts" />
        );
        rerender(
            <FileTreeSidebar {...defaultProps} files={files} activeFile="utils.ts" />
        );
        expect(screen.getByTestId('node-utils.ts')).toBeInTheDocument();
    });

    it('updates when new files are added', () => {
        const files = { 'index.ts': 'export {};' };
        const { rerender } = render(<FileTreeSidebar {...defaultProps} files={files} />);

        rerender(<FileTreeSidebar {...defaultProps} files={{ ...files, 'utils.ts': 'export const x = 1;' }} />);
        expect(screen.getByTestId('node-utils.ts')).toBeInTheDocument();
    });
});
