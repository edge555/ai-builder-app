import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';

import { FileTreeNode } from './FileTreeNode';
import { buildFileTree, TreeNode } from './utils/buildFileTree';

/**
 * Threshold for enabling file tree virtualization.
 * File trees with more nodes than this will use virtual scrolling.
 */
const VIRTUALIZATION_THRESHOLD = 50;

/**
 * Estimated height of a file tree node (in pixels).
 * Used for virtual scrolling calculations.
 */
const ESTIMATED_NODE_HEIGHT = 28;

interface FileTreeSidebarProps {
  files: Record<string, string>;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
}

/** Collect paths of depth-0 directories only (top-level). */
function getTopLevelDirPaths(nodes: TreeNode[]): string[] {
  return nodes.filter((n) => n.type === 'directory').map((n) => n.path);
}

/** Recursively collect ALL directory paths in the tree. */
function getAllDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  const traverse = (nodeList: TreeNode[]) => {
    for (const node of nodeList) {
      if (node.type === 'directory') {
        paths.push(node.path);
        if (node.children) traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return paths;
}

function FileTreeSidebarComponent({
  files,
  activeFile,
  onFileSelect,
}: FileTreeSidebarProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const topLevelDirPaths = useMemo(() => getTopLevelDirPaths(tree), [tree]);
  const allDirPaths = useMemo(() => getAllDirPaths(tree), [tree]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Initialize with only top-level (depth-0) directories expanded.
  // Nested dirs start collapsed to keep the initial render lightweight.
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    return new Set(getTopLevelDirPaths(tree));
  });

  // When the file tree changes (files added/removed during generation):
  // - Keep existing expanded state untouched
  // - Auto-expand only NEW top-level directories
  // - Remove paths that no longer exist
  // - Deeper new directories are intentionally left collapsed
  useEffect(() => {
    const topLevelPaths = new Set(topLevelDirPaths);
    const validPaths = new Set(allDirPaths);

    setExpandedDirs((prev) => {
      const next = new Set(prev);

      // Auto-expand new top-level dirs only
      topLevelPaths.forEach((path) => next.add(path));

      // Prune stale paths
      next.forEach((path) => {
        if (!validPaths.has(path)) next.delete(path);
      });

      return next;
    });
  }, [topLevelDirPaths, allDirPaths]);

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedDirs(new Set(allDirPaths));
  }, [allDirPaths]);

  const handleCollapseAll = useCallback(() => {
    setExpandedDirs(new Set());
  }, []);

  // Flatten tree for easy navigation
  const flatNodes = useMemo(() => {
    const list: TreeNode[] = [];
    const traverse = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        list.push(node);
        if (node.type === 'directory' && expandedDirs.has(node.path) && node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(tree);
    return list;
  }, [tree, expandedDirs]);

  // Determine if we should use virtualization
  const shouldVirtualize = flatNodes.length > VIRTUALIZATION_THRESHOLD;

  // Setup virtualizer for large file trees
  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_NODE_HEIGHT,
    overscan: 10,
    enabled: shouldVirtualize,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return;

    const currentIndex = focusedId ? flatNodes.findIndex(n => n.path === focusedId) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % flatNodes.length;
        setFocusedId(flatNodes[nextIndex].path);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex <= 0 ? flatNodes.length - 1 : currentIndex - 1;
        setFocusedId(flatNodes[prevIndex].path);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (focusedId) {
          const node = flatNodes.find(n => n.path === focusedId);
          if (node?.type === 'directory') {
            if (!expandedDirs.has(focusedId)) {
              handleToggleDir(focusedId);
            } else if (node.children?.length) {
              // Move focus to first child
              const nextIndex = (currentIndex + 1) % flatNodes.length;
              setFocusedId(flatNodes[nextIndex].path);
            }
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (focusedId) {
          const node = flatNodes.find(n => n.path === focusedId);
          if (node?.type === 'directory' && expandedDirs.has(focusedId)) {
            handleToggleDir(focusedId);
          } else {
            // Move focus to parent directory
            const pathParts = focusedId.split('/');
            if (pathParts.length > 1) {
              const parentPath = pathParts.slice(0, -1).join('/');
              setFocusedId(parentPath);
            }
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (focusedId) {
          const node = flatNodes.find(n => n.path === focusedId);
          if (node) {
            if (node.type === 'directory') {
              handleToggleDir(node.path);
            } else {
              onFileSelect(node.path);
            }
          }
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocusedId(flatNodes[0].path);
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocusedId(flatNodes[flatNodes.length - 1].path);
        break;
      }
    }
  };

  const allExpanded = useMemo(() => {
    return allDirPaths.length > 0 && allDirPaths.every((p) => expandedDirs.has(p));
  }, [allDirPaths, expandedDirs]);

  const hasAnyDir = useMemo(() => allDirPaths.length > 0, [allDirPaths]);

  return (
    <div
      style={{
        width: '200px',
        minWidth: '200px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'hsl(var(--pv-surface))',
        borderRight: '1px solid hsl(var(--pv-border))',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid hsl(var(--pv-border))',
          minHeight: '32px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'hsl(var(--pv-text-muted))',
          }}
        >
          Files
        </span>

        {hasAnyDir && (
          <button
            onClick={allExpanded ? handleCollapseAll : handleExpandAll}
            title={allExpanded ? 'Collapse All' : 'Expand All'}
            aria-label={allExpanded ? 'Collapse all directories' : 'Expand all directories'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '3px',
              color: 'hsl(var(--pv-text-muted))',
              fontSize: '10px',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            {allExpanded ? (
              /* Collapse icon: chevrons pointing inward */
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M3 4l5 4-5 4V4zm10 0v8l-5-4 5-4z" />
              </svg>
            ) : (
              /* Expand icon: chevrons pointing outward */
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M13 12L8 8l5-4v8zM3 4v8l5-4-5-4z" />
              </svg>
            )}
          </button>
        )}
      </div>

      <div
        ref={scrollContainerRef}
        role="tree"
        aria-label="File explorer"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!focusedId && flatNodes.length > 0) {
            setFocusedId(flatNodes[0].path);
          }
        }}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          outline: 'none',
        }}
      >
        {tree.length === 0 ? (
          <div
            style={{
              padding: '16px 12px',
              fontSize: '12px',
              color: 'hsl(var(--pv-text-muted))',
              textAlign: 'center',
            }}
          >
            No files
          </div>
        ) : shouldVirtualize ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const node = flatNodes[virtualItem.index];
              // Calculate depth from the node's path
              const depth = node.path.split('/').length - 1;
              return (
                <div
                  key={node.path}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <FileTreeNode
                    node={node}
                    depth={depth}
                    activeFile={activeFile}
                    focusedId={focusedId}
                    expandedDirs={expandedDirs}
                    onFileSelect={onFileSelect}
                    onToggleDir={handleToggleDir}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              activeFile={activeFile}
              focusedId={focusedId}
              expandedDirs={expandedDirs}
              onFileSelect={onFileSelect}
              onToggleDir={handleToggleDir}
            />
          ))
        )}
      </div>
    </div>
  );
}

function areFileTreePropsEqual(
  prev: Readonly<FileTreeSidebarProps>,
  next: Readonly<FileTreeSidebarProps>
): boolean {
  if (prev.activeFile !== next.activeFile) return false;
  if (prev.onFileSelect !== next.onFileSelect) return false;

  const prevKeys = Object.keys(prev.files);
  const nextKeys = Object.keys(next.files);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    if (!(key in next.files)) return false;
  }
  return true;
}

export const FileTreeSidebar = memo(FileTreeSidebarComponent, areFileTreePropsEqual);
