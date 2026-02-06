import { useState } from 'react';
import { ChatProvider, VersionProvider, PreviewErrorProvider } from './context';
import { ErrorBoundary, AppLayout } from './components';
import { WelcomePage } from './pages';
import './App.css';

/**
 * Main application component.
 * Provides the chat and version contexts and renders the main layout.
 * Wrapped with ErrorBoundary for comprehensive error handling.
 * 
 * Requirements: 8.5, 11.1, 11.2, 11.3
 */
function App() {
  const [currentPage, setCurrentPage] = useState<'welcome' | 'builder'>('welcome');
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>();

  const handleEnterApp = (prompt?: string) => {
    setInitialPrompt(prompt);
    setCurrentPage('builder');
  };

  const handleGlobalError = (error: Error) => {
    console.error('Global error caught:', error);
  };

  if (currentPage === 'welcome') {
    return <WelcomePage onEnterApp={handleEnterApp} />;
  }

  return (
    <ErrorBoundary
      onError={handleGlobalError}
      errorMessage="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <PreviewErrorProvider>
        <ChatProvider initialPrompt={initialPrompt}>
          <VersionProvider>
            <AppLayout />
          </VersionProvider>
        </ChatProvider>
      </PreviewErrorProvider>
    </ErrorBoundary>
  );
}

export default App;
