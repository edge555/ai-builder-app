import './PageSkeleton.css';

/**
 * Lightweight full-page loading skeleton used as the Suspense fallback
 * while lazy-loaded page chunks are being fetched.
 */
export function PageSkeleton() {
    return (
        <div className="page-skeleton">
            <div className="page-skeleton-spinner" />
            <span>Loading…</span>
        </div>
    );
}

export default PageSkeleton;
