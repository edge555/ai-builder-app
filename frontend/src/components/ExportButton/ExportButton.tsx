import { forwardRef, useState, useCallback } from 'react';
import { useProject } from '../../context';

import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';

/**
 * Export button component for downloading project as ZIP.
 * 
 * Requirements: 7.1
 */
export const ExportButton = forwardRef<HTMLButtonElement, Record<string, never>>(function ExportButton(_props, ref) {
    const { projectState } = useProject();
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    const handleExport = useCallback(async () => {
        if (!projectState) return;

        setIsExporting(true);
        setExportError(null);

        try {
            if (!FUNCTIONS_BASE_URL || !SUPABASE_ANON_KEY) {
                throw new Error('Export is not configured');
            }

            const response = await fetch(`${FUNCTIONS_BASE_URL}/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_ANON_KEY,
                    // For unauthenticated usage, functions can accept the anon key as bearer.
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({ projectState }),
            });

            if (!response.ok) {
                throw new Error(`Export failed: ${response.status} ${response.statusText}`);
            }

            // Get the blob from the response
            const blob = await response.blob();

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${projectState.name || 'project'}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Export failed';
            setExportError(errorMsg);
            console.error('Export error:', err);
        } finally {
            setIsExporting(false);
        }
    }, [projectState]);

    return (
        <button
            ref={ref}
            className={`ui-button export-button ${isExporting ? 'exporting' : ''} ${exportError ? 'has-error' : ''}`}
            data-variant={exportError ? 'danger' : 'success'}
            onClick={handleExport}
            disabled={!projectState || isExporting}
            title={exportError || (projectState ? 'Download project as ZIP' : 'Generate a project first')}
            aria-label="Export project as ZIP"
        >
            {isExporting ? (
                <>
                    <span className="export-button-spinner"></span>
                    <span>Exporting...</span>
                </>
            ) : (
                <>
                    <svg className="export-button-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>{exportError ? 'Retry' : 'Export'}</span>
                </>
            )}
        </button>
    );
});

ExportButton.displayName = 'ExportButton';
