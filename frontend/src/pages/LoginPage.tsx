import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState, useAuthActions } from '@/context/AuthContext.context';
import { useToastActions } from '@/context/ToastContext';
import { SiteHeader } from '@/components/SiteHeader/SiteHeader';
import './LoginPage.css';

type Tab = 'sign-in' | 'sign-up';

function LoginPage() {
    const { isAuthenticated, isLoading } = useAuthState();
    const { signIn, signUp, signInWithProvider } = useAuthActions();
    const { addToast } = useToastActions();
    const [tab, setTab] = useState<Tab>('sign-in');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    if (isLoading) return null;
    if (isAuthenticated) return <Navigate to="/" replace />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            if (tab === 'sign-in') {
                await signIn(email, password);
            } else {
                await signUp(email, password);
                addToast({
                    type: 'success',
                    message: `Verification email sent to ${email}. Please check your inbox.`,
                    autoDismissMs: 8000,
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOAuth = async (provider: 'google' | 'github') => {
        setError(null);
        try {
            await signInWithProvider(provider);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        }
    };

    return (
        <div className="login-page">
            <SiteHeader />
            <div className="login-page-container">
                <div className="login-card">
                    <h1 className="login-title">
                        {tab === 'sign-in' ? 'Welcome back' : 'Create account'}
                    </h1>

                    <div className="login-tabs">
                        <button
                            className={`login-tab ${tab === 'sign-in' ? 'login-tab-active' : ''}`}
                            onClick={() => setTab('sign-in')}
                        >
                            Sign In
                        </button>
                        <button
                            className={`login-tab ${tab === 'sign-up' ? 'login-tab-active' : ''}`}
                            onClick={() => setTab('sign-up')}
                        >
                            Sign Up
                        </button>
                    </div>

                    <form className="login-form" onSubmit={handleSubmit}>
                        <label className="login-label">
                            Email
                            <input
                                type="email"
                                className="login-input"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </label>
                        <label className="login-label">
                            Password
                            <input
                                type="password"
                                className="login-input"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={6}
                                autoComplete={tab === 'sign-in' ? 'current-password' : 'new-password'}
                            />
                        </label>

                        {error && <p className="login-error">{error}</p>}

                        <button
                            type="submit"
                            className="login-submit"
                            disabled={submitting}
                        >
                            {submitting
                                ? 'Please wait...'
                                : tab === 'sign-in'
                                    ? 'Sign In'
                                    : 'Sign Up'}
                        </button>
                    </form>

                    <div className="login-divider">
                        <span>or</span>
                    </div>

                    <div className="login-social">
                        <button
                            className="login-social-btn"
                            onClick={() => handleOAuth('github')}
                            type="button"
                        >
                            Continue with GitHub
                        </button>
                        <button
                            className="login-social-btn"
                            onClick={() => handleOAuth('google')}
                            type="button"
                        >
                            Continue with Google
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
