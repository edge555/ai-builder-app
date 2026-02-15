import { useMemo, useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { buildFileTree, TreeNode } from './utils/buildFileTree';
import { FileTreeNode } from './FileTreeNode';

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

export function FileTreeSidebar({
  files,
  activeFile,
  onFileSelect,
}: FileTreeSidebarProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Function to get all directory paths from the tree
  const getAllDirPaths = (nodes: TreeNode[]): string[] => {
    const paths: string[] = [];
    const traverse = (nodeList: TreeNode[]) => {
      for (const node of nodeList) {
        if (node.type === 'directory') {
          paths.push(node.path);
          if (node.children) {
            traverse(node.children);
          }
        }
      }
    };
    traverse(nodes);
    return paths;
  };

  // Initialize with all directories expanded
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    return new Set(getAllDirPaths(tree));
  });

  // Update expanded dirs when tree changes (files added/removed)
  useEffect(() => {
    const allDirPaths = getAllDirPaths(tree);
    setExpandedDirs((prev) => {
      const newExpanded = new Set(prev);
      // Add any new directories
      allDirPaths.forEach((path) => newExpanded.add(path));
      // Remove directories that no longer exist
      const validPaths = new Set(allDirPaths);
      Array.from(newExpanded).forEach((path) => {
        if (!validPaths.has(path)) {
          newExpanded.delete(path);
        }
      });
      return newExpanded;
    });
  }, [tree]);

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return newExpanded;
    });
  };

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
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'hsl(var(--pv-text-muted))',
          borderBottom: '1px solid hsl(var(--pv-border))',
        }}
      >
        Files
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
