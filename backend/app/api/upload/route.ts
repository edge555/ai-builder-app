/**
 * Image Upload API Endpoint
 * POST /api/upload
 *
 * Accepts a single image file via multipart/form-data.
 * Validates magic bytes, re-encodes through sharp to strip EXIF/payloads,
 * uploads to Supabase Storage, and returns the public URL.
 *
 * Security:
 * - Magic byte validation (not just extension/Content-Type)
 * - Re-encode through sharp to neutralize embedded payloads
 * - SVGs rejected entirely (script injection risk)
 * - Alt text sanitized (HTML stripped, max 200 chars)
 * - 5MB file size limit
 */

import { NextRequest } from 'next/server';
import { applyRateLimit, RateLimitTier } from '../../../lib/security';
import { getCorsHeaders, handleOptions } from '../../../lib/api';
import { AppError } from '../../../lib/api/error';
import { generateRequestId } from '../../../lib/request-id';
import { createLogger } from '../../../lib/logger';
import { config } from '../../../lib/config';

const logger = createLogger('api/upload');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_DIMENSION = 1200; // Max width/height after resize

/**
 * Known magic bytes for supported image formats.
 */
const MAGIC_BYTES: Record<string, { bytes: number[]; mime: string }> = {
  jpeg: { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  png: { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  gif: { bytes: [0x47, 0x49, 0x46], mime: 'image/gif' },
  webp_riff: { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' },
};

function detectMimeFromBytes(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));

  for (const { bytes: magic, mime } of Object.values(MAGIC_BYTES)) {
    if (magic.every((b, i) => bytes[i] === b)) {
      // WebP needs additional check: bytes 8-11 should be "WEBP"
      if (mime === 'image/webp') {
        if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
          return mime;
        }
        continue;
      }
      return mime;
    }
  }
  return null;
}

function sanitizeAltText(alt: string): string {
  return alt
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/[<>&"']/g, '') // strip remaining dangerous chars
    .trim()
    .slice(0, 200);
}

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest): Promise<Response> {
  const { blocked, headers: rlHeaders } = await applyRateLimit(request, RateLimitTier.MEDIUM_COST);
  if (blocked) return blocked;

  const requestId = generateRequestId();
  const contextLogger = logger.withRequestId(requestId);

  try {
    // CSRF check — throws AppError (403) on invalid origin for mutations
    const corsHeaders = getCorsHeaders(request, { rejectInvalidOrigin: true });

    // Verify Supabase storage is configured
    if (!config.storage.supabaseUrl || !config.storage.supabaseServiceRoleKey) {
      contextLogger.error('Supabase storage not configured');
      return new Response(
        JSON.stringify({ success: false, error: { type: 'api', code: 'STORAGE_NOT_CONFIGURED', message: 'Image upload is not available', recoverable: false } }),
        { status: 503, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = formData.get('alt') as string | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: { type: 'validation', code: 'MISSING_FILE', message: 'No file provided', recoverable: false } }),
        { status: 400, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      contextLogger.warn('File too large', { size: file.size, max: MAX_FILE_SIZE });
      return new Response(
        JSON.stringify({ success: false, error: { type: 'validation', code: 'FILE_TOO_LARGE', message: 'File too large (max 5MB)', recoverable: false } }),
        { status: 413, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();

    // Validate magic bytes — reject SVGs and unrecognized formats
    const detectedMime = detectMimeFromBytes(arrayBuffer);
    if (!detectedMime) {
      contextLogger.warn('Invalid file type', { claimedType: file.type, name: file.name });
      return new Response(
        JSON.stringify({ success: false, error: { type: 'validation', code: 'INVALID_FILE_TYPE', message: 'Only images allowed (JPG, PNG, GIF, WebP)', recoverable: false } }),
        { status: 415, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }

    contextLogger.info('Processing image upload', {
      originalSize: file.size,
      detectedMime,
      name: file.name,
    });

    // Re-encode through sharp to strip EXIF, embedded payloads, and resize
    let processedBuffer: Buffer;
    let outputMime: string;
    try {
      const sharp = (await import('sharp')).default;
      const inputBuffer = Buffer.from(arrayBuffer);
      let pipeline = sharp(inputBuffer)
        .rotate() // auto-rotate based on EXIF (then strips EXIF)
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        });

      // Re-encode to the detected format (strips all metadata)
      if (detectedMime === 'image/png') {
        pipeline = pipeline.png({ compressionLevel: 8 });
        outputMime = 'image/png';
      } else if (detectedMime === 'image/gif') {
        // Sharp converts GIF to PNG for static frames
        pipeline = pipeline.png({ compressionLevel: 8 });
        outputMime = 'image/png';
      } else if (detectedMime === 'image/webp') {
        pipeline = pipeline.webp({ quality: 85 });
        outputMime = 'image/webp';
      } else {
        pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
        outputMime = 'image/jpeg';
      }

      processedBuffer = await pipeline.toBuffer();
    } catch (err) {
      contextLogger.error('Sharp processing failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return new Response(
        JSON.stringify({ success: false, error: { type: 'validation', code: 'PROCESSING_FAILED', message: 'Could not process image', recoverable: false } }),
        { status: 422, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }

    // Upload to Supabase Storage
    const ext = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `images/${requestId}.${ext}`;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        config.storage.supabaseUrl!,
        config.storage.supabaseServiceRoleKey!
      );

      const { error: uploadError } = await supabase.storage
        .from(config.storage.storageBucket)
        .upload(storagePath, processedBuffer, {
          contentType: outputMime,
          upsert: false,
        });

      if (uploadError) {
        contextLogger.error('Supabase Storage upload failed', {
          error: uploadError.message,
        });
        return new Response(
          JSON.stringify({ success: false, error: { type: 'api', code: 'UPLOAD_FAILED', message: 'Upload failed, please retry', recoverable: true } }),
          { status: 502, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
        );
      }

      const { data: urlData } = supabase.storage
        .from(config.storage.storageBucket)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      contextLogger.info('Image uploaded successfully', {
        originalSize: file.size,
        processedSize: processedBuffer.length,
        path: storagePath,
      });

      return new Response(
        JSON.stringify({
          success: true,
          url: publicUrl,
          type: outputMime,
          alt: altText ? sanitizeAltText(altText) : undefined,
        }),
        {
          status: 201,
          headers: {
            ...getCorsHeaders(request),
            ...rlHeaders,
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
          },
        }
      );
    } catch (err) {
      contextLogger.error('Supabase client error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return new Response(
        JSON.stringify({ success: false, error: { type: 'api', code: 'UPLOAD_FAILED', message: 'Upload failed, please retry', recoverable: true } }),
        { status: 502, headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }
  } catch (error) {
    // Re-throw AppError (e.g., CSRF 403) with proper status
    if (error instanceof AppError) {
      return new Response(
        JSON.stringify({ success: false, error: error.toApiError() }),
        { status: error.statusCode, headers: { ...getCorsHeaders(request), ...rlHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }
    contextLogger.error('Upload endpoint error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ success: false, error: { type: 'api', code: 'INTERNAL_ERROR', message: 'Internal server error', recoverable: false } }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
    );
  }
}
