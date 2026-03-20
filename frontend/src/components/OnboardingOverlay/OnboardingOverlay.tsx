import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, ArrowLeft, Globe, LayoutDashboard, ShoppingCart, ClipboardList, Sparkles } from 'lucide-react';
import './OnboardingOverlay.css';

const ONBOARDING_SEEN_KEY = 'onboarding-overlay-seen';

// ─── Step 1: Project type ──────────────────────────────────────────────────

interface ProjectType {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const PROJECT_TYPES: ProjectType[] = [
  { id: 'spa', label: 'Single Page App', description: 'Client-side React application', icon: <Globe size={20} /> },
  { id: 'dashboard', label: 'Dashboard', description: 'Data visualization & analytics', icon: <LayoutDashboard size={20} /> },
  { id: 'ecommerce', label: 'E-Commerce', description: 'Product catalog & shopping cart', icon: <ShoppingCart size={20} /> },
  { id: 'task-app', label: 'Task Manager', description: 'Todo lists & project tracking', icon: <ClipboardList size={20} /> },
  { id: 'landing', label: 'Landing Page', description: 'Marketing page with sections', icon: <Sparkles size={20} /> },
];

// ─── Step 2: Features ──────────────────────────────────────────────────────

interface Feature {
  id: string;
  label: string;
}

const FEATURES: Feature[] = [
  { id: 'auth', label: 'User login' },
  { id: 'dark-mode', label: 'Dark mode' },
  { id: 'search', label: 'Search & filter' },
  { id: 'responsive', label: 'Mobile responsive' },
  { id: 'animations', label: 'Animations' },
  { id: 'charts', label: 'Charts & graphs' },
  { id: 'forms', label: 'Form validation' },
  { id: 'notifications', label: 'Notifications' },
];

// ─── Step 3: Design preference ─────────────────────────────────────────────

interface DesignStyle {
  id: string;
  label: string;
  description: string;
}

const DESIGN_STYLES: DesignStyle[] = [
  { id: 'minimal', label: 'Minimal', description: 'Clean lines, lots of whitespace' },
  { id: 'colorful', label: 'Colorful', description: 'Bold colors, vibrant accents' },
  { id: 'corporate', label: 'Professional', description: 'Business-ready, polished look' },
];

// ─── Prompt builder ────────────────────────────────────────────────────────

function buildPromptFromChoices(
  projectType: string | null,
  features: Set<string>,
  designStyle: string | null
): string {
  const typeLabels: Record<string, string> = {
    spa: 'a React application',
    dashboard: 'an analytics dashboard with charts and data tables',
    ecommerce: 'an e-commerce product catalog with shopping cart',
    'task-app': 'a task management app with lists and completion tracking',
    landing: 'a landing page with hero section, features, and call-to-action',
  };

  const featureLabels: Record<string, string> = {
    auth: 'user authentication with login and signup',
    'dark-mode': 'dark mode toggle',
    search: 'search and filter functionality',
    responsive: 'fully responsive mobile layout',
    animations: 'smooth transitions and micro-interactions',
    charts: 'interactive charts and data visualization',
    forms: 'form validation with error messages',
    notifications: 'toast notifications for feedback',
  };

  const styleLabels: Record<string, string> = {
    minimal: 'Use a minimal, clean design with plenty of whitespace.',
    colorful: 'Use a vibrant, colorful design with bold accent colors.',
    corporate: 'Use a professional, polished design suitable for business.',
  };

  let prompt = `Build ${typeLabels[projectType ?? 'spa'] ?? 'a React application'}`;

  const featureList = Array.from(features)
    .map(f => featureLabels[f])
    .filter(Boolean);
  if (featureList.length > 0) {
    prompt += ` with ${featureList.join(', ')}`;
  }

  prompt += '.';

  if (designStyle && styleLabels[designStyle]) {
    prompt += ` ${styleLabels[designStyle]}`;
  }

  return prompt;
}

// ─── Component ─────────────────────────────────────────────────────────────

interface OnboardingOverlayProps {
  onDismiss: () => void;
  /** Called with generated prompt when user completes the wizard */
  onGeneratePrompt?: (prompt: string) => void;
}

export function OnboardingOverlay({ onDismiss, onGeneratePrompt }: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const totalSteps = 3;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
    onDismiss();
  }, [onDismiss]);

  const handleComplete = useCallback(() => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
    const prompt = buildPromptFromChoices(selectedType, selectedFeatures, selectedStyle);
    onGeneratePrompt?.(prompt);
    onDismiss();
  }, [onDismiss, onGeneratePrompt, selectedType, selectedFeatures, selectedStyle]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatures(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') handleNext();
    else if (e.key === 'ArrowLeft') handlePrev();
  };

  const isLast = currentStep === totalSteps - 1;

  return (
    <dialog
      ref={dialogRef}
      className="onboarding-overlay"
      aria-labelledby="onboarding-title"
      onKeyDown={handleKeyDown}
    >
      <div className="onboarding-content">
        <div className="onboarding-step-indicator">
          {Array.from({ length: totalSteps }, (_, i) => (
            <button
              key={i}
              className={`onboarding-dot${i === currentStep ? ' onboarding-dot--active' : ''}${i < currentStep ? ' onboarding-dot--done' : ''}`}
              onClick={() => i <= currentStep && setCurrentStep(i)}
              aria-label={`Step ${i + 1}`}
              type="button"
            />
          ))}
        </div>

        {/* Step 1: Project Type */}
        {currentStep === 0 && (
          <>
            <h2 id="onboarding-title" className="onboarding-title">What are you building?</h2>
            <p className="onboarding-description">Pick a starting point — you can always change direction later.</p>
            <div className="onboarding-choices">
              {PROJECT_TYPES.map(pt => (
                <button
                  key={pt.id}
                  type="button"
                  className={`onboarding-choice${selectedType === pt.id ? ' onboarding-choice--selected' : ''}`}
                  onClick={() => setSelectedType(pt.id)}
                >
                  <span className="onboarding-choice-icon">{pt.icon}</span>
                  <span className="onboarding-choice-text">
                    <span className="onboarding-choice-label">{pt.label}</span>
                    <span className="onboarding-choice-desc">{pt.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: Features */}
        {currentStep === 1 && (
          <>
            <h2 id="onboarding-title" className="onboarding-title">Add features</h2>
            <p className="onboarding-description">Select any features you want included. All are optional.</p>
            <div className="onboarding-features">
              {FEATURES.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`onboarding-feature-chip${selectedFeatures.has(f.id) ? ' onboarding-feature-chip--selected' : ''}`}
                  onClick={() => toggleFeature(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 3: Design */}
        {currentStep === 2 && (
          <>
            <h2 id="onboarding-title" className="onboarding-title">Design style</h2>
            <p className="onboarding-description">Choose the overall look and feel.</p>
            <div className="onboarding-styles">
              {DESIGN_STYLES.map(ds => (
                <button
                  key={ds.id}
                  type="button"
                  className={`onboarding-style${selectedStyle === ds.id ? ' onboarding-style--selected' : ''}`}
                  onClick={() => setSelectedStyle(ds.id)}
                >
                  <span className="onboarding-style-label">{ds.label}</span>
                  <span className="onboarding-style-desc">{ds.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="onboarding-actions">
          {currentStep > 0 && (
            <button
              type="button"
              className="onboarding-btn onboarding-btn--secondary"
              onClick={handlePrev}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <button
            type="button"
            className="onboarding-btn onboarding-btn--primary"
            onClick={handleNext}
            autoFocus
          >
            {isLast ? 'Generate App' : 'Next'}
            <ArrowRight size={16} />
          </button>
        </div>

        <button
          type="button"
          className="onboarding-skip"
          onClick={handleDismiss}
        >
          Skip — I'll write my own prompt
        </button>
      </div>
    </dialog>
  );
}

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
}
