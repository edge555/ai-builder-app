import type { WebContainerPhase } from '@/hooks/useWebContainer';

export interface WebContainerPreviewProps {
  previewUrl: string | null;
  phase: WebContainerPhase;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Renders the WebContainer iframe when the dev server is ready.
 */
export function WebContainerPreview({ previewUrl, phase, style, className }: WebContainerPreviewProps) {
  if (!previewUrl || phase !== 'ready') {
    return null;
  }

  return (
    <iframe
      src={previewUrl}
      title="Application preview"
      style={{ width: '100%', height: '100%', border: 'none', ...style }}
      className={className}
      allow="cross-origin-isolated"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
