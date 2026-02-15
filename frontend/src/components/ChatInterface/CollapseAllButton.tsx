import './CollapseAllButton.css';

interface CollapseAllButtonProps {
    /** Whether all collapsible messages are currently collapsed */
    allCollapsed: boolean;
    /** Whether any messages are collapsed */
    anyCollapsed: boolean;
    /** Callback when button is clicked */
    onCollapseAll: () => void;
    /** Callback when button is clicked */
    onExpandAll: () => void;
}

/**
 * Button to collapse or expand all collapsible messages.
 * Only shown when there are 3+ messages (at least 1 collapsible message).
 */
export function CollapseAllButton({
    allCollapsed,
    anyCollapsed,
    onCollapseAll,
    onExpandAll,
}: CollapseAllButtonProps) {
    const handleClick = () => {
        if (allCollapsed || anyCollapsed) {
            onExpandAll();
        } else {
            onCollapseAll();
        }
    };

    const buttonText = allCollapsed || anyCollapsed ? 'Expand all' : 'Collapse older';

    return (
        <button
            className="collapse-all-button"
            onClick={handleClick}
            aria-label={buttonText}
        >
            <svg
                className="collapse-all-icon"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {allCollapsed || anyCollapsed ? (
                    // Expand icon (chevrons down)
                    <>
                        <path
                            d="M4 4L8 8L12 4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M4 8L8 12L12 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </>
                ) : (
                    // Collapse icon (chevrons up)
                    <>
                        <path
                            d="M12 12L8 8L4 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M12 8L8 4L4 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </>
                )}
            </svg>
            <span>{buttonText}</span>
        </button>
    );
}
