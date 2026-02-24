import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import './SiteHeader.css';

interface SiteHeaderProps {
  /** Extra buttons rendered to the left of the ThemeToggle */
  actions?: React.ReactNode;
  /** Adds a subtle drop-shadow — set when the page has been scrolled */
  scrolled?: boolean;
}

export function SiteHeader({ actions, scrolled }: SiteHeaderProps) {
  return (
    <header className={`site-header ${scrolled ? 'site-header-scrolled' : ''}`}>
      <div className="site-header-content">
        <Link to="/" className="site-header-brand">
          <div className="site-header-logo">
            <Sparkles size={18} />
          </div>
          <span className="site-header-title">AI App Builder</span>
        </Link>
        <div className="site-header-actions">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
