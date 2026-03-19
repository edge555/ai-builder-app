/**
 * Tests for image upload API endpoint
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../../lib/security', () => ({
  applyRateLimit: vi.fn().mockResolvedValue({ blocked: null, headers: {} }),
  RateLimitTier: { MEDIUM_COST: 'MEDIUM_COST' },
}));

vi.mock('../../../lib/config', () => ({
  config: {
    storage: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceRoleKey: 'test-key',
      storageBucket: 'uploads',
    },
  },
}));

vi.mock('../../../lib/api', () => ({
  getCorsHeaders: vi.fn().mockReturnValue({ 'Access-Control-Allow-Origin': '*' }),
  handleOptions: vi.fn(() => new Response(null, { status: 204 })),
}));

vi.mock('../../../lib/request-id', () => ({
  generateRequestId: vi.fn().mockReturnValue('test-req-id'),
}));

vi.mock('../../../lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// Mock sharp
const mockSharpInstance = {
  rotate: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  jpeg: vi.fn().mockReturnThis(),
  png: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
};

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

// Mock Supabase
const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn().mockReturnValue({
  data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/uploads/images/test-req-id.jpg' },
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  })),
}));

import { POST, OPTIONS } from '../upload/route';

// Helper: create a JPEG file with valid magic bytes
function createJpegFile(sizeBytes = 1000): File {
  const buffer = new Uint8Array(sizeBytes);
  // JPEG magic bytes
  buffer[0] = 0xFF;
  buffer[1] = 0xD8;
  buffer[2] = 0xFF;
  return new File([buffer], 'test.jpg', { type: 'image/jpeg' });
}

// Helper: create a PNG file with valid magic bytes
function createPngFile(sizeBytes = 1000): File {
  const buffer = new Uint8Array(sizeBytes);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4E;
  buffer[3] = 0x47;
  return new File([buffer], 'test.png', { type: 'image/png' });
}

function createRequest(formData: FormData): NextRequest {
  return new NextRequest('http://localhost:4000/api/upload', {
    method: 'POST',
    body: formData,
  });
}

describe('Upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image'));
    mockUpload.mockResolvedValue({ error: null });
  });

  describe('OPTIONS /api/upload', () => {
    it('returns 204', async () => {
      const response = await OPTIONS();
      expect(response.status).toBe(204);
    });
  });

  describe('POST /api/upload', () => {
    it('uploads a valid JPEG and returns public URL', async () => {
      const formData = new FormData();
      formData.append('file', createJpegFile());
      formData.append('alt', 'Test image');

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.url).toContain('test.supabase.co');
      expect(data.type).toBe('image/jpeg');
      expect(data.alt).toBe('Test image');
    });

    it('uploads a valid PNG', async () => {
      const formData = new FormData();
      formData.append('file', createPngFile());

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });

    it('returns 400 when no file provided', async () => {
      const formData = new FormData();
      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('MISSING_FILE');
    });

    it('returns 413 when file exceeds 5MB', async () => {
      const formData = new FormData();
      formData.append('file', createJpegFile(6 * 1024 * 1024));

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FILE_TOO_LARGE');
    });

    it('returns 415 for unrecognized file type', async () => {
      const buffer = new Uint8Array(100);
      // Random bytes, not a valid image magic
      buffer[0] = 0x00;
      const file = new File([buffer], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(415);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('returns 422 when sharp processing fails', async () => {
      mockSharpInstance.toBuffer.mockRejectedValueOnce(new Error('Processing error'));

      const formData = new FormData();
      formData.append('file', createJpegFile());

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROCESSING_FAILED');
    });

    it('returns 502 when Supabase upload fails', async () => {
      mockUpload.mockResolvedValueOnce({ error: { message: 'Storage error' } });

      const formData = new FormData();
      formData.append('file', createJpegFile());

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UPLOAD_FAILED');
    });

    it('sanitizes alt text by stripping HTML tags', async () => {
      const formData = new FormData();
      formData.append('file', createJpegFile());
      formData.append('alt', '<script>alert("xss")</script>My <b>image</b>');

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alt).toBe('alert(xss)My image');
    });

    it('truncates alt text to 200 chars', async () => {
      const formData = new FormData();
      formData.append('file', createJpegFile());
      formData.append('alt', 'a'.repeat(300));

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.alt.length).toBe(200);
    });

    it('returns 503 when Supabase storage is not configured', async () => {
      const { config } = await import('../../../lib/config');
      const originalUrl = config.storage.supabaseUrl;
      config.storage.supabaseUrl = undefined;

      const formData = new FormData();
      formData.append('file', createJpegFile());

      const response = await POST(createRequest(formData));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.code).toBe('STORAGE_NOT_CONFIGURED');

      // Restore
      config.storage.supabaseUrl = originalUrl;
    });
  });
});
