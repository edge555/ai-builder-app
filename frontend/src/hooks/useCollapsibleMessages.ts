import { useState, useCallback, useMemo } from 'react';

import type { ChatMessage } from '../components/ChatInterface/ChatInterface';

/**
 * Hook to manage collapsed state for chat messages.
 * Enforces that the latest 2 messages are always expanded.
 */
export function useCollapsibleMessages(messages: ChatMessage[]) {
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    // Get IDs of messages that cannot be collapsed (latest 2)
    const protectedIds = useMemo(() => {
        if (messages.length <= 2) return new Set(messages.map(m => m.id));
        return new Set(messages.slice(-2).map(m => m.id));
    }, [messages]);

    // Get IDs of messages that can be collapsed
    const collapsibleIds = useMemo(() => {
        if (messages.length <= 2) return [];
        return messages.slice(0, -2).map(m => m.id);
    }, [messages]);

    /**
     * Check if a message is currently collapsed
     */
    const isCollapsed = useCallback(
        (id: string) => {
            return collapsedIds.has(id);
        },
        [collapsedIds]
    );

    /**
     * Check if a message can be collapsed (not in latest 2)
     */
    const canCollapse = useCallback(
        (id: string) => {
            return !protectedIds.has(id);
        },
        [protectedIds]
    );

    /**
     * Toggle collapse state for a single message
     */
    const toggle = useCallback(
        (id: string) => {
            // Don't allow toggling protected messages
            if (protectedIds.has(id)) return;

            setCollapsedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
                return next;
            });
        },
        [protectedIds]
    );

    /**
     * Collapse all collapsible messages (excluding latest 2)
     */
    const collapseAll = useCallback(() => {
        setCollapsedIds(new Set(collapsibleIds));
    }, [collapsibleIds]);

    /**
     * Expand all messages
     */
    const expandAll = useCallback(() => {
        setCollapsedIds(new Set());
    }, []);

    /**
     * Check if all collapsible messages are currently collapsed
     */
    const allCollapsed = useMemo(() => {
        if (collapsibleIds.length === 0) return false;
        return collapsibleIds.every(id => collapsedIds.has(id));
    }, [collapsibleIds, collapsedIds]);

    /**
     * Check if any messages are collapsed
     */
    const anyCollapsed = useMemo(() => {
        return collapsedIds.size > 0;
    }, [collapsedIds]);

    return useMemo(
        () => ({
            isCollapsed,
            canCollapse,
            toggle,
            collapseAll,
            expandAll,
            allCollapsed,
            anyCollapsed,
            hasCollapsibleMessages: collapsibleIds.length > 0,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isCollapsed, canCollapse, toggle, collapseAll, expandAll, allCollapsed, anyCollapsed, collapsibleIds.length]
    );
}
