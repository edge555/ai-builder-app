/**
 * Diff API Endpoint
 * POST /api/diff
 * 
 * Computes diffs between two versions.
 * Implements Requirement 10.3
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ComputeDiffRequest, ComputeDiffResponse, ErrorResponse } from '@ai-app-builder/shared';
import { getVersionManager } from '../../../lib/core';
import { getDiffEngine } from '../../../lib/diff';
import { getCorsHeaders, handleOptions, createErrorResponse } from '../../../lib/api';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('api/diff');

/**
 * Handle OPTIONS preflight request
 */
export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<NextResponse<ComputeDiffResponse | ErrorResponse>> {
  const corsHeaders = getCorsHeaders();

  try {
    // Parse request body
    let body: ComputeDiffRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_JSON', message: 'Request body must be valid JSON' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate required fields
    const { fromVersionId, toVersionId } = body;

    if (!fromVersionId) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'MISSING_FROM_VERSION_ID', message: 'fromVersionId is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!toVersionId) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'MISSING_TO_VERSION_ID', message: 'toVersionId is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof fromVersionId !== 'string' || fromVersionId.trim().length === 0) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_FROM_VERSION_ID', message: 'fromVersionId must be a non-empty string' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof toVersionId !== 'string' || toVersionId.trim().length === 0) {
      return NextResponse.json(
        createErrorResponse({ type: 'api', code: 'INVALID_TO_VERSION_ID', message: 'toVersionId must be a non-empty string' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get version manager
    const versionManager = getVersionManager();

    // We need to find the versions - they could be in any project
    // First, try to find the fromVersion
    let fromVersion = null;
    let toVersion = null;
    let projectId: string | null = null;

    // Search through all projects to find the versions
    // This is a limitation of the current in-memory storage design
    // In a real implementation, we'd have a more efficient lookup

    // For now, we need to get the projectId from the request or search
    // Let's check if projectId is provided in the request
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
          return NextResponse.json(
            createErrorResponse({
              type: 'state',
              code: 'VERSION_PROJECT_MISMATCH',
              message: 'Requested versions belong to different projects',
              details: { fromProjectId: projectId, toProjectId: toResult.projectId },
            }),
            { status: 409, headers: corsHeaders }
          );
        }
        projectId = toResult.projectId;
      }
    }

    if (!fromVersion) {
      return NextResponse.json(
        createErrorResponse({
          type: 'state',
          code: 'FROM_VERSION_NOT_FOUND',
          message: `Version with ID '${fromVersionId}' not found`,
          details: { versionId: fromVersionId }
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    if (!toVersion) {
      return NextResponse.json(
        createErrorResponse({
          type: 'state',
          code: 'TO_VERSION_NOT_FOUND',
          message: `Version with ID '${toVersionId}' not found`,
          details: { versionId: toVersionId }
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Compute diffs between the two versions
    const diffs = getDiffEngine().computeDiffsFromFiles(fromVersion.files, toVersion.files);

    // Return successful response
    const response: ComputeDiffResponse = {
      success: true,
      diffs,
    };

    return NextResponse.json(response, { status: 200, headers: corsHeaders });

  } catch (error) {
    logger.error('Error in diff endpoint', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      createErrorResponse({
        type: 'unknown',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: { message: error instanceof Error ? error.message : 'Unknown error' },
        recoverable: true
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
