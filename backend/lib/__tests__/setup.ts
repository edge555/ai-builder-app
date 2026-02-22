/**
 * Test setup file for Vitest
 * Sets up environment variables and mocks
 */

// Set up environment variables
process.env.OPENROUTER_API_KEY = 'test-api-key';
process.env.AI_PROVIDER = 'openrouter';
process.env.MAX_OUTPUT_TOKENS = '8192';
process.env.PORT = '4000';
process.env.CORS_ORIGIN = 'http://localhost:8080';
