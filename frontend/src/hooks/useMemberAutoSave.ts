/**
 * useMemberAutoSave
 * Saves workspace project files to /api/member/projects/:pid after each
 * successful generation or modification (when isStreaming transitions false).
 */

import { useEffect, useRef } from 'react';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { useGenerationState } from '@/context/GenerationContext.context';
import { useProjectState } from '@/context/ProjectContext.context';
import { useToastActions } from '@/context/ToastContext';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MemberAutoSave');

export function useMemberAutoSave(projectId: string, accessToken: string) {
    const { isStreaming } = useGenerationState();
    const { projectState } = useProjectState();
    const { addToast } = useToastActions();
    const wasStreamingRef = useRef(false);

    useEffect(() => {
        // Detect streaming → done transition (successful generation)
        if (wasStreamingRef.current && !isStreaming && projectState?.files) {
            const filesToSave = Object.fromEntries(
                Object.entries(projectState.files).map(([path, content]) => [
                    path,
                    { code: content },
                ])
            );

            fetch(`${FUNCTIONS_BASE_URL}/member/projects/${projectId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ files_json: filesToSave }),
            })
                .then(res => {
                    if (!res.ok) {
                        logger.warn('Auto-save failed', { status: res.status });
                        addToast({ message: 'Auto-save failed — your changes may not be saved.', type: 'error' });
                    } else {
                        logger.info('Auto-saved workspace project', { projectId });
                    }
                })
                .catch(e => {
                    logger.error('Auto-save error', { error: String(e) });
                    addToast({ message: 'Auto-save failed — check your connection.', type: 'error' });
                });
        }

        wasStreamingRef.current = isStreaming;
    }, [isStreaming, projectState, projectId, accessToken]);
}
