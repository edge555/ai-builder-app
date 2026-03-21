/**
 * @module analysis/impact-analyzer
 * @description Analyzes the impact of modifying a set of files by computing
 * topological execution order, parallelization tiers, and affected-but-unmodified files.
 */

import type { DependencyGraph } from './dependency-graph';

export interface ImpactReport {
  /** Files to modify in topological order (leaves first) */
  modificationOrder: string[];
  /** Files grouped by dependency depth — files in the same tier can be modified in parallel */
  tiers: string[][];
  /** Files that import modified files but are not themselves being modified */
  affectedButUnmodified: string[];
  /** Rough magnitude estimate based on file count and affected spread */
  estimatedMagnitude: 'small' | 'medium' | 'large';
}

/**
 * Analyze the impact of modifying the given files.
 *
 * @param filesToModify - Files that will be changed
 * @param depGraph - Pre-built dependency graph
 */
export function analyzeImpact(
  filesToModify: string[],
  depGraph: DependencyGraph,
): ImpactReport {
  // 1. Topological order (leaves first)
  const modificationOrder = depGraph.getTopologicalOrder(filesToModify);

  // 2. Build tiers by dependency depth within the filesToModify set
  const tiers = buildTiers(modificationOrder, depGraph, new Set(filesToModify));

  // 3. Affected but unmodified
  const transitivelyAffected = depGraph.getTransitivelyAffected(filesToModify);
  const affectedButUnmodified = Array.from(transitivelyAffected);

  // 4. Magnitude estimate
  const totalAffected = filesToModify.length + affectedButUnmodified.length;
  let estimatedMagnitude: ImpactReport['estimatedMagnitude'];
  if (filesToModify.length <= 2 && totalAffected <= 4) {
    estimatedMagnitude = 'small';
  } else if (filesToModify.length <= 5 && totalAffected <= 10) {
    estimatedMagnitude = 'medium';
  } else {
    estimatedMagnitude = 'large';
  }

  return {
    modificationOrder,
    tiers,
    affectedButUnmodified,
    estimatedMagnitude,
  };
}

/**
 * Group topologically sorted files into parallelizable tiers.
 * A file is in tier N if all its dependencies (within the modify set)
 * are in tiers < N.
 */
function buildTiers(
  topoOrder: string[],
  depGraph: DependencyGraph,
  modifySet: Set<string>,
): string[][] {
  const tierMap = new Map<string, number>();

  for (const file of topoOrder) {
    let maxDepTier = -1;
    const deps = depGraph.getDependencies(file);
    for (const dep of deps) {
      if (modifySet.has(dep) && tierMap.has(dep)) {
        maxDepTier = Math.max(maxDepTier, tierMap.get(dep)!);
      }
    }
    tierMap.set(file, maxDepTier + 1);
  }

  // Collect files per tier
  const tiers: string[][] = [];
  for (const [file, tier] of tierMap) {
    while (tiers.length <= tier) tiers.push([]);
    tiers[tier].push(file);
  }

  return tiers;
}
