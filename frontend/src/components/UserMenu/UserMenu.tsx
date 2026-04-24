import { useState, useRef, useEffect } from 'react';
import { useAuthState, useAuthActions } from '@/context/AuthContext.context';
import { LogOut, ChevronDown, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import './UserMenu.css';

export function UserMenu() {
    const { user } = useAuthState();
    const { signOut } = useAuthActions();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    if (!user) return null;

    const handleSignOut = async () => {
        setOpen(false);
        await signOut();
    };

    return (
        <div className="user-menu" ref={menuRef}>
            <button
                className="user-menu-trigger"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <span className="user-menu-email">{user.email}</span>
                <ChevronDown size={14} />
            </button>
            {open && (
                <div className="user-menu-dropdown">
                    <Link className="user-menu-item" to="/settings/agents" onClick={() => setOpen(false)}>
                        <Settings size={14} />
                        Settings
                    </Link>
                    <button className="user-menu-item" onClick={handleSignOut}>
                        <LogOut size={14} />
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}
