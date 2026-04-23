/**
 * @module App
 * @description Root application component with route-level code splitting.
 * Routes:
 * - `/` – Welcome page (project gallery)
 * - `/login` – Login/signup page
 * - `/project/:projectId` – Builder page (new or existing project)
 * - `/settings/agents` – Agent model configuration settings
 */
import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton/PageSkeleton';
import { storageService, type ProjectMetadata } from '@/services/storage';
import { createLogger } from '@/utils/logger';
import { AuthProvider } from '@/context/AuthContext';
import { useAuthState } from '@/context/AuthContext.context';
import { ToastProvider } from '@/context/ToastContext';
import { ToastContainer } from '@/components/ToastContainer/ToastContainer';
import { AuthGuard } from '@/components/AuthGuard/AuthGuard';

import './App.css';

// Route-level code splitting: each page loads as a separate chunk
const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const BuilderPage = lazy(() => import('./pages/BuilderPage'));
const AgentSettingsPage = lazy(() => import('./pages/AgentSettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

const appLogger = createLogger('App');

/**
 * Root component — wraps everything in AuthProvider so AppInner can consume auth state.
 */
function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
      <ToastContainer />
    </ToastProvider>
  );
}

/**
 * Inner component rendered inside AuthProvider.
 */
function AppInner() {
  const location = useLocation();
  const { user, isLoading: isAuthLoading } = useAuthState();
  const [isInitializing, setIsInitializing] = useState(true);
  const [savedProjects, setSavedProjects] = useState<ProjectMetadata[]>([]);

  // Initialize storage on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        await storageService.initialize();
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

  // Refresh project list when auth settles after sign-in/out
  useEffect(() => {
    if (isAuthLoading || isInitializing) return;

    storageService.getAllProjectMetadata()
      .then(setSavedProjects)
      .catch((error) => appLogger.error('Failed to refresh project list after auth change', { error }));
  }, [user?.id, isAuthLoading, isInitializing]);

  const refreshProjectList = async () => {
    try {
      const projects = await storageService.getAllProjectMetadata();
      setSavedProjects(projects);
    } catch (error) {
      appLogger.error('Failed to refresh project list', { error });
    }
  };

  // Re-sync gallery state whenever the user returns to the welcome page.
  useEffect(() => {
    if (isInitializing || isAuthLoading || location.pathname !== '/') return;
    refreshProjectList();
  }, [location.pathname, user?.id, isInitializing, isAuthLoading]);

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
        path="/login"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/project/:projectId"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <BuilderPage />
            </Suspense>
          </AuthGuard>
        }
      />
      <Route
        path="/settings/agents"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <AgentSettingsPage />
            </Suspense>
          </AuthGuard>
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
