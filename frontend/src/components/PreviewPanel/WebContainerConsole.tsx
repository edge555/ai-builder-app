import { useEffect, useRef } from 'react';

export interface WebContainerConsoleProps {
  lines: string[];
}

/** Strip ANSI escape codes from a string. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
}

/**
 * Renders WebContainer terminal output as a scrollable console panel.
 * Auto-scrolls to the bottom as new lines arrive.
 */
export function WebContainerConsole({ lines }: WebContainerConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="wc-console">
      <div className="wc-console__lines">
        {lines.map((line, i) => {
          const clean = stripAnsi(line).trim();
          if (!clean) return null;
          return (
            <div key={i} className="wc-console__line">
              {clean}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
