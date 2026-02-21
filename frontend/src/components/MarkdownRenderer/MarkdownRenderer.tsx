import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * remarkPlugins array is stable at module level — no recreations per render.
 */
const REMARK_PLUGINS = [remarkGfm];

/**
 * MarkdownRenderer component for safe and styled markdown display.
 * Supports GFM and syntax highlighting for code blocks.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    // Determine if we should use dark or light theme for syntax highlighting
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const syntaxTheme = isDark ? vscDarkPlus : vs;

    // Memoize components so ReactMarkdown doesn't remount code blocks on every render.
    // Only recreates when the syntax theme changes (i.e. dark/light toggle).
    const components = useMemo(() => ({
        code({ node: _node, inline, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean; node?: unknown }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
                <div className="code-block-container">
                    <div className="code-block-header">
                        <span className="code-block-lang">{match[1]}</span>
                    </div>
                    <SyntaxHighlighter
                        {...props}
                        style={syntaxTheme}
                        language={match[1]}
                        PreTag="div"
                        className="syntax-highlighter"
                    >
                        {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                </div>
            ) : (
                <code className={className} {...props}>
                    {children}
                </code>
            );
        },
    }), [syntaxTheme]);

    return (
        <div className={`markdown-renderer ${className}`}>
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                components={components}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
