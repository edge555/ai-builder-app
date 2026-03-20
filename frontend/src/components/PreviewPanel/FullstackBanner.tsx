import { Download } from 'lucide-react';
import './FullstackBanner.css';

interface FullstackBannerProps {
  /** Whether the project uses Prisma (database). */
  hasPrisma: boolean;
  /** Whether the project has API routes. */
  hasApiRoutes: boolean;
}

/**
 * Banner shown in the preview panel when a fullstack project is detected.
 * Informs users that API routes and database features require export.
 */
export function FullstackBanner({ hasPrisma, hasApiRoutes }: FullstackBannerProps) {
  const features: string[] = [];
  if (hasApiRoutes) features.push('API routes');
  if (hasPrisma) features.push('database');

  return (
    <div className="fullstack-banner" role="status">
      <Download size={16} />
      <span>
        {features.join(' and ')} {features.length === 1 ? 'is' : 'are'} available after export.
        Client components are previewed below.
      </span>
    </div>
  );
}
