import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import './BrowserChrome.css';

export interface BrowserChromeProps {
    /** URL to display in the address bar */
    url?: string;
    /** Callback when refresh button is clicked */
    onRefresh?: () => void;
    /** Whether the preview is currently refreshing */
    isRefreshing?: boolean;
}

/**
 * BrowserChrome component - Mimics a real browser window
 * 
 * Features:
 * - Navigation buttons (back, forward) - decorative only
 * - Functional refresh button
 * - URL bar with fake URL display
 * - Themed for light/dark mode
 * - Clean, minimal design with subtle shadow
 */
export function BrowserChrome({
    url = 'https://preview.app/',
    onRefresh,
    isRefreshing = false
}: BrowserChromeProps) {
    return (
        <div className="browser-chrome">
            <div className="browser-chrome-nav">
                <button
                    className="browser-chrome-btn"
                    disabled
                    aria-label="Go back"
                    title="Go back (disabled)"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    className="browser-chrome-btn"
                    disabled
                    aria-label="Go forward"
                    title="Go forward (disabled)"
                >
                    <ChevronRight size={16} />
                </button>
                <button
                    className={`browser-chrome-btn browser-chrome-refresh ${isRefreshing ? 'refreshing' : ''}`}
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    aria-label="Refresh preview"
                    title="Refresh preview"
                >
                    <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
                </button>
            </div>

            <div className="browser-chrome-url-bar">
                <div className="browser-chrome-url">
                    <span className="browser-chrome-protocol">🔒</span>
                    <span className="browser-chrome-url-text">{url}</span>
                </div>
            </div>
        </div>
    );
}

export default BrowserChrome;
