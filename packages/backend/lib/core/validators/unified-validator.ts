/**
 * Unified Validator
 * Combines modular architecture validation with styling baseline checks.
 * This replaces the separate validateModularArchitecture and validateStylingBaseline functions.
 */

import type { ValidationError } from '@ai-app-builder/shared';
import { MAX_APP_LINES } from '../../constants';

/**
 * Comprehensive validation that checks both architecture and styling.
 * Returns warnings (not errors) for poor structure to encourage better practices.
 */
export function validateProjectQuality(files: Record<string, string>): ValidationError[] {
    const warnings: ValidationError[] = [];
    const filePaths = Object.keys(files);

    // Architecture validation
    warnings.push(...validateArchitecture(files, filePaths));

    // Styling validation
    warnings.push(...validateStyling(files, filePaths));

    return warnings;
}

/**
 * Validate modular architecture patterns.
 */
function validateArchitecture(files: Record<string, string>, filePaths: string[]): ValidationError[] {
    const warnings: ValidationError[] = [];

    // Count component files
    const componentFiles = filePaths.filter(p =>
        p.includes('/components/') && (p.endsWith('.tsx') || p.endsWith('.jsx'))
    );

    // Count hook files
    const hookFiles = filePaths.filter(p =>
        p.includes('/hooks/') && p.endsWith('.ts')
    );

    // Check for types file
    const hasTypesFile = filePaths.some(p =>
        p.includes('/types/') || p.endsWith('types.ts')
    );

    // Check App.tsx size
    const appTsx = Object.entries(files).find(([path]) =>
        path.endsWith('App.tsx') || path.endsWith('App.jsx')
    );

    if (appTsx) {
        const [appPath, appContent] = appTsx;
        const lineCount = appContent.split('\n').length;

        if (lineCount > MAX_APP_LINES) {
            warnings.push({
                type: 'architecture_warning',
                message: `App.tsx has ${lineCount} lines (recommended: <50). Consider extracting components.`,
                filePath: appPath,
            });
        }
    }

    // Warn if too few component files for non-trivial apps
    const totalTsxFiles = filePaths.filter(p =>
        p.endsWith('.tsx') || p.endsWith('.jsx')
    ).length;

    if (totalTsxFiles >= 1 && componentFiles.length < 2) {
        warnings.push({
            type: 'architecture_warning',
            message: `Only ${componentFiles.length} component files found. Consider splitting into reusable components in src/components/`,
        });
    }

    // Warn if no hooks folder for apps with state management
    const hasUseState = Object.values(files).some(content =>
        content.includes('useState') || content.includes('useEffect')
    );

    if (hasUseState && hookFiles.length === 0) {
        warnings.push({
            type: 'architecture_warning',
            message: 'No custom hooks found. Consider extracting reusable logic to src/hooks/',
        });
    }

    // Warn if no types file for TypeScript projects
    const hasTsFiles = filePaths.some(p => p.endsWith('.tsx') || p.endsWith('.ts'));
    if (hasTsFiles && !hasTypesFile) {
        warnings.push({
            type: 'architecture_warning',
            message: 'No types file found. Consider adding src/types/index.ts for TypeScript interfaces.',
        });
    }

    // Check for proper folder structure
    const hasUIFolder = filePaths.some(p => p.includes('/components/ui/'));
    const hasLayoutFolder = filePaths.some(p => p.includes('/components/layout/'));
    const hasFeaturesFolder = filePaths.some(p => p.includes('/components/features/'));

    if (componentFiles.length > 0 && !hasUIFolder && !hasLayoutFolder && !hasFeaturesFolder) {
        warnings.push({
            type: 'architecture_warning',
            message: 'Components not organized in folders. Consider using ui/, layout/, features/ subfolders.',
        });
    }

    return warnings;
}

/**
 * Validate styling baseline and best practices.
 */
function validateStyling(files: Record<string, string>, filePaths: string[]): ValidationError[] {
    const warnings: ValidationError[] = [];

    // Check for CSS files
    const cssFiles = filePaths.filter(p => 
        p.endsWith('.css') || p.endsWith('.scss') || p.endsWith('.less')
    );

    // Check for inline styles in components
    const componentFiles = filePaths.filter(p =>
        (p.endsWith('.tsx') || p.endsWith('.jsx')) && p.includes('/components/')
    );

    let hasExcessiveInlineStyles = false;
    for (const filePath of componentFiles) {
        const content = files[filePath];
        // Count style prop occurrences
        const styleMatches = content.match(/style=\{/g);
        if (styleMatches && styleMatches.length > 3) {
            hasExcessiveInlineStyles = true;
            warnings.push({
                type: 'styling_warning',
                message: `Component has ${styleMatches.length} inline styles. Consider extracting to CSS module or styled component.`,
                filePath,
            });
        }
    }

    // Check for global CSS structure
    const hasGlobalCSS = cssFiles.some(p => 
        p.includes('global.css') || p.includes('index.css') || p.includes('App.css')
    );

    if (cssFiles.length === 0 && componentFiles.length > 0) {
        warnings.push({
            type: 'styling_warning',
            message: 'No CSS files found. Consider adding styles for better separation of concerns.',
        });
    }

    // Check for CSS variables/design tokens
    if (hasGlobalCSS) {
        const globalCSSFile = cssFiles.find(p => 
            p.includes('global.css') || p.includes('index.css')
        );
        
        if (globalCSSFile) {
            const content = files[globalCSSFile];
            const hasCSSVariables = content.includes('--') || content.includes(':root');
            
            if (!hasCSSVariables && componentFiles.length > 3) {
                warnings.push({
                    type: 'styling_warning',
                    message: 'Consider using CSS variables (--var-name) in global CSS for consistent theming.',
                    filePath: globalCSSFile,
                });
            }
        }
    }

    // Check for responsive design patterns
    const hasMediaQueries = cssFiles.some(filePath => {
        const content = files[filePath];
        return content.includes('@media');
    });

    if (cssFiles.length > 0 && !hasMediaQueries && componentFiles.length > 2) {
        warnings.push({
            type: 'styling_warning',
            message: 'No responsive design (@media queries) found. Consider adding mobile-first responsive styles.',
        });
    }

    return warnings;
}
