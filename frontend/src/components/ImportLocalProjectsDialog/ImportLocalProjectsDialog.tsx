import { useState, useEffect, useRef } from 'react';
import { storageService, type ProjectMetadata } from '@/services/storage';
import { cloudStorageService } from '@/services/cloud/CloudStorageService';
import './ImportLocalProjectsDialog.css';

interface ImportLocalProjectsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onImported: () => Promise<void>;
}

/**
 * Dialog shown once after first login when local IndexedDB projects exist.
 * Lets the user select which local projects to upload to Supabase.
 */
export function ImportLocalProjectsDialog({
    isOpen,
    onClose,
    onImported,
}: ImportLocalProjectsDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [localProjects, setLocalProjects] = useState<ProjectMetadata[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        storageService.getAllProjectMetadata().then((projects) => {
            setLocalProjects(projects);
            setSelected(new Set(projects.map((p) => p.id)));
        });
    }, [isOpen]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (isOpen && !dialog.open) {
            dialog.showModal();
        } else if (!isOpen && dialog.open) {
            dialog.close();
        }
    }, [isOpen]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const handleCancel = (e: Event) => { e.preventDefault(); onClose(); };
        dialog.addEventListener('cancel', handleCancel);
        return () => dialog.removeEventListener('cancel', handleCancel);
    }, [onClose]);

    const toggleProject = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === localProjects.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(localProjects.map((p) => p.id)));
        }
    };

    const handleImport = async () => {
        setImporting(true);
        setError(null);
        try {
            for (const projectId of selected) {
                const project = await storageService.getProject(projectId);
                if (project) {
                    await cloudStorageService.saveProject(project);
                    const messages = await storageService.getChatMessages(projectId);
                    if (messages.length > 0) {
                        await cloudStorageService.saveChatMessages(projectId, messages);
                    }
                }
            }
            await storageService.setMetadata('localProjectsImported', true);
            await onImported();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    if (localProjects.length === 0 && isOpen) return null;

    return (
        <dialog ref={dialogRef} className="import-dialog">
            <div className="import-dialog-content">
                <h2 className="import-dialog-title">Import Local Projects</h2>
                <p className="import-dialog-description">
                    You have projects saved locally. Select which ones to upload to your cloud account.
                </p>

                <div className="import-dialog-select-all">
                    <label className="import-dialog-checkbox-label">
                        <input
                            type="checkbox"
                            checked={selected.size === localProjects.length}
                            onChange={toggleAll}
                        />
                        Select all ({localProjects.length})
                    </label>
                </div>

                <ul className="import-dialog-list">
                    {localProjects.map((project) => (
                        <li key={project.id} className="import-dialog-item">
                            <label className="import-dialog-checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={selected.has(project.id)}
                                    onChange={() => toggleProject(project.id)}
                                />
                                <span className="import-dialog-project-name">{project.name || 'Untitled'}</span>
                                <span className="import-dialog-project-meta">
                                    {project.fileCount} file{project.fileCount !== 1 ? 's' : ''}
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>

                {error && <p className="import-dialog-error">{error}</p>}

                <div className="import-dialog-actions">
                    <button
                        type="button"
                        className="import-dialog-btn import-dialog-btn--cancel"
                        onClick={onClose}
                        disabled={importing}
                    >
                        Skip
                    </button>
                    <button
                        type="button"
                        className="import-dialog-btn import-dialog-btn--primary"
                        onClick={handleImport}
                        disabled={importing || selected.size === 0}
                    >
                        {importing ? 'Importing...' : `Import Selected (${selected.size})`}
                    </button>
                </div>
            </div>
        </dialog>
    );
}
