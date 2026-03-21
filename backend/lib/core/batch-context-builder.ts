/**
 * @module core/batch-context-builder
 * @description Pure functions for building cross-phase context during
 * multi-phase generation. No AI calls — deterministic and easily testable.
 *
 * Provides:
 * - `buildPhaseContext()` — main entry point, assembles all context for a phase
 * - `getDirectDeps()` — resolves full content of files a batch imports from
 * - `extractCSSVariableNames()` — regex extract `--var-name` from CSS content
 * - `getContractsForBatch()` — filters plan contracts relevant to a batch
 * - `summarizeFile()` — thin adapter over ChunkIndexBuilder for file summaries
 */

import type {
  ArchitecturePlan,
  PlannedFile,
  TypeContract,
  GeneratedFile,
  PhaseLayer,
  StateShape,
} from './schemas';
import { ChunkIndexBuilder } from '../analysis/file-planner/chunk-index';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Lightweight summary of a single generated file's API surface. */
export interface FileSummary {
  /** File path relative to project root. */
  path: string;
  /** Exported symbol names. */
  exports: string[];
  /** Import source paths (relative, e.g. './utils'). */
  imports: string[];
  /** CSS class names extracted from .css files. */
  cssClasses: string[];
}

/** Context bundle injected into each generation phase's prompt. */
export interface PhaseContext {
  /** Full content of type definition files (scaffold-layer .ts files). */
  typeDefinitions: Map<string, string>;
  /** Full content of files that the current batch directly imports from. */
  directDependencies: Map<string, string>;
  /** Lightweight summaries of already-generated files (exports/imports only). */
  fileSummaries: FileSummary[];
  /** CSS variable names extracted from generated CSS files. */
  cssVariables: string[];
  /** Type contracts and state shape entries relevant to this batch. */
  relevantContracts: {
    typeContracts: TypeContract[];
    stateShape?: StateShape;
  };
}

// ─── File Summary Adapter (Task 2.2) ────────────────────────────────────────

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const CSS_CLASS_REGEX = /\.([a-zA-Z_][\w-]*)/g;
const IMPORT_SOURCE_REGEX = /from\s+['"]([^'"]+)['"]/g;

/** Singleton — reused across calls to avoid repeated instantiation. */
const chunkBuilder = new ChunkIndexBuilder();

/**
 * Produce a lightweight summary (exports, imports, cssClasses) from file content.
 *
 * - For code files (.ts/.tsx/.js/.jsx): delegates to `ChunkIndexBuilder.parseFile()`
 *   and extracts exported symbol names + import source paths.
 * - For .css files: extracts class names via regex.
 * - For other files: returns empty arrays.
 */
export function summarizeFile(path: string, content: string): FileSummary {
  const lowerPath = path.toLowerCase();

  // CSS files — extract class names
  if (lowerPath.endsWith('.css')) {
    const cssClasses: string[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(CSS_CLASS_REGEX.source, CSS_CLASS_REGEX.flags);
    while ((match = regex.exec(content)) !== null) {
      cssClasses.push(match[1]);
    }

    // Also extract import sources from @import statements
    const imports: string[] = [];
    const importMatches = content.matchAll(/@import\s+['"]([^'"]+)['"]/g);
    for (const m of importMatches) {
      imports.push(m[1]);
    }

    return { path, exports: [], imports, cssClasses };
  }

  // Code files — use ChunkIndexBuilder
  if (CODE_EXTENSIONS.some(ext => lowerPath.endsWith(ext))) {
    const chunks = chunkBuilder.parseFile(path, content);

    const exports = chunks
      .filter(c => c.isExported)
      .map(c => c.symbolName);

    // Collect unique import sources
    const importSources = new Set<string>();
    const sourceRegex = new RegExp(IMPORT_SOURCE_REGEX.source, IMPORT_SOURCE_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = sourceRegex.exec(content)) !== null) {
      importSources.add(m[1]);
    }

    return { path, exports, imports: [...importSources], cssClasses: [] };
  }

  // Other files (package.json, .md, etc.) — no meaningful summary
  return { path, exports: [], imports: [], cssClasses: [] };
}

// ─── CSS Variable Extraction ─────────────────────────────────────────────────

const CSS_VAR_REGEX = /(--[\w-]+)/g;

/**
 * Extract CSS custom property names from CSS content.
 * Returns unique `--var-name` strings found anywhere in the content.
 */
