import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { WelcomePage, BuilderPage } from './pages';
import { storageService, type StoredProject } from '@/services/storage';
import './App.css';

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
  const [savedProjects, setSavedProjects] = useState<StoredProject[]>([]);

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
          <WelcomePageWrapper
            savedProjects={savedProjects}
            onProjectsChanged={refreshProjectList}
          />
        }
      />
      <Route path="/project/:projectId" element={<BuilderPage />} />
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
  savedProjects: StoredProject[];
  onProjectsChanged: () => Promise<void>;
}) {
  const navigate = useNavigate();

  const handleEnterApp = (prompt?: string) => {
    if (prompt) {
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
      console.error('Failed to delete project:', error);
    }
  };

  const handleRenameProject = async (projectId: string, newName: string) => {
    try {
      await storageService.renameProject(projectId, newName);
      await onProjectsChanged();
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  };

  const handleDuplicateProject = async (projectId: string) => {
    try {
      await storageService.duplicateProject(projectId);
      await onProjectsChanged();
    } catch (error) {
      console.error('Failed to duplicate project:', error);
    }
  };

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

export default App;
