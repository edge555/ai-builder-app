/**
 * Architecture Validator
 * Validates that the project follows modular architecture patterns.
 */

import type { ValidationError } from '@ai-app-builder/shared';
import { MAX_APP_LINES } from '../../constants';

/**
 * Validates that the project follows modular architecture patterns.
 * Returns warnings (not errors) for poor structure to encourage better practices.
 */
export function validateModularArchitecture(files: Record<string, string>): ValidationError[] {
    const warnings: ValidationError[] = [];
    const filePaths = Object.keys(files);

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
