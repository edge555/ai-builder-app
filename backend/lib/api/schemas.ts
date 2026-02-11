import { z } from 'zod';

export const SerializedProjectStateSchema = z.object({
  id: z.string().min(1, 'Project state must have a valid id'),
  name: z.string(),
  description: z.string(),
  files: z.record(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  currentVersionId: z.string(),
});

export const ModifyProjectRequestSchema = z.object({
  projectState: SerializedProjectStateSchema,
  prompt: z.string().min(1, 'Modification prompt cannot be empty'),
  skipPlanning: z.boolean().optional(),
});

export const ExportProjectRequestSchema = z.object({
  projectState: SerializedProjectStateSchema,
});
