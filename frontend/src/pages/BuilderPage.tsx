import type { SerializedProjectState } from '@ai-app-builder/shared/types';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';

import type { ChatMessage } from '@/components';
import { ErrorBoundary, AppLayout } from '@/components';
import {
  ProjectProvider,
  ChatMessagesProvider,
  GenerationProvider,
  AutoRepairProvider,
  PreviewErrorProvider,
  ErrorAggregatorProvider,
  useProjectState,
} from '@/context';
import {
  toSerializedProjectState,
  deserializeChatMessages,
} from '@/services/storage';
import { hybridStorageService } from '@/services/storage/HybridStorageService';
import { createLogger } from '@/utils/logger';

/**
 * URL sync component that updates the URL when a new project gets an ID.
 * Must be rendered inside ProjectProvider to access project state.
 */
function ProjectUrlSync() {
  const { projectState } = useProjectState();
  const { projectId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // When starting at /project/new, update URL to /project/{id} after first generation
    if (projectId === 'new' && projectState?.id) {
      navigate(`/project/${projectState.id}`, { replace: true });
    }
  }, [projectId, projectState?.id, navigate]);

  return null;
}

/**
 * Builder page component that handles project routing.
 * Routes:
 * - /project/new - New project with optional ?prompt= query param
 * - /project/:projectId - Existing project loaded from storage
 */
const builderLogger = createLogger('BuilderPage');

export function BuilderPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLoading, setIsLoading] = useState(true);
  const [initialState, setInitialState] = useState<SerializedProjectState | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>();

  // Hydrate project on mount or when projectId changes
  useEffect(() => {
    const loadProject = async () => {
      if (projectId === 'new') {
        // New project mode — may have template files from router state
        const locationState = location.state as { files?: Record<string, string>; name?: string } | null;
        if (locationState?.files) {
          setInitialState({
            id: crypto.randomUUID(),
            name: locationState.name || 'My Template',
            description: '',
            files: locationState.files,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersionId: '',
          });
          setInitialPrompt(undefined);
        } else {
          const prompt = searchParams.get('prompt') || undefined;
          setInitialPrompt(prompt);
          setInitialState(null);
        }
        setInitialMessages([]);
        setIsLoading(false);
      } else if (projectId) {
        // Load existing project from storage
        try {
          const storedProject = await hybridStorageService.getProject(projectId);
          if (!storedProject) {
            builderLogger.error('Project not found', { projectId });
            navigate('/', { replace: true });
            return;
          }

          setInitialState(toSerializedProjectState(storedProject));
          setInitialMessages(deserializeChatMessages(storedProject.chatMessages));
          setInitialPrompt(undefined);
        } catch (error) {
          builderLogger.error('Failed to load project', { error });
          navigate('/', { replace: true });
          return;
        }
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId, searchParams, navigate, location.state]);

  const handleBackToDashboard = () => {
    navigate('/');
  };

  const handleGlobalError = (error: Error) => {
    builderLogger.error('Global error caught', { error });
  };

  // Show loading state while hydrating
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontSize: '0.875rem',
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        Loading project...
      </div>
    );
  }

  // Use project ID as key to force remount when switching projects
  const projectKey = initialState?.id || 'new-project';

  return (
    <ErrorBoundary
      onError={handleGlobalError}
      errorMessage="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <ErrorAggregatorProvider key={projectKey}>
        <ProjectProvider initialState={initialState}>
          <ProjectUrlSync />
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

export default BuilderPage;
