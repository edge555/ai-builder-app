/**
 * @module App
 * @description Root application component with route-level code splitting.
 * Routes:
 * - `/` – Welcome page (project gallery)
 * - `/login` – Login/signup page
 * - `/project/:projectId` – Builder page (new or existing project)
 * - `/settings/agents` – Agent model configuration settings
 *
 * Manages global storage initialization and project list refresh.
 * Wires auth state changes to hybridStorageService for cloud/local switching.
 *
 * @requires react - Lazy, Suspense, useState, useEffect hooks
 * @requires react-router-dom - Routes, Route, useNavigate
 * @requires @/services/storage - hybridStorageService, ProjectMetadata
 * @requires @/components/PageSkeleton - Loading placeholder
 * @requires @/utils/logger - Structured logging
 */
import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton/PageSkeleton';
import { storageService, type ProjectMetadata } from '@/services/storage';
import { hybridStorageService } from '@/services/storage/HybridStorageService';
import { createLogger } from '@/utils/logger';
import { AuthProvider } from '@/context/AuthContext';
import { useAuthState } from '@/context/AuthContext.context';
import { ToastProvider } from '@/context/ToastContext';
import { ToastContainer } from '@/components/ToastContainer/ToastContainer';
import { AuthGuard } from '@/components/AuthGuard/AuthGuard';
import { ImportLocalProjectsDialog } from '@/components/ImportLocalProjectsDialog/ImportLocalProjectsDialog';

import './App.css';

// Route-level code splitting: each page loads as a separate chunk
const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const BuilderPage = lazy(() => import('./pages/BuilderPage'));
const AgentSettingsPage = lazy(() => import('./pages/AgentSettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Admin pages
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminWorkspaceListPage = lazy(() => import('./pages/admin/AdminWorkspaceListPage'));
const AdminWorkspaceCreatePage = lazy(() => import('./pages/admin/AdminWorkspaceCreatePage'));
const AdminWorkspacePage = lazy(() => import('./pages/admin/AdminWorkspacePage'));
const OrgSettingsPage = lazy(() => import('./pages/admin/OrgSettingsPage'));

// Member pages
const MemberBuilderPage = lazy(() => import('./pages/MemberBuilderPage'));
const MemberJoinPage = lazy(() => import('./pages/MemberJoinPage'));
const MemberWorkspacePickerPage = lazy(() => import('./pages/MemberWorkspacePickerPage'));

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
 * Wires auth state changes to hybridStorageService and manages the project list.
 */
function AppInner() {
  const { user, isLoading: isAuthLoading } = useAuthState();
  const [isInitializing, setIsInitializing] = useState(true);
  const [savedProjects, setSavedProjects] = useState<ProjectMetadata[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Sync auth state to hybrid storage whenever user changes
  useEffect(() => {
    hybridStorageService.setAuthenticated(user?.id ?? null);
  }, [user?.id]);

  // Initialize storage on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        await hybridStorageService.initialize();
        const projects = await hybridStorageService.getAllProjectMetadata();
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

    hybridStorageService.getAllProjectMetadata()
      .then(setSavedProjects)
      .catch((error) => appLogger.error('Failed to refresh project list after auth change', { error }));
  }, [user?.id, isAuthLoading, isInitializing]);

  // Show import dialog once after first login if local projects exist
  useEffect(() => {
    if (!user || isAuthLoading || isInitializing) return;

    const checkImport = async () => {
      try {
        const alreadyImported = await storageService.getMetadata('localProjectsImported');
        if (alreadyImported) return;
        const localProjects = await storageService.getAllProjectMetadata();
        if (localProjects.length > 0) {
          setShowImportDialog(true);
        }
      } catch (error) {
        appLogger.error('Failed to check local import status', { error });
      }
    };

    checkImport();
  }, [user?.id, isAuthLoading, isInitializing]);

  const refreshProjectList = async () => {
    try {
      const projects = await hybridStorageService.getAllProjectMetadata();
      setSavedProjects(projects);
    } catch (error) {
      appLogger.error('Failed to refresh project list', { error });
    }
  };

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
    <>
    <ImportLocalProjectsDialog
      isOpen={showImportDialog}
      onClose={() => setShowImportDialog(false)}
      onImported={refreshProjectList}
    />
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

      {/* Onboarding — instructor self-provision */}
      <Route
        path="/onboarding"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <OnboardingPage />
          </Suspense>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin/:orgId"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <AdminDashboardPage />
            </Suspense>
          </AuthGuard>
        }
      />
      <Route
        path="/admin/:orgId/workspaces/new"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <AdminWorkspaceCreatePage />
            </Suspense>
          </AuthGuard>
        }
      />
      <Route
        path="/admin/:orgId/workspaces/:wid"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <AdminWorkspacePage />
            </Suspense>
          </AuthGuard>
        }
      />
      <Route
        path="/admin/:orgId/workspaces"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <AdminWorkspaceListPage />
            </Suspense>
          </AuthGuard>
        }
      />
      <Route
        path="/admin/:orgId/settings"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <OrgSettingsPage />
            </Suspense>
          </AuthGuard>
        }
      />

      {/* Member routes */}
      <Route
        path="/join/:token"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <MemberJoinPage />
          </Suspense>
        }
      />
      <Route
        path="/w"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <MemberWorkspacePickerPage />
            </Suspense>
          </AuthGuard>
        }
      />
      <Route
        path="/w/:workspaceId"
        element={
          <AuthGuard>
            <Suspense fallback={<PageSkeleton />}>
              <MemberBuilderPage />
            </Suspense>
          </AuthGuard>
        }
      />
    </Routes>
    </>
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
      await hybridStorageService.deleteProject(projectId);
      await onProjectsChanged();
    } catch (error) {
      appLogger.error('Failed to delete project', { error });
    }
  };

  const handleDuplicateProject = async (projectId: string) => {
    try {
      await hybridStorageService.duplicateProject(projectId);
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
