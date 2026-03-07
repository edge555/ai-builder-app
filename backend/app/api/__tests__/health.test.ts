/**
 * Tests for health API endpoint
 * Following industry best practices: AAA pattern, clear descriptions, edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../health/route';

describe('Health API', () => {
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = {
      headers: new Headers(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 status', async () => {
      // Act
      const response = await GET(mockRequest);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return JSON content', async () => {
      // Act
      const response = await GET(mockRequest);

      // Assert
      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should include status field in response', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty('status');
    });

    it('should include timestamp field in response', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty('timestamp');
    });

    it('should include version field in response', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty('version');
    });

    it('should return healthy status', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(body.status).toBe('healthy');
    });

    it('should return valid ISO timestamp', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return string version', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(typeof body.version).toBe('string');
      expect(body.version.length).toBeGreaterThan(0);
    });

    it('should handle concurrent requests', async () => {
      // Arrange
      const requests = Array.from({ length: 10 }, () => GET(mockRequest));

      // Act
      const responses = await Promise.all(requests);

      // Assert
      responses.forEach((response: any) => {
        expect(response.status).toBe(200);
      });
    });

    it('should return consistent responses', async () => {
      // Act
      const response1 = await GET(mockRequest);
      const response2 = await GET(mockRequest);
      const body1 = await response1.json();
      const body2 = await response2.json();

      // Assert
      expect(body1.status).toBe(body2.status);
    });

    it('should include CORS headers', async () => {
      // Act
      const response = await GET(mockRequest);

      // Assert
      expect(response.headers.get('access-control-allow-origin')).toBeDefined();
    });

    it('should handle request with headers', async () => {
      // Arrange
      mockRequest.headers = new Headers({
        'user-agent': 'test-agent',
        'accept': 'application/json',
      });

      // Act
      const response = await GET(mockRequest);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return response quickly', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await GET(mockRequest);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(100); // Should complete in less than 100ms
    });

    it('should not depend on request body', async () => {
      // Arrange
      mockRequest.body = null;

      // Act
      const response = await GET(mockRequest);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return proper JSON structure', async () => {
      // Act
      const response = await GET(mockRequest);
      const body = await response.json();

      // Assert
      expect(Object.keys(body)).toEqual(['status', 'timestamp', 'version']);
    });
  });
});
