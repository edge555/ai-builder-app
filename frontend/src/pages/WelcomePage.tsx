import { ArrowRight, Sparkles, Plus, Eye, Zap, Download, Code, BarChart2, Globe, CheckSquare, ShoppingCart } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { OnboardingOverlay, shouldShowOnboarding } from '@/components/OnboardingOverlay/OnboardingOverlay';
import { ProjectGallery } from '@/components/ProjectGallery/ProjectGallery';
import { SiteFooter } from '@/components/SiteFooter/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader/SiteHeader';
import { TemplateGrid } from '@/components/TemplateGrid/TemplateGrid';
import { useAuthState } from '@/context/AuthContext.context';
import { initialSuggestions } from '@/data/prompt-suggestions';
import { starterTemplates } from '@/data/templates';
import { storageService, type ProjectMetadata, type UserTemplate } from '@/services/storage';
import './WelcomePage.css';

interface WelcomePageProps {
  onEnterApp: (initialPrompt?: string, files?: Record<string, string>, name?: string) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
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

const SUGGESTION_ICONS: Record<string, React.ElementType> = {
  dashboard: BarChart2,
  landing: Globe,
  todo: CheckSquare,
  ecommerce: ShoppingCart,
};

const suggestionChips = initialSuggestions.map(s => ({
  label: s.label,
  prompt: s.prompt,
  icon: SUGGESTION_ICONS[s.id] ?? Sparkles,
}));

export function WelcomePage({
  onEnterApp,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  savedProjects,
  isLoadingProjects = false,
}: WelcomePageProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthState();
  const hasProjects = savedProjects.length > 0;

  const [promptInput, setPromptInput] = useState('');
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);

  useEffect(() => {
    storageService.getAllTemplates().then(setUserTemplates).catch(() => {});
  }, []);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    isOpen: false,
    projectId: null,
    projectName: null,
  });
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show onboarding only for authenticated users who haven't seen it yet.
  // Wait until auth finishes loading so we don't flash it for unauthenticated users.
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && shouldShowOnboarding()) {
      setShowOnboarding(true);
    }
  }, [isAuthLoading, isAuthenticated]);
  const [isScrolled, setIsScrolled] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  // Preload BuilderPage chunk on hover/intent so navigation feels instant.
  const preloadBuilderPage = useCallback(() => {
    void import('./BuilderPage');
  }, []);

  // Also preload after the page settles via requestIdleCallback.
  // This covers fast users who click without hovering.
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => {
        void import('./BuilderPage');
      });
      return () => window.cancelIdleCallback(id);
    } else {
      // Safari fallback
      const id = setTimeout(() => {
        void import('./BuilderPage');
      }, 2000);
      return () => clearTimeout(id);
    }
  }, []);

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

  const handleSelectUserTemplate = (template: UserTemplate) => {
    onEnterApp(undefined, template.files, template.name);
  };

  const handleDeleteUserTemplate = async (id: string) => {
    try {
      await storageService.deleteTemplate(id);
      setUserTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // Silently ignore delete errors
    }
  };

  return (
    <div className="welcome-page">
      {/* Header */}
      <SiteHeader
        scrolled={isScrolled}
        actions={
          hasProjects ? (
            <button
              className="welcome-header-new-project-btn"
              onClick={() => onEnterApp()}
              aria-label="Create new project"
            >
              <Plus size={16} />
              <span>New Project</span>
            </button>
          ) : undefined
        }
      />

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
              onMouseEnter={preloadBuilderPage}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </form>

        {/* Suggestion Chips */}
        <div className="welcome-hero-suggestions">
          {suggestionChips.map((chip) => (
            <button
              key={chip.label}
              className="welcome-hero-suggestion-chip"
              onClick={() => handleSuggestionClick(chip.prompt)}
              onMouseEnter={preloadBuilderPage}
              type="button"
            >
              <chip.icon size={15} className="welcome-hero-suggestion-icon" />
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      {/* Project Gallery - always shown, handles its own loading/empty states */}
      <ProjectGallery
        projects={savedProjects}
        onOpenProject={onOpenProject}
        onDuplicateProject={onDuplicateProject}
        onDeleteProject={handleDeleteRequest}
        isLoading={isLoadingProjects}
        onCreateProject={() => onEnterApp()}
        onPreloadBuilder={preloadBuilderPage}
      />

      {/* Templates Section */}
      <section className="welcome-templates ui-section">
        <h2 className="welcome-templates-title">Start from a template</h2>
        <TemplateGrid
          templates={starterTemplates}
          onSelect={(template) => onEnterApp(template.prompt)}
          userTemplates={userTemplates}
          onSelectUserTemplate={handleSelectUserTemplate}
          onDeleteUserTemplate={handleDeleteUserTemplate}
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
      <SiteFooter />

      {/* Onboarding Overlay */}
      {showOnboarding && (
        <OnboardingOverlay
          onDismiss={() => setShowOnboarding(false)}
          onGeneratePrompt={(prompt) => onEnterApp(prompt)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteConfirm.projectName ?? 'this project'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

export default WelcomePage;
