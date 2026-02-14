import { useState } from 'react';
import { ArrowRight, Sparkles, Plus } from 'lucide-react';
import { starterTemplates } from '@/data/templates';
import { TemplateGrid } from '@/components/TemplateGrid/TemplateGrid';
import { ProjectGallery } from '@/components/ProjectGallery/ProjectGallery';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import type { StoredProject } from '@/services/storage';
import './WelcomePage.css';

interface WelcomePageProps {
  onEnterApp: (initialPrompt?: string) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onDuplicateProject: (projectId: string) => void;
  savedProjects: StoredProject[];
}

interface DeleteConfirmState {
  isOpen: boolean;
  projectId: string | null;
  projectName: string | null;
}

const features = [
  {
    icon: '🎨',
    title: 'Live Preview',
    description: 'See changes instantly as you describe your ideas',
  },
  {
    icon: '⚡',
    title: 'Fast Generation',
    description: 'Complete apps in seconds, not hours',
  },
  {
    icon: '📦',
    title: 'Export Ready',
    description: 'Download your project as a ZIP file',
  },
];

const suggestionChips = [
  'A todo app with categories',
  'Landing page for a SaaS product',
  'Analytics dashboard with charts',
];

export function WelcomePage({
  onEnterApp,
  onOpenProject,
  onDeleteProject,
  onRenameProject,
  onDuplicateProject,
  savedProjects,
}: WelcomePageProps) {
  const hasProjects = savedProjects.length > 0;

  const [promptInput, setPromptInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    isOpen: false,
    projectId: null,
    projectName: null,
  });

  const handleDeleteRequest = (projectId: string) => {
    const project = savedProjects.find(p => p.id === projectId);
    if (project) {
      setDeleteConfirm({
        isOpen: true,
        projectId,
        projectName: project.name,
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm.projectId) {
      onDeleteProject(deleteConfirm.projectId);
    }
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: null });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, projectId: null, projectName: null });
  };

  const handleRenameRequest = (projectId: string) => {
    const project = savedProjects.find(p => p.id === projectId);
    if (project) {
      const newName = prompt('Enter new project name:', project.name);
      if (newName && newName.trim()) {
        onRenameProject(projectId, newName.trim());
      }
    }
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptInput.trim()) {
      onEnterApp(promptInput.trim());
    } else {
      onEnterApp();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPromptInput(suggestion);
  };

  return (
    <div className="welcome-page">
      {/* Header */}
      <header className="welcome-header">
        <div className="welcome-header-content">
          <div className="welcome-header-brand">
            <div className="welcome-header-logo">
              <Sparkles size={18} />
            </div>
            <span className="welcome-header-title">AI App Builder</span>
          </div>
          <div className="welcome-header-actions">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="welcome-hero">
        <div className="welcome-hero-logo">
          <Sparkles size={24} />
        </div>
        <h1 className="welcome-hero-headline">
          Build apps with AI in seconds
        </h1>
        <p className="welcome-hero-subheadline">
          Describe your idea and watch it come to life. No coding required.
        </p>

        {/* Inline Prompt Input */}
        <form className="welcome-hero-prompt-form" onSubmit={handlePromptSubmit}>
          <div className="welcome-hero-prompt-wrapper">
            <textarea
              className="welcome-hero-prompt-input"
              placeholder="Describe the app you want to build..."
              value={promptInput}
              onChange={(e) => {
                setPromptInput(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePromptSubmit(e);
                }
              }}
              rows={1}
            />
            <button
              type="submit"
              className="welcome-hero-prompt-submit"
              aria-label="Start building"
              disabled={!promptInput.trim()}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </form>

        {/* Suggestion Chips */}
        <div className="welcome-hero-suggestions">
          {suggestionChips.map((suggestion) => (
            <button
              key={suggestion}
              className="welcome-hero-suggestion-chip"
              onClick={() => handleSuggestionClick(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      {/* Project Gallery - shown when there are saved projects */}
      {hasProjects && (
        <ProjectGallery
          projects={savedProjects}
          onOpenProject={onOpenProject}
          onRenameProject={handleRenameRequest}
          onDuplicateProject={onDuplicateProject}
          onDeleteProject={handleDeleteRequest}
        />
      )}

      {/* Templates Section */}
      <section className="welcome-templates">
        <h2 className="welcome-templates-title">Start from a template</h2>
        <TemplateGrid
          templates={starterTemplates}
          onSelect={(template) => onEnterApp(template.prompt)}
        />
      </section>

      {/* Features Section */}
      <section className="welcome-features">
        <div className="welcome-features-grid">
          {features.map((feature) => (
            <div key={feature.title} className="welcome-feature-card">
              <div className="welcome-feature-icon">{feature.icon}</div>
              <h3 className="welcome-feature-title">{feature.title}</h3>
              <p className="welcome-feature-desc">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="welcome-footer">
        <p className="welcome-footer-text">© 2026 AI App Builder</p>
      </footer>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteConfirm.projectName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

export default WelcomePage;
