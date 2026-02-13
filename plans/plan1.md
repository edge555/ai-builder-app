Project Persistence Features - Implementation Plan
Context
The AI App Builder currently has zero persistence - all project state, chat history, and work is lost on page refresh. This is the #1 usability pain point. This plan adds browser-local persistence via IndexedDB (no login needed) with a project dashboard for managing multiple projects.
Features (6 total)
Auto-save to IndexedDB - Persist project + chat on every change (debounced)
Auto-restore on load - Detect saved projects on app startup
Project Gallery / Dashboard - Show saved projects as cards on WelcomePage
Project Rename - Rename from gallery cards and builder header
Project Delete - Delete with confirmation dialog
Duplicate Project - Fork a project for experimentation

Implementation
Phase 1: Storage Foundation
New: frontend/src/services/storage/types.ts
interface StoredProject {
  id: string;                              // from SerializedProjectState.id
  name: string;
  description: string;
  files: Record<string, string>;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
  chatMessages: SerializedChatMessage[];   // Date -> ISO string
  fileCount: number;                       // denormalized for gallery
  thumbnailFiles: string[];                // first 3-5 filenames
}

interface SerializedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;                       // ISO string (ChatMessage.timestamp is Date)
  changeSummary?: ChangeSummary;
  diffs?: FileDiff[];
  isError?: boolean;
}


Plus toStoredProject(), toSerializedProjectState(), serializeChatMessages(), deserializeChatMessages() helpers.
New: frontend/src/services/storage/StorageService.ts
Database: ai_app_builder_db, version 1
Object stores: projects (keyPath: id, index: by-updatedAt) + metadata (keyPath: key)
Methods: initialize(), saveProject(), getProject(), getAllProjects(), deleteProject(), renameProject(), duplicateProject(), getMetadata(), setMetadata(), getStorageEstimate()
Error handling: try/catch all ops, log + swallow save errors, return empty/undefined for read errors
Singleton export: export const storageService = new StorageService()
Uses raw IndexedDB API (no new dependencies needed)
New: frontend/src/services/storage/index.ts
Barrel export.
New: frontend/src/hooks/useAutoSave.ts
function useAutoSave(projectState, messages, { debounceMs = 1500 })
  -> { isSaving, lastSavedAt, saveError }


Watches projectState + messages via useEffect
Debounces 1500ms, then calls storageService.saveProject(buildStoredProject(...))
Also saves lastOpenedProjectId to metadata store
Modify: frontend/src/context/ProjectContext.tsx
Accept optional initialState prop: ProjectProvider({ children, initialState? })
Initialize useState with initialState ?? null
Add renameProject(newName) method that updates projectState.name + updatedAt
Modify: frontend/src/context/ChatMessagesContext.tsx
Accept optional initialMessages prop: ChatMessagesProvider({ children, initialMessages? })
Initialize useState with initialMessages ?? []
Modify: frontend/src/components/AppLayout/AppLayout.tsx
Add useAutoSave(projectState, messages) call
Show subtle save indicator in header: "Saving..." / "Saved"
Accept onBackToDashboard prop, render back arrow button in header left

Phase 2: Restore + Gallery
New: frontend/src/components/ProjectGallery/ProjectGallery.tsx
Grid layout of ProjectCard components
repeat(auto-fill, minmax(260px, 1fr)) grid
New: frontend/src/components/ProjectGallery/ProjectCard.tsx
Shows: project name, "X files", relative time ("2 hours ago"), 3 filename previews
Actions: Open (click card), Rename (pencil), Duplicate (copy), Delete (trash)
New: frontend/src/components/ProjectGallery/ProjectGallery.css
Follows existing BEM-like pattern, uses CSS custom properties from index.css
Modify: frontend/src/pages/WelcomePage.tsx
Expand props interface:
interface WelcomePageProps {
  onEnterApp: (initialPrompt?: string) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onDuplicateProject: (projectId: string) => void;
  savedProjects: StoredProject[];
}


