import { useState, useCallback, useRef } from 'react';
import { BookmarkPlus, Check } from 'lucide-react';

import { useProjectState } from '../../context';
import { storageService } from '../../services/storage';
import type { UserTemplate } from '../../services/storage';
import { capturePreviewScreenshot } from '../../utils/capture-screenshot';

import './SaveTemplateButton.css';

export function SaveTemplateButton() {
    const { projectState } = useProjectState();
    const [isSaving, setIsSaving] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const handleSave = useCallback(async () => {
        if (!projectState) return;

        setIsSaving(true);
        try {
            const screenshot = await capturePreviewScreenshot();

            const template: UserTemplate = {
                id: crypto.randomUUID(),
                name: projectState.name || 'Untitled Template',
                description: projectState.description || '',
                category: 'My Templates',
                icon: '📁',
                prompt: '',
                files: projectState.files,
                screenshot,
                createdAt: new Date().toISOString(),
                isUserTemplate: true,
            };

            await storageService.saveTemplate(template);

            setShowSaved(true);
            clearTimeout(savedTimerRef.current);
            savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
        } finally {
            setIsSaving(false);
        }
    }, [projectState]);

    return (
        <button
            className={`save-template-button settings-button${showSaved ? ' save-template-button--saved' : ''}`}
            onClick={handleSave}
            disabled={!projectState || isSaving}
            aria-label={showSaved ? 'Template saved' : 'Save as template'}
            title={projectState ? 'Save as template' : 'Generate a project first'}
        >
            {showSaved ? <Check size={18} /> : <BookmarkPlus size={18} />}
        </button>
    );
}
