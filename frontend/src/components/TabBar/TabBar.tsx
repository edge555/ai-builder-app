import React, { useRef, useEffect } from 'react';
import './TabBar.css';

export interface Tab {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

export interface TabBarProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
}

/**
 * TabBar component - A segment control style tab switcher
 * 
 * Features:
 * - Clean pill/segment-control style toggle
 * - Active tab has accent background
 * - Smooth transition when switching (~150ms)
 * - Keyboard navigation support (arrow keys)
 * - Accessible with proper ARIA attributes
 */
export function TabBar({ tabs, activeTab, onTabChange, className = '' }: TabBarProps) {
    const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'Home':
                e.preventDefault();
                nextIndex = 0;
                break;
            case 'End':
                e.preventDefault();
                nextIndex = tabs.length - 1;
                break;
            default:
                return;
        }

        const nextTab = tabs[nextIndex];
        if (nextTab) {
            onTabChange(nextTab.id);
            // Focus the next tab button
            tabRefs.current.get(nextTab.id)?.focus();
        }
    };

    // Set ref for each tab button
    const setTabRef = (tabId: string, element: HTMLButtonElement | null) => {
        if (element) {
            tabRefs.current.set(tabId, element);
        } else {
            tabRefs.current.delete(tabId);
        }
    };

    return (
        <div className={`tab-bar ${className}`} role="tablist">
            {tabs.map((tab, index) => {
                const isActive = tab.id === activeTab;

                return (
                    <button
                        key={tab.id}
                        ref={(el) => setTabRef(tab.id, el)}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab.id}`}
                        tabIndex={isActive ? 0 : -1}
                        className={`tab-bar-item ${isActive ? 'active' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                    >
                        {tab.icon && <span className="tab-bar-icon">{tab.icon}</span>}
                        <span className="tab-bar-label">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default TabBar;