export function extractCSSVariableNames(cssContent: string): string[] {
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(CSS_VAR_REGEX.source, CSS_VAR_REGEX.flags);
  while ((match = regex.exec(cssContent)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}

// ─── Direct Dependency Resolution ────────────────────────────────────────────

/**
 * For a set of batch files, resolve the full content of files they import from.
 *
 * Walks the plan's `imports` array for each batch file and looks up the content
 * from the `generatedFiles` map. Only returns files that have already been generated.
 *
 * @returns Map of `path → content` for each resolved dependency.
 */
export function getDirectDeps(
  batchFiles: PlannedFile[],
  plan: ArchitecturePlan,
  generatedFiles: Map<string, string>,
): Map<string, string> {
  const deps = new Map<string, string>();
  const batchPaths = new Set(batchFiles.map(f => f.path));

  for (const file of batchFiles) {
    for (const importPath of file.imports) {
      // Skip self-references and other files in this batch
      if (batchPaths.has(importPath)) continue;

      // Only include if already generated
      const content = generatedFiles.get(importPath);
      if (content !== undefined) {
        deps.set(importPath, content);
      }
    }
  }

  return deps;
}

// ─── Contract Filtering ──────────────────────────────────────────────────────

/**
 * Filter the plan's typeContracts and stateShape down to entries
 * relevant to the current batch of files.
 *
 * A type contract is relevant if any batch file exports or imports
 * a symbol that matches the contract name.
 *
 * State shape contexts/hooks are relevant if a batch file's exports
 * reference the context/hook name.
 */
export function getContractsForBatch(
  batchFiles: PlannedFile[],
  plan: ArchitecturePlan,
): { typeContracts: TypeContract[]; stateShape?: StateShape } {
  // Collect all export and import names from batch files
  const batchSymbols = new Set<string>();
  for (const file of batchFiles) {
    for (const exp of file.exports) batchSymbols.add(exp);
    // Also check imported file paths — the batch may import a types file
    for (const imp of file.imports) {
      // Find what that imported file exports
      const importedFile = plan.files.find(f => f.path === imp);
      if (importedFile) {
        for (const exp of importedFile.exports) batchSymbols.add(exp);
      }
    }
  }

  // Filter type contracts: include if the contract name appears in batchSymbols
  const relevantContracts = plan.typeContracts.filter(tc =>
    batchSymbols.has(tc.name),
  );

  // Filter state shape
  let relevantStateShape: StateShape | undefined;
  if (plan.stateShape) {
    const batchExports = new Set(batchFiles.flatMap(f => f.exports));

    const relevantContexts = plan.stateShape.contexts?.filter(ctx =>
      batchExports.has(ctx.name),
    );

    const relevantHooks = plan.stateShape.hooks?.filter(hook =>
      batchExports.has(hook.name),
    );

    if ((relevantContexts && relevantContexts.length > 0) ||
        (relevantHooks && relevantHooks.length > 0)) {
      relevantStateShape = {
        contexts: relevantContexts?.length ? relevantContexts : undefined,
        hooks: relevantHooks?.length ? relevantHooks : undefined,
      };
    }
  }

  return {
    typeContracts: relevantContracts,
    stateShape: relevantStateShape,
  };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Build the full context bundle for a generation phase.
 *
 * Data-driven: finds type/CSS files by plan layer assignments, not by
 * hardcoded path conventions.
 *
 * @param phase - The layer being generated (scaffold, logic, ui, integration)
 * @param plan - The full architecture plan
 * @param generatedFiles - Files already generated in previous phases (path → content)
 * @param currentBatchFiles - Planned files being generated in this batch
 */
export function buildPhaseContext(
  phase: PhaseLayer,
  plan: ArchitecturePlan,
  generatedFiles: Map<string, string>,
  currentBatchFiles: PlannedFile[],
): PhaseContext {
  // 1. Type definitions — full content of scaffold-layer type files
  const typeDefinitions = new Map<string, string>();
  if (phase !== 'scaffold') {
    for (const file of plan.files) {
      if (file.layer === 'scaffold') {
        const content = generatedFiles.get(file.path);
        if (content !== undefined) {
          typeDefinitions.set(file.path, content);
        }
      }
    }
  }

  // 2. Direct dependencies — full content of files this batch imports
  const directDependencies = getDirectDeps(currentBatchFiles, plan, generatedFiles);

  // 3. File summaries — lightweight summaries of all already-generated files
  const fileSummaries: FileSummary[] = [];
  for (const [path, content] of generatedFiles.entries()) {
    // Skip files already included as full content in typeDefinitions or directDeps
    if (typeDefinitions.has(path) || directDependencies.has(path)) continue;
    fileSummaries.push(summarizeFile(path, content));
  }

  // 4. CSS variables — extracted from all generated CSS files
  const cssVariables: string[] = [];
  for (const [path, content] of generatedFiles.entries()) {
    if (path.toLowerCase().endsWith('.css')) {
      cssVariables.push(...extractCSSVariableNames(content));
    }
  }

  // 5. Relevant contracts — type contracts and state shape for this batch
  const relevantContracts = getContractsForBatch(currentBatchFiles, plan);

  return {
    typeDefinitions,
    directDependencies,
    fileSummaries,
    cssVariables: [...new Set(cssVariables)], // deduplicate
    relevantContracts,
  };
}
