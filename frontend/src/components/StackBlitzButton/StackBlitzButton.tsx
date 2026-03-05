import { useState, useCallback } from 'react';
import { Zap } from 'lucide-react';

import { useProjectState } from '../../context';

import './StackBlitzButton.css';

export function StackBlitzButton() {
    const { projectState } = useProjectState();
    const [isLoading, setIsLoading] = useState(false);

    const handleOpen = useCallback(async () => {
        if (!projectState) return;

        setIsLoading(true);
        try {
            const sdk = await import('@stackblitz/sdk');
            sdk.default.openProject(
                {
                    title: projectState.name || 'AI App Builder Project',
                    description: projectState.description || '',
                    template: 'node',
                    files: projectState.files,
                },
                { openFile: 'src/App.tsx' }
            );
        } catch {
            // SDK load or open failure — no action needed
        } finally {
            setIsLoading(false);
        }
    }, [projectState]);

    return (
        <button
            className={`stackblitz-button settings-button${isLoading ? ' stackblitz-button--loading' : ''}`}
            onClick={handleOpen}
            disabled={!projectState || isLoading}
            aria-label="Open in StackBlitz"
            title={projectState ? 'Open in StackBlitz' : 'Generate a project first'}
        >
            <Zap size={18} />
        </button>
    );
}
