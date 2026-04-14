import { Server } from 'lucide-react';
import './FullstackBanner.css';

interface FullstackBannerProps {
  /** Whether the project uses Prisma (database). */
  hasPrisma: boolean;
  /** Whether the project has API routes. */
  hasApiRoutes: boolean;
}

/**
 * Banner shown in the preview panel when a fullstack project is detected.
 * With WebContainers, API routes run in a real Node.js server so they work directly.
 * Prisma still requires a real database connection — inform the user to export for that.
 */
export function FullstackBanner({ hasPrisma, hasApiRoutes }: FullstackBannerProps) {
  if (hasPrisma) {
    return (
      <div className="fullstack-banner" role="status">
        <Server size={16} />
        <span>
          API routes run live in the preview.{' '}
          Database features require export to connect to a real database.
        </span>
      </div>
    );
  }

  if (hasApiRoutes) {
    return (
      <div className="fullstack-banner" role="status">
        <Server size={16} />
        <span>
          API routes are running live — powered by a real Node.js server in your browser.
        </span>
      </div>
    );
  }

  return null;
}
