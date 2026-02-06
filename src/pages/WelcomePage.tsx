import { ArrowRight, Sparkles } from 'lucide-react';
import { initialSuggestions } from '@/data/prompt-suggestions';
import './WelcomePage.css';

interface WelcomePageProps {
  onEnterApp: (initialPrompt?: string) => void;
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

export function WelcomePage({ onEnterApp }: WelcomePageProps) {
  return (
    <div className="welcome-page">
      {/* Header */}
      <header className="welcome-header">
        <div className="welcome-header-brand">
          <div className="welcome-header-logo">
            <Sparkles size={18} />
          </div>
          <span className="welcome-header-title">AI App Builder</span>
        </div>
        <button
          className="welcome-header-nav-btn"
          onClick={() => onEnterApp()}
        >
          Go to App
          <ArrowRight size={16} />
        </button>
      </header>

      {/* Hero Section */}
      <section className="welcome-hero">
        <div className="welcome-hero-logo">
          <Sparkles size={40} />
        </div>
        <h1 className="welcome-hero-headline">
          Build apps with AI in seconds
        </h1>
        <p className="welcome-hero-subheadline">
          Describe your idea and watch it come to life. No coding required.
        </p>
        <button
          className="welcome-hero-cta"
          onClick={() => onEnterApp()}
        >
          Get Started
          <ArrowRight size={18} />
        </button>
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

      {/* Examples Section */}
      <section className="welcome-examples">
        <h2 className="welcome-examples-title">Try an example</h2>
        <div className="welcome-examples-grid">
          {initialSuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              className="welcome-example-card"
              onClick={() => onEnterApp(suggestion.prompt)}
            >
              <span className="welcome-example-icon">{suggestion.icon}</span>
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="welcome-footer">
        <p className="welcome-footer-text">© 2024 AI App Builder</p>
      </footer>
    </div>
  );
}

export default WelcomePage;
