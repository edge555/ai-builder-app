/**
 * Diff API Endpoint
 * POST /api/diff
 * 
 * Computes diffs between two versions.
 * Implements Requirement 10.3
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ComputeDiffResponse, ErrorResponse } from '@ai-app-builder/shared';
import { ComputeDiffRequestSchema } from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getDiffEngine } from '../../../lib/diff';
import { getCorsHeaders, handleOptions, handleError, AppError } from '../../../lib/api';

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse<ComputeDiffResponse | ErrorResponse>> {
  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedRequest = ComputeDiffRequestSchema.parse(body);

    const { fromVersionId, toVersionId } = validatedRequest;

    // Get version manager
    const versionManager = getVersionManager();

    // We need to find the versions - they could be in any project
    let fromVersion = null;
    let toVersion = null;
    let projectId: string | null = null;

    // Search through all projects to find the versions
    const projectIdParam = (body as ComputeDiffRequest & { projectId?: string }).projectId;

    if (projectIdParam) {
      fromVersion = versionManager.getVersion(projectIdParam, fromVersionId);
      toVersion = versionManager.getVersion(projectIdParam, toVersionId);
      projectId = projectIdParam;
    } else {
      const fromResult = versionManager.findVersion(fromVersionId);
      const toResult = versionManager.findVersion(toVersionId);

      if (fromResult) {
        fromVersion = fromResult.version;
        projectId = fromResult.projectId;
      }

      if (toResult) {
        toVersion = toResult.version;
        if (projectId && toResult.projectId !== projectId) {
          throw AppError.state(
            'VERSION_PROJECT_MISMATCH',
            'Requested versions belong to different projects',
            { fromProjectId: projectId, toProjectId: toResult.projectId }
          );
        }
        projectId = toResult.projectId;
      }
    }

    if (!fromVersion) {
      throw AppError.state(
        'FROM_VERSION_NOT_FOUND',
        `Version with ID '${fromVersionId}' not found`,
        { versionId: fromVersionId },
        404
      );
    }

    if (!toVersion) {
      throw AppError.state(
        'TO_VERSION_NOT_FOUND',
        `Version with ID '${toVersionId}' not found`,
        { versionId: toVersionId },
        404
      );
    }

    // Compute diffs between the two versions
    const diffs = getDiffEngine().computeDiffsFromFiles(fromVersion.files, toVersion.files);

    // Return successful response
    const response: ComputeDiffResponse = {
      success: true,
      diffs,
    };

    return NextResponse.json(response, { status: 200, headers: getCorsHeaders() });

  } catch (error) {
    return handleError(error, 'api/diff');
  }
}
