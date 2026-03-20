import type { ImageAttachment } from '@ai-app-builder/shared/types';
import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/integrations/backend/client';
import { createLogger } from '@/utils/logger';

const uploadLogger = createLogger('ImageUpload');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CLIENT_DIMENSION = 1200;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface UploadResult {
  success: boolean;
  attachment?: ImageAttachment;
  error?: string;
}

/**
 * Client-side resize of an image file to max dimension before upload.
 * Returns the resized file as a Blob.
 */
async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;
      // Skip resize if already within bounds
      if (width <= MAX_CLIENT_DIMENSION && height <= MAX_CLIENT_DIMENSION) {
        resolve(file);
        return;
      }

      const scale = Math.min(MAX_CLIENT_DIMENSION / width, MAX_CLIENT_DIMENSION / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file); // fallback
          }
        },
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing'));
    };

    img.src = url;
  });
}

/**
 * Validates a file before upload.
 */
function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, GIF, and WebP images are allowed';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Image is too large (max 5MB)';
  }
  return null;
}

/**
 * Uploads an image file to the backend /api/upload endpoint.
 * Performs client-side validation and resize before uploading.
 */
export async function uploadImage(file: File, alt?: string): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    // Client-side resize
    const resized = await resizeImage(file);

    const formData = new FormData();
    formData.append('file', resized, file.name);
    if (alt) {
      formData.append('alt', alt);
    }

    const response = await fetch(`${FUNCTIONS_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: { message: `Upload failed (${response.status})` } }));
      const message = data?.error?.message || `Upload failed (${response.status})`;
      uploadLogger.error('Upload failed', { status: response.status, message });
      return { success: false, error: message };
    }

    const data = await response.json();
    if (!data.success || !data.url) {
      return { success: false, error: 'Upload returned invalid response' };
    }

    return {
      success: true,
      attachment: {
        url: data.url,
        type: data.type,
        alt: data.alt,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    uploadLogger.error('Upload error', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Extracts image files from a paste event's clipboard data.
 */
export function getImagesFromClipboard(event: ClipboardEvent): File[] {
  const items = event.clipboardData?.items;
  if (!items) return [];

  const files: File[] = [];
  for (const item of items) {
    if (item.kind === 'file' && ALLOWED_TYPES.includes(item.type)) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/**
 * Extracts image files from a drop event's data transfer.
 */
export function getImagesFromDrop(event: DragEvent): File[] {
  const files: File[] = [];
  const items = event.dataTransfer?.files;
  if (!items) return [];

  for (const file of items) {
    if (ALLOWED_TYPES.includes(file.type)) {
      files.push(file);
    }
  }
  return files;
}

/**
 * Creates a local preview URL for a file. Caller must revoke with URL.revokeObjectURL.
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}
