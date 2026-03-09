import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Layout, FolderOpen, ArrowRight, ArrowLeft } from 'lucide-react';
import './OnboardingOverlay.css';

const ONBOARDING_SEEN_KEY = 'onboarding-overlay-seen';

const steps = [
  {
    icon: MessageSquare,
    title: 'Describe Your App',
    description: 'Type a prompt describing the app you want to build. Our AI will generate a complete working application for you.',
    accentColor: 'hsl(262 83% 58%)',
  },
  {
    icon: Layout,
    title: 'Pick a Template',
    description: 'Not sure where to start? Choose from ready-made templates like dashboards, landing pages, or task managers.',
    accentColor: 'hsl(200 80% 60%)',
  },
  {
    icon: FolderOpen,
    title: 'Open a Saved Project',
    description: 'Your projects are saved automatically. Come back anytime to continue building or refine your app.',
    accentColor: 'hsl(150 60% 50%)',
  },
];

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') handleNext();
    else if (e.key === 'ArrowLeft') handlePrev();
  };

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === steps.length - 1;

  return (
    <dialog
      ref={dialogRef}
      className="onboarding-overlay"
      aria-labelledby="onboarding-title"
      onKeyDown={handleKeyDown}
    >
      <div className="onboarding-content">
        <div className="onboarding-step-indicator">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`onboarding-dot${i === currentStep ? ' onboarding-dot--active' : ''}`}
              onClick={() => setCurrentStep(i)}
              aria-label={`Step ${i + 1}`}
              type="button"
            />
          ))}
        </div>

        <div
          className="onboarding-icon"
          style={{ '--accent-color': step.accentColor } as React.CSSProperties}
        >
          <Icon size={32} strokeWidth={1.5} />
        </div>

        <h2 id="onboarding-title" className="onboarding-title">{step.title}</h2>
        <p className="onboarding-description">{step.description}</p>

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
            {isLast ? 'Get Started' : 'Next'}
            <ArrowRight size={16} />
          </button>
        </div>

        <button
          type="button"
          className="onboarding-skip"
          onClick={handleDismiss}
        >
          Skip
        </button>
      </div>
    </dialog>
  );
}

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
}
