import { ChatProvider, VersionProvider } from './context';
import { ErrorBoundary, AppLayout } from './components';
import './App.css';

/**
 * Main application component.
 * Provides the chat and version contexts and renders the main layout.
 * Wrapped with ErrorBoundary for comprehensive error handling.
 * 
 * Requirements: 8.5, 11.1, 11.2, 11.3
 */
function App() {
  const handleGlobalError = (error: Error) => {
    console.error('Global error caught:', error);
  };

  return (
    <ErrorBoundary
      onError={handleGlobalError}
      errorMessage="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <ChatProvider>
        <VersionProvider>
          <AppLayout />
        </VersionProvider>
      </ChatProvider>
    </ErrorBoundary>
  );
}

export default App;
