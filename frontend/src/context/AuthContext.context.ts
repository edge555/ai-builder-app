import type { AuthUser, AuthSession } from '@ai-app-builder/shared/types';
import { createContext, useContext } from 'react';

/**
 * Read-only auth state.
 * Components subscribing to this context will only re-render when state changes.
 */
export interface AuthStateValue {
    user: AuthUser | null;
    session: AuthSession | null;
    isLoading: boolean;
    isAuthenticated: boolean;
}

/**
 * Stable auth actions.
 * Components subscribing to this context won't re-render on state changes.
 */
export interface AuthActionsValue {
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string) => Promise<void>;
    signInWithProvider: (provider: 'google' | 'github') => Promise<void>;
    signOut: () => Promise<void>;
}

export const AuthStateContext = createContext<AuthStateValue | null>(null);
export const AuthActionsContext = createContext<AuthActionsValue | null>(null);

/**
 * Hook to access auth state only.
 * Components using this won't re-render when actions change.
 */
export function useAuthState(): AuthStateValue {
    const context = useContext(AuthStateContext);
    if (!context) {
        throw new Error('useAuthState must be used within an AuthProvider');
    }
    return context;
}

/**
 * Hook to access auth actions only.
 * Components using this won't re-render when state changes.
 */
export function useAuthActions(): AuthActionsValue {
    const context = useContext(AuthActionsContext);
    if (!context) {
        throw new Error('useAuthActions must be used within an AuthProvider');
    }
    return context;
}
