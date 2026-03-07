import { useState, useEffect } from 'react';

/**
 * Tracks countdown progress and remaining seconds for a given end timestamp.
 * Used by toast notification timers.
 */
export function useCountdown(endsAt: number) {
    const [progress, setProgress] = useState(100);
    const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));

    useEffect(() => {
        const total = endsAt - Date.now();
        if (total <= 0) {
            setProgress(0);
            setSeconds(0);
            return;
        }

        const barInterval = setInterval(() => {
            const remaining = endsAt - Date.now();
            if (remaining <= 0) {
                setProgress(0);
                clearInterval(barInterval);
            } else {
                setProgress((remaining / total) * 100);
            }
        }, 100);

        const textInterval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            setSeconds(remaining);
            if (remaining <= 0) clearInterval(textInterval);
        }, 1000);

        return () => {
            clearInterval(barInterval);
            clearInterval(textInterval);
        };
    }, [endsAt]);

    return { progress, seconds };
}
