import { ArrowRight, Sparkles, Plus, Eye, Zap, Download, Code } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { ProjectGallery } from '@/components/ProjectGallery/ProjectGallery';
import { TemplateGrid } from '@/components/TemplateGrid/TemplateGrid';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { starterTemplates } from '@/data/templates';
import type { ProjectMetadata } from '@/services/storage';
import './WelcomePage.css';

interface WelcomePageProps {
  onEnterApp: (initialPrompt?: string) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onDuplicateProject: (projectId: string) => void;
  savedProjects: ProjectMetadata[];
  isLoadingProjects?: boolean;
}

interface DeleteConfirmState {
  isOpen: boolean;
  projectId: string | null;
  projectName: string | null;
}

const features = [
  {
    icon: Eye,
    title: 'Live Preview',
    description: 'See changes instantly as you describe your ideas',
    accentColor: 'hsl(200 80% 60%)', // Blue
  },
  {
    icon: Zap,
    title: 'Fast Generation',
    description: 'Complete apps in seconds, not hours',
    accentColor: 'hsl(45 100% 55%)', // Yellow
  },
  {
    icon: Download,
    title: 'Export Ready',
    description: 'Download your project as a ZIP file',
    accentColor: 'hsl(150 60% 50%)', // Green
  },
  {
    icon: Code,
    title: 'Code Editor',
    description: 'Full Monaco editor with syntax highlighting',
    accentColor: 'hsl(280 70% 60%)', // Purple
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
  isLoadingProjects = false,
}: WelcomePageProps) {
  const hasProjects = savedProjects.length > 0;

  const [promptInput, setPromptInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    isOpen: false,
    projectId: null,
    projectName: null,
  });
  const [isScrolled, setIsScrolled] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  // Detect when user has scrolled past the hero section
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // When hero is NOT intersecting (not visible), show shadow
        setIsScrolled(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-80px 0px 0px 0px', // Trigger when hero is 80px from top
      }
    );

    const currentHeroRef = heroRef.current;
    if (currentHeroRef) {
      observer.observe(currentHeroRef);
    }

    return () => {
      if (currentHeroRef) {
        observer.unobserve(currentHeroRef);
      }
    };
  }, []);

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
      <header className={`welcome-header ${isScrolled ? 'welcome-header-scrolled' : ''}`}>
        <div className="welcome-header-content">
          <div className="welcome-header-brand">
            <div className="welcome-header-logo">
              <Sparkles size={18} />
            </div>
            <span className="welcome-header-title">AI App Builder</span>
          </div>
          <div className="welcome-header-actions">
            {hasProjects && (
              <button
                className="welcome-header-new-project-btn"
                onClick={() => onEnterApp()}
                aria-label="Create new project"
              >
                <Plus size={16} />
                <span>New Project</span>
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section ref={heroRef} className="welcome-hero ui-section">
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

      {/* Project Gallery - always shown, handles its own loading/empty states */}
      <ProjectGallery
        projects={savedProjects}
        onOpenProject={onOpenProject}
        onRenameProject={onRenameProject}
        onDuplicateProject={onDuplicateProject}
        onDeleteProject={handleDeleteRequest}
        isLoading={isLoadingProjects}
        onCreateProject={() => onEnterApp()}
      />

      {/* Templates Section */}
      <section className="welcome-templates ui-section">
        <h2 className="welcome-templates-title">Start from a template</h2>
        <TemplateGrid
          templates={starterTemplates}
          onSelect={(template) => onEnterApp(template.prompt)}
        />
      </section>

      {/* Features Section */}
      <section className="welcome-features ui-section">
        <div className="welcome-features-grid">
          {features.map((feature) => {
            const IconComponent = feature.icon;
            return (
              <div key={feature.title} className="welcome-feature-card">
                <div
                  className="welcome-feature-icon"
                  style={{ '--accent-color': feature.accentColor } as React.CSSProperties}
                >
                  <IconComponent size={24} strokeWidth={2} />
                </div>
                <h3 className="welcome-feature-title">{feature.title}</h3>
                <p className="welcome-feature-desc">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="welcome-footer">
        <div className="welcome-footer-container">
          <p className="welcome-footer-text">© 2026 AI App Builder</p>
          <div className="welcome-footer-links">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="welcome-footer-link">
              GitHub
            </a>
            <span className="footer-dot">•</span>
            <a href="#" className="welcome-footer-link">
              Built with AI
            </a>
          </div>
        </div>
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
