/**
 * AdminDashboardPage — /admin/:orgId
 * Redirects to the workspace list (which is the primary admin view).
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export function AdminDashboardPage() {
    const { orgId } = useParams<{ orgId: string }>();
    const navigate = useNavigate();

    useEffect(() => {
        navigate(`/admin/${orgId}/workspaces`, { replace: true });
    }, [orgId, navigate]);

    return null;
}

export default AdminDashboardPage;
