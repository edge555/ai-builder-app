/**
 * SandpackRefresher — a renderless child component that must live inside
 * <SandpackProvider>. It dispatches a "refresh" message to the Sandpack
 * bundler without destroying the iframe, avoiding the 1–3 s cost of a
 * full remount.
 *
 * Usage:
 *   <SandpackProvider …>
 *     <SandpackRefresher onRefreshReady={fn => refreshRef.current = fn} />
 *     …
 *   </SandpackProvider>
 *
 * Then call `refreshRef.current()` from the parent to trigger a reload.
 */
import { useSandpack } from '@codesandbox/sandpack-react';
import { useEffect, useCallback } from 'react';

export interface SandpackRefresherProps {
    /**
     * Called once with the refresh function so the parent can invoke it later.
     */
    onRefreshReady: (refresh: () => void) => void;
}

export function SandpackRefresher({ onRefreshReady }: SandpackRefresherProps) {
    const { dispatch } = useSandpack();

    const refresh = useCallback(() => {
        dispatch({ type: 'refresh' });
    }, [dispatch]);

    // Expose the refresh function to the parent.
    useEffect(() => {
        onRefreshReady(refresh);
    }, [refresh, onRefreshReady]);

    return null;
}

export default SandpackRefresher;
