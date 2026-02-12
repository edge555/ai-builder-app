import React, { createContext, useContext, useMemo } from 'react';
import { ErrorAggregator } from '../services/ErrorAggregator';

const ErrorAggregatorContext = createContext<ErrorAggregator | null>(null);

/**
 * Provider for ErrorAggregator instance.
 */
export function ErrorAggregatorProvider({ children }: { children: React.ReactNode }) {
    const aggregator = useMemo(() => new ErrorAggregator(), []);

    return (
        <ErrorAggregatorContext.Provider value={aggregator}>
            {children}
        </ErrorAggregatorContext.Provider>
    );
}

/**
 * Hook to access the ErrorAggregator instance.
 */
export function useErrorAggregator(): ErrorAggregator {
    const context = useContext(ErrorAggregatorContext);
    if (!context) {
        throw new Error('useErrorAggregator must be used within an ErrorAggregatorProvider');
    }
    return context;
}
