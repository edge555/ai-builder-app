import { useState, useEffect, useCallback } from 'react';

export const RESIZE_MIN_WIDTH = 300;
export const RESIZE_MAX_FRACTION = 0.6;
export const DESKTOP_BREAKPOINT = 1023;
export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const SIDEBAR_DEFAULT_WIDTH = 340;

const SIDE_PANEL_WIDTH_STORAGE_KEY = 'ai_app_builder:sidePanelWidth';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ai_app_builder:sidebarCollapsed';

export function useSidebarResize() {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const raw = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
        if (raw === null) {
            return window.innerWidth <= DESKTOP_BREAKPOINT;
        }
        return raw === 'true';
    });

    const [sidePanelWidth, setSidePanelWidth] = useState(() => {
        const raw = localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : SIDEBAR_DEFAULT_WIDTH;
    });

    const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

    const maxSidePanelWidth = Math.max(
        RESIZE_MIN_WIDTH,
        Math.floor(windowWidth * RESIZE_MAX_FRACTION)
    );

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(sidePanelWidth));
    }, [sidePanelWidth]);

    useEffect(() => {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    }, [isSidebarCollapsed]);

    useEffect(() => {
        setSidePanelWidth((w) => Math.max(RESIZE_MIN_WIDTH, Math.min(w, maxSidePanelWidth)));
    }, [maxSidePanelWidth]);

    const handleToggleSidebar = useCallback(() => {
        setIsSidebarCollapsed((prev) => !prev);
    }, []);

    return {
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        sidePanelWidth,
        setSidePanelWidth,
        windowWidth,
        maxSidePanelWidth,
        handleToggleSidebar,
    };
}
