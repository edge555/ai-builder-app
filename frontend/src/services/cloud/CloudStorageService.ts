import { supabase } from '@/integrations/supabase/client';
import type { StoredProject, ProjectMetadata, SerializedChatMessage } from '@/services/storage';

/**
 * Supabase-backed cloud storage service.
 * Mirrors the StorageService API. RLS handles user isolation.
 */
export class CloudStorageService {
    private get client() {
        if (!supabase) throw new Error('Supabase is not configured');
        return supabase;
    }

    async saveProject(project: StoredProject): Promise<void> {
        // Upsert project row
        const { error: projError } = await this.client
            .from('projects')
            .upsert({
                id: project.id,
                name: project.name,
                description: project.description,
                updated_at: project.updatedAt,
                created_at: project.createdAt,
            }, { onConflict: 'id' });

        if (projError) throw projError;

        // Insert a new version snapshot
        const { error: verError } = await this.client
            .from('versions')
            .insert({
                project_id: project.id,
                message: '',
                project_state: {
                    files: project.files,
                    currentVersionId: project.currentVersionId,
                    fileCount: project.fileCount,
                    thumbnailFiles: project.thumbnailFiles,
                },
            });

        if (verError) throw verError;
    }

    async getProject(id: string): Promise<StoredProject | undefined> {
        const { data: proj, error: projError } = await this.client
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (projError || !proj) return undefined;

        // Get latest version
        const { data: version } = await this.client
            .from('versions')
            .select('project_state')
            .eq('project_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const state = version?.project_state as {
            files?: Record<string, string>;
            currentVersionId?: string;
            fileCount?: number;
            thumbnailFiles?: string[];
        } | null;

        // Get chat messages
        const chatMessages = await this.getChatMessages(id);

        const files = state?.files ?? {};
        return {
            id: proj.id,
            name: proj.name,
            description: proj.description,
            files,
            currentVersionId: state?.currentVersionId ?? proj.id,
            createdAt: proj.created_at,
            updatedAt: proj.updated_at,
            chatMessages,
            fileCount: state?.fileCount ?? Object.keys(files).length,
            thumbnailFiles: state?.thumbnailFiles ?? Object.keys(files).slice(0, 5),
        };
    }

    async getAllProjectMetadata(): Promise<ProjectMetadata[]> {
        const { data, error } = await this.client
            .from('projects')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        if (!data) return [];

        // Fetch latest version state for each project to get fileCount/thumbnailFiles
        const metadataPromises = data.map(async (proj) => {
            const { data: version } = await this.client
                .from('versions')
                .select('project_state')
                .eq('project_id', proj.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const state = version?.project_state as {
                files?: Record<string, string>;
                currentVersionId?: string;
                fileCount?: number;
                thumbnailFiles?: string[];
            } | null;

            const files = state?.files ?? {};
            return {
                id: proj.id,
                name: proj.name,
                description: proj.description,
                currentVersionId: state?.currentVersionId ?? proj.id,
                createdAt: proj.created_at,
                updatedAt: proj.updated_at,
                fileCount: state?.fileCount ?? Object.keys(files).length,
                thumbnailFiles: state?.thumbnailFiles ?? Object.keys(files).slice(0, 5),
            };
        });

        return Promise.all(metadataPromises);
    }

    async deleteProject(id: string): Promise<void> {
        const { error } = await this.client
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async renameProject(id: string, newName: string): Promise<void> {
        const { error } = await this.client
            .from('projects')
            .update({ name: newName })
            .eq('id', id);

        if (error) throw error;
    }

    async duplicateProject(id: string): Promise<StoredProject | undefined> {
        const original = await this.getProject(id);
        if (!original) return undefined;

        const newId = crypto.randomUUID();
        const now = new Date().toISOString();
        const duplicate: StoredProject = {
            ...original,
            id: newId,
            name: `${original.name} (Copy)`,
            createdAt: now,
            updatedAt: now,
            currentVersionId: newId,
        };

        await this.saveProject(duplicate);
        await this.saveChatMessages(newId, original.chatMessages);
        return duplicate;
    }

    async saveChatMessages(projectId: string, messages: SerializedChatMessage[]): Promise<void> {
        // Delete existing messages for this project
        const { error: delError } = await this.client
            .from('chat_messages')
            .delete()
            .eq('project_id', projectId);

        if (delError) throw delError;

        if (messages.length === 0) return;

        const rows = messages.map((msg) => ({
            id: msg.id,
            project_id: projectId,
            role: msg.role,
            content: msg.content,
            created_at: msg.timestamp,
            change_summary: msg.changeSummary ?? null,
            diffs: msg.diffs ?? null,
            is_error: msg.isError ?? false,
        }));

        const { error } = await this.client
            .from('chat_messages')
            .insert(rows);

        if (error) throw error;
    }

    async getChatMessages(projectId: string): Promise<SerializedChatMessage[]> {
        const { data, error } = await this.client
            .from('chat_messages')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        if (!data) return [];

        return data.map((row) => ({
            id: row.id,
            role: row.role as 'user' | 'assistant',
            content: row.content,
            timestamp: row.created_at,
            changeSummary: row.change_summary ?? undefined,
            diffs: row.diffs ?? undefined,
            isError: row.is_error ?? undefined,
        }));
    }
}

export const cloudStorageService = new CloudStorageService();