Render ProjectGallery between Hero and Examples when savedProjects.length > 0
Change CTA from "Get Started" to "New Project" when projects exist
Modify: frontend/src/App.tsx
Major changes:
Add isInitializing loading state + storage init in useEffect
Add savedProjects state, loaded from storageService.getAllProjects()
Add BuilderEntryState type: { initialPrompt?, restoredProject? }
handleOpenProject(id) -> loads from IndexedDB, enters builder with hydrated state
handleBackToDashboard() -> refreshes project list, returns to welcome
handleDeleteProject(id), handleRenameProject(id, name), handleDuplicateProject(id) handlers
Pass initialState / initialMessages to context providers when restoring
Key provider tree on project ID for clean remount: <ProjectProvider key={projectId}>

Phase 3: Management Operations
New: frontend/src/components/ConfirmDialog/ConfirmDialog.tsx
Reusable modal: { isOpen, title, message, confirmLabel, confirmVariant, onConfirm, onCancel }
Uses native <dialog> element or portal overlay
Delete button uses --destructive color
New: frontend/src/components/ConfirmDialog/ConfirmDialog.css
New: frontend/src/components/EditableProjectName/EditableProjectName.tsx
Shows name as text, pencil icon on hover
Click -> inline <input>, Enter/blur commits, Escape reverts
Used in both ProjectCard and AppLayout header
Modify: frontend/src/components/AppLayout/AppLayout.tsx (header)
Replace static <h1>AI App Builder</h1> with:
When project loaded: <EditableProjectName> showing project name
When no project: static "AI App Builder"

File Summary
New Files (11)
File
Purpose
frontend/src/services/storage/StorageService.ts
IndexedDB service
frontend/src/services/storage/types.ts
Types + serializers
frontend/src/services/storage/index.ts
Barrel export
frontend/src/hooks/useAutoSave.ts
Debounced auto-save hook
frontend/src/components/ProjectGallery/ProjectGallery.tsx
Gallery grid
frontend/src/components/ProjectGallery/ProjectCard.tsx
Project card
frontend/src/components/ProjectGallery/ProjectGallery.css
Gallery styles
frontend/src/components/ConfirmDialog/ConfirmDialog.tsx
Confirm modal
frontend/src/components/ConfirmDialog/ConfirmDialog.css
Dialog styles
frontend/src/components/EditableProjectName/EditableProjectName.tsx
Inline name editor
frontend/src/App.css
Minor additions for back button, save indicator

Modified Files (5)
File
Change
frontend/src/App.tsx
Storage init, project list state, open/delete/rename/duplicate handlers, context hydration
frontend/src/context/ProjectContext.tsx
initialState prop, renameProject method
frontend/src/context/ChatMessagesContext.tsx
initialMessages prop
frontend/src/pages/WelcomePage.tsx
New props, gallery section, updated CTA
frontend/src/components/AppLayout/AppLayout.tsx
useAutoSave, save indicator, back button, editable name


Key Design Decisions
IndexedDB over localStorage: Projects can be megabytes; localStorage caps at 5-10MB total
Raw IndexedDB, no idb library: Operations are simple CRUD, avoids new dependency
Chat embedded in project record: Atomic consistency, no cross-store joins
Undo/redo NOT persisted: Session-scoped is correct UX; the stack is large and ephemeral
Context re-key on project switch: <ProjectProvider key={projectId}> forces clean unmount/remount
No React Router: Keeps existing useState page-switching pattern; not enough pages to justify it yet

Verification
Auto-save: Create a project, verify data appears in DevTools > Application > IndexedDB > ai_app_builder_db > projects
Auto-restore: Refresh the page, verify the project gallery shows the saved project, click to resume
Gallery: Create 3+ projects, verify all appear sorted by last-updated
Rename: Rename from gallery card and builder header, verify persisted after refresh
Delete: Delete a project, confirm it's gone from gallery and IndexedDB
Duplicate: Fork a project, verify both exist independently
Edge cases: Test in incognito mode (graceful degradation), test with large projects

