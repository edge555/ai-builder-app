import { type ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import './AdminLayout.css';

interface AdminLayoutProps {
    children: ReactNode;
    orgName?: string;
}

export function AdminLayout({ children, orgName }: AdminLayoutProps) {
    const { orgId } = useParams<{ orgId: string }>();

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <div className="admin-sidebar-header">
                    <span className="admin-sidebar-brand">Blank Canvas</span>
                    {orgName && <span className="admin-sidebar-org">{orgName}</span>}
                </div>

                <nav className="admin-nav">
                    <NavLink
                        to={`/admin/${orgId}/workspaces`}
                        className={({ isActive }) =>
                            `admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`
                        }
                    >
                        Workspaces
                    </NavLink>
                    <NavLink
                        to={`/admin/${orgId}/settings`}
                        className={({ isActive }) =>
                            `admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`
                        }
                    >
                        Settings
                    </NavLink>
                </nav>

                <div className="admin-sidebar-footer">
                    <a href="/" className="admin-nav-link admin-nav-link--muted">
                        ← Back to app
                    </a>
                </div>
            </aside>

            <main className="admin-main">
                {children}
            </main>
        </div>
    );
}
