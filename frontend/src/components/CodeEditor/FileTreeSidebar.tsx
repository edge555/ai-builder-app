import { useMemo, useState, useEffect } from 'react';
import { buildFileTree, TreeNode } from './utils/buildFileTree';
import { FileTreeNode } from './FileTreeNode';

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

      {/* Tree Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
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
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              activeFile={activeFile}
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
