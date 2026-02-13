import { useState, useEffect } from 'react';
import type { SerializedProjectState } from '@/shared';
import type { ChatMessage } from '@/components';
import {
  ProjectProvider,
  ChatMessagesProvider,
  GenerationProvider,
  AutoRepairProvider,
  VersionProvider,
  PreviewErrorProvider,
  ErrorAggregatorProvider
} from './context';
import { ErrorBoundary, AppLayout } from './components';
import { WelcomePage } from './pages';
import {
  storageService,
  type StoredProject,
  toSerializedProjectState,
  deserializeChatMessages,
} from '@/services/storage';
import './App.css';

/**
 * Represents the entry state for the builder.
 */
interface BuilderEntryState {
  initialPrompt?: string;
  restoredProject?: {
    projectState: SerializedProjectState;
    messages: ChatMessage[];
  };
}

/**
 * Main application component.
 * Provides the chat and version contexts and renders the main layout.
 * Wrapped with ErrorBoundary for comprehensive error handling.
 *
 * Requirements: 8.5, 11.1, 11.2, 11.3
 */
function App() {
  const [currentPage, setCurrentPage] = useState<'welcome' | 'builder'>('welcome');
  const [isInitializing, setIsInitializing] = useState(true);
  const [savedProjects, setSavedProjects] = useState<StoredProject[]>([]);
  const [builderEntry, setBuilderEntry] = useState<BuilderEntryState | null>(null);

  // Initialize storage on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        await storageService.initialize();
        const projects = await storageService.getAllProjects();
        setSavedProjects(projects);
      } catch (error) {
        console.error('Failed to initialize storage:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initStorage();
  }, []);

  // Refresh project list
  const refreshProjectList = async () => {
    try {
      const projects = await storageService.getAllProjects();
      setSavedProjects(projects);
    } catch (error) {
      console.error('Failed to refresh project list:', error);
    }
  };

  const handleEnterApp = (prompt?: string) => {
    setBuilderEntry({ initialPrompt: prompt });
    setCurrentPage('builder');
  };

  const handleOpenProject = async (projectId: string) => {
    try {
      const storedProject = await storageService.getProject(projectId);
      if (!storedProject) {
        console.error('Project not found:', projectId);
        return;
      }

      // Hydrate project state and messages
      const projectState = toSerializedProjectState(storedProject);
      const messages = deserializeChatMessages(storedProject.chatMessages);

      setBuilderEntry({
        restoredProject: {
          projectState,
          messages,
        },
      });
      setCurrentPage('builder');
    } catch (error) {
      console.error('Failed to open project:', error);
    }
  };

  const handleBackToDashboard = async () => {
    await refreshProjectList();
    setBuilderEntry(null);
    setCurrentPage('welcome');
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await storageService.deleteProject(projectId);
      await refreshProjectList();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleRenameProject = async (projectId: string, newName: string) => {
    try {
      await storageService.renameProject(projectId, newName);
      await refreshProjectList();
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  };

  const handleDuplicateProject = async (projectId: string) => {
    try {
      await storageService.duplicateProject(projectId);
      await refreshProjectList();
    } catch (error) {
      console.error('Failed to duplicate project:', error);
    }
  };

  const handleGlobalError = (error: Error) => {
    console.error('Global error caught:', error);
  };

  // Show loading state during initialization
  if (isInitializing) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '0.875rem',
        color: 'hsl(var(--muted-foreground))',
      }}>
        Initializing...
      </div>
    );
  }

  if (currentPage === 'welcome') {
    return (
      <WelcomePage
        onEnterApp={handleEnterApp}
        onOpenProject={handleOpenProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        savedProjects={savedProjects}
      />
    );
  }

  // Extract restored state if available
  const initialState = builderEntry?.restoredProject?.projectState;
  const initialMessages = builderEntry?.restoredProject?.messages;
  const initialPrompt = builderEntry?.initialPrompt;

  // Use project ID as key to force remount when switching projects
  const projectKey = initialState?.id || 'new-project';

  return (
    <ErrorBoundary
      onError={handleGlobalError}
      errorMessage="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <ErrorAggregatorProvider key={projectKey}>
        <ProjectProvider initialState={initialState}>
          <ChatMessagesProvider initialMessages={initialMessages}>
            <GenerationProvider>
              <PreviewErrorProvider>
                <AutoRepairProvider>
                  <AppLayout
                    initialPrompt={initialPrompt}
                    onBackToDashboard={handleBackToDashboard}
                  />
                </AutoRepairProvider>
              </PreviewErrorProvider>
            </GenerationProvider>
          </ChatMessagesProvider>
        </ProjectProvider>
      </ErrorAggregatorProvider>
    </ErrorBoundary>
  );
}

export default App;
