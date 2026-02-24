import './SiteFooter.css';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-container">
        <p className="site-footer-text">© 2026 AI App Builder</p>
        <div className="site-footer-links">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer-link"
          >
            GitHub
          </a>
          <span className="site-footer-dot">•</span>
          <a href="#" className="site-footer-link">
            Built with AI
          </a>
        </div>
      </div>
    </footer>
  );
}
