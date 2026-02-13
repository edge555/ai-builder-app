/**
 * Test setup file for Vitest
 * Sets up environment variables and mocks
 */

// Set up environment variables
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.MAX_OUTPUT_TOKENS = '8192';
process.env.PORT = '4000';
process.env.CORS_ORIGIN = 'http://localhost:8080';
