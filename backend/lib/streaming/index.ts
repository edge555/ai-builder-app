/**
 * @module streaming
 * @description Barrel export for SSE streaming utilities.
 * Re-exports the BackpressureController and EventPriority for use by API route handlers.
 *
 * @requires ./backpressure-controller - Flow control for SSE streams
 */

export {
  BackpressureController,
  EventPriority,
  type BackpressureConfig,
} from './backpressure-controller';
