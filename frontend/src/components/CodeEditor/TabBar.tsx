interface TabBarProps {
  openFiles: string[];
  activeFile: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
}

export function TabBar({
  openFiles,
  activeFile,
  onTabSelect,
  onTabClose,
}: TabBarProps) {
  const getFileName = (path: string): string => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  const handleClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation(); // Prevent tab selection when clicking close button

    // Find the tab being closed
    const closingIndex = openFiles.indexOf(path);
    const isClosingActive = path === activeFile;

    // Close the tab first
    onTabClose(path);

    // If we're closing the active tab, activate an adjacent one
    if (isClosingActive && openFiles.length > 1) {
      // Try to activate the tab to the right
      if (closingIndex < openFiles.length - 1) {
        onTabSelect(openFiles[closingIndex + 1]);
      }
      // Otherwise, activate the tab to the left
      else if (closingIndex > 0) {
        onTabSelect(openFiles[closingIndex - 1]);
      }
    }
  };

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '36px',
        backgroundColor: 'hsl(var(--pv-surface))',
        borderBottom: '1px solid hsl(var(--pv-border))',
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {openFiles.map((filePath) => {
        const isActive = filePath === activeFile;
        const fileName = getFileName(filePath);

        return (
          <div
            key={filePath}
            onClick={() => onTabSelect(filePath)}
            title={filePath}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 12px',
              height: '100%',
              fontSize: '13px',
              cursor: 'pointer',
              userSelect: 'none',
              backgroundColor: isActive
                ? 'hsl(var(--pv-bg))'
                : 'transparent',
              color: isActive
                ? 'hsl(var(--pv-text))'
                : 'hsl(var(--pv-text-muted))',
              borderRight: '1px solid hsl(var(--pv-border))',
              borderBottom: isActive
                ? '2px solid hsl(var(--pv-accent))'
                : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'hsl(var(--pv-surface-2))';
                e.currentTarget.style.color = 'hsl(var(--pv-text))';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'hsl(var(--pv-text-muted))';
              }
            }}
          >
            <span>{fileName}</span>
            <button
              onClick={(e) => handleClose(e, filePath)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'inherit',
                cursor: 'pointer',
                opacity: 0.6,
                borderRadius: '3px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.backgroundColor = 'hsl(var(--pv-border))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.6';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M2 2L10 10M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
