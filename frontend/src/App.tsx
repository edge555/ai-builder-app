/**
 * @module App
 * @description Root application component with route-level code splitting.
 * Routes:
 * - `/` – Welcome page (project gallery)
 * - `/project/:projectId` – Builder page (new or existing project)
 * - `/settings/agents` – Agent model configuration settings
 *
 * Manages global storage initialization and project list refresh.
 *
 * @requires react - Lazy, Suspense, useState, useEffect hooks
 * @requires react-router-dom - Routes, Route, useNavigate
 * @requires @/services/storage - storageService, ProjectMetadata
 * @requires @/components/PageSkeleton - Loading placeholder
 * @requires @/utils/logger - Structured logging
 */
import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton/PageSkeleton';
import { storageService, type ProjectMetadata } from '@/services/storage';
import { createLogger } from '@/utils/logger';

import './App.css';

// Route-level code splitting: each page loads as a separate chunk
const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const BuilderPage = lazy(() => import('./pages/BuilderPage'));
const AgentSettingsPage = lazy(() => import('./pages/AgentSettingsPage'));

const appLogger = createLogger('App');

/**
 * Main application component with route-based navigation.
 * Routes:
 * - / - Welcome page with project gallery
 * - /project/new - New project builder (with optional ?prompt= query param)
 * - /project/:projectId - Existing project builder
 *
 * Requirements: 8.5, 11.1, 11.2, 11.3
 */
function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [savedProjects, setSavedProjects] = useState<ProjectMetadata[]>([]);

  // Initialize storage on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        await storageService.initialize();
        // Use metadata method for better performance - no need to load files/messages
        const projects = await storageService.getAllProjectMetadata();
        setSavedProjects(projects);
      } catch (error) {
        appLogger.error('Failed to initialize storage', { error });
      } finally {
        setIsInitializing(false);
      }
    };

    initStorage();
  }, []);

  // Refresh project list
  const refreshProjectList = async () => {
    try {
      // Use metadata method for better performance - no need to load files/messages
      const projects = await storageService.getAllProjectMetadata();
      setSavedProjects(projects);
    } catch (error) {
      appLogger.error('Failed to refresh project list', { error });
    }
  };

  // Show loading state during initialization
  if (isInitializing) {
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
        Initializing...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <WelcomePageWrapper
              savedProjects={savedProjects}
              onProjectsChanged={refreshProjectList}
            />
          </Suspense>
        }
      />
      <Route
        path="/project/:projectId"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <BuilderPage />
          </Suspense>
        }
      />
      <Route
        path="/settings/agents"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <AgentSettingsPage />
          </Suspense>
        }
      />
    </Routes>
  );
}

/**
 * Wrapper component that connects WelcomePage callbacks to router navigation.
 */
function WelcomePageWrapper({
  savedProjects,
  onProjectsChanged,
}: {
  savedProjects: ProjectMetadata[];
  onProjectsChanged: () => Promise<void>;
}) {
  const navigate = useNavigate();

  const handleEnterApp = (prompt?: string, files?: Record<string, string>, name?: string) => {
    if (files) {
      navigate('/project/new', { state: { files, name } });
    } else if (prompt) {
      navigate(`/project/new?prompt=${encodeURIComponent(prompt)}`);
    } else {
      navigate('/project/new');
    }
  };

  const handleOpenProject = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await storageService.deleteProject(projectId);
      await onProjectsChanged();
    } catch (error) {
      appLogger.error('Failed to delete project', { error });
    }
  };


  const handleDuplicateProject = async (projectId: string) => {
    try {
      await storageService.duplicateProject(projectId);
      await onProjectsChanged();
    } catch (error) {
      appLogger.error('Failed to duplicate project', { error });
    }
  };

  return (
    <WelcomePage
      onEnterApp={handleEnterApp}
      onOpenProject={handleOpenProject}
      onDeleteProject={handleDeleteProject}
      onDuplicateProject={handleDuplicateProject}
      savedProjects={savedProjects}
    />
  );
}

export default App;
