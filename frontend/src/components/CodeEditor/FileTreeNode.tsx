import { TreeNode } from './utils/buildFileTree';

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  activeFile: string | null;
  focusedId: string | null;
  expandedDirs: Set<string>;
  onFileSelect: (path: string) => void;
  onToggleDir: (path: string) => void;
}

export function FileTreeNode({
  node,
  depth,
  activeFile,
  focusedId,
  expandedDirs,
  onFileSelect,
  onToggleDir,
}: FileTreeNodeProps) {
  const isDirectory = node.type === 'directory';
  const isExpanded = expandedDirs.has(node.path);
  const isActive = activeFile === node.path;
  const isFocused = focusedId === node.path;

  const handleClick = () => {
    if (isDirectory) {
      onToggleDir(node.path);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-current={isActive ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          paddingLeft: `${8 + depth * 16}px`,
          cursor: 'pointer',
          color: isActive
            ? 'hsl(var(--pv-accent))'
            : isFocused
              ? 'hsl(var(--pv-text))'
              : 'hsl(var(--pv-text))',
          backgroundColor: isActive
            ? 'hsl(var(--pv-accent) / 0.15)'
            : isFocused
              ? 'hsl(var(--pv-surface-3))'
              : 'transparent',
          outline: isFocused ? '1px inset hsl(var(--pv-accent) / 0.5)' : 'none',
          fontSize: '13px',
          userSelect: 'none',
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'hsl(var(--pv-surface-2))';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {isDirectory ? (
          <>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              style={{
                marginRight: '6px',
                transition: 'transform 0.15s ease',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <path
                d="M4 2L8 6L4 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
              style={{ marginRight: '6px' }}
            >
              <path
                d="M1.75 2h4.5L8 3.75h6.25v9.5H1.75z"
                fill={isExpanded ? 'hsl(var(--pv-accent))' : 'currentColor'}
                fillOpacity={isExpanded ? '0.4' : '0.3'}
              />
            </svg>
            <span>{node.name}</span>
          </>
        ) : (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
              style={{ marginRight: '6px', marginLeft: '18px' }}
            >
              <path
                d="M2 2h8l2 2v10H2z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.6"
              />
            </svg>
            <span>{node.name}</span>
          </>
        )}
      </div>

      {isDirectory && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              focusedId={focusedId}
              expandedDirs={expandedDirs}
              onFileSelect={onFileSelect}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}
