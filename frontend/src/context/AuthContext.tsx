import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { AuthUser, AuthSession } from '@ai-app-builder/shared/types';
import { supabase } from '@/integrations/supabase/client';
import {
    AuthStateContext,
    AuthActionsContext,
    type AuthStateValue,
    type AuthActionsValue,
} from './AuthContext.context';

function mapSession(raw: { user: { id: string; email?: string; user_metadata?: Record<string, string> }; access_token: string; refresh_token: string; expires_at?: number } | null): { user: AuthUser; session: AuthSession } | null {
    if (!raw?.user) return null;
    const user: AuthUser = {
        id: raw.user.id,
        email: raw.user.email ?? '',
        displayName: raw.user.user_metadata?.full_name,
        avatarUrl: raw.user.user_metadata?.avatar_url,
    };
    const session: AuthSession = {
        user,
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        expiresAt: raw.expires_at ?? 0,
    };
    return { user, session };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [session, setSession] = useState<AuthSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const wasAuthenticatedRef = useRef(false);

    useEffect(() => {
        if (!supabase) {
            setIsLoading(false);
            return;
        }

        supabase.auth.getSession().then(({ data }) => {
            const mapped = mapSession(data.session as Parameters<typeof mapSession>[0]);
            setUser(mapped?.user ?? null);
            setSession(mapped?.session ?? null);
            wasAuthenticatedRef.current = !!mapped?.user;
            setIsLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, raw) => {
            const mapped = mapSession(raw as Parameters<typeof mapSession>[0]);
            setUser(mapped?.user ?? null);
            setSession(mapped?.session ?? null);

            // Redirect to login when a previously authenticated user is signed out
            // (e.g. refresh token expired, manual sign-out)
            if (event === 'SIGNED_OUT' && wasAuthenticatedRef.current) {
                wasAuthenticatedRef.current = false;
                window.location.href = '/login';
                return;
            }

            wasAuthenticatedRef.current = !!mapped?.user;
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        if (!supabase) throw new Error('Supabase is not configured');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        if (!supabase) throw new Error('Supabase is not configured');
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }, []);

    const signInWithProvider = useCallback(async (provider: 'google' | 'github') => {
        if (!supabase) throw new Error('Supabase is not configured');
        const { error } = await supabase.auth.signInWithOAuth({ provider });
        if (error) throw error;
    }, []);

    const signOut = useCallback(async () => {
        if (!supabase) throw new Error('Supabase is not configured');
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }, []);

    const stateValue: AuthStateValue = {
        user,
        session,
        isLoading,
        isAuthenticated: !!user,
    };

    const actionsValue: AuthActionsValue = {
        signIn,
        signUp,
        signInWithProvider,
        signOut,
    };

    return (
        <AuthStateContext.Provider value={stateValue}>
            <AuthActionsContext.Provider value={actionsValue}>
                {children}
            </AuthActionsContext.Provider>
        </AuthStateContext.Provider>
    );
}
