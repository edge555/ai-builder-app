import type { Logger } from '../logger';
import type { BackpressureController } from './backpressure-controller';
import { EventPriority, type SSEEncoder } from './sse-encoder';

export interface StreamLifecycleConfig {
  heartbeatIntervalMs: number;
  streamTimeoutMs: number;
}

export interface StreamLifecycle {
  /** Returns true once the stream has been closed or aborted */
  isComplete: () => boolean;
  /** Clears timers and marks the stream as complete; does NOT close the controller */
  cleanup: () => void;
  /** Safely closes the controller, calling cleanup first; no-op if already complete */
  safeClose: () => void;
  /** Safely enqueues data; no-op if the stream is already complete */
  safeEnqueue: (data: Uint8Array) => void;
}

/**
 * Sets up shared SSE stream lifecycle management: heartbeat, timeout, abort handling, and cleanup.
 * Call this inside a ReadableStream's `start(controller)` callback.
 *
 * Returns { isComplete, safeClose, safeEnqueue } for use by the route handler.
 */
export function createStreamLifecycle(
  controller: ReadableStreamDefaultController,
  encoder: SSEEncoder,
  backpressure: BackpressureController,
  signal: AbortSignal | undefined,
  contextLogger: Logger,
  config: StreamLifecycleConfig
): StreamLifecycle {
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let streamTimeout: NodeJS.Timeout | null = null;
  let _isComplete = false;

  const cleanup = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (streamTimeout) clearTimeout(streamTimeout);
    heartbeatInterval = null;
    streamTimeout = null;
    _isComplete = true;
    backpressure.logStats();
  };

  const safeEnqueue = (data: Uint8Array) => {
    if (_isComplete) return;
    try {
      controller.enqueue(data);
    } catch {
      // Controller already closed (client disconnected)
    }
  };

  const safeClose = () => {
    if (_isComplete) return;
    cleanup();
    try {
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const onAbort = () => {
    if (_isComplete) return;
    contextLogger.info('Client disconnected, aborting SSE stream');
    cleanup();
    try {
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  // Heartbeat to prevent proxy timeouts
  heartbeatInterval = setInterval(() => {
    if (!_isComplete) {
      encoder.enqueueHeartbeat(controller);
    }
  }, config.heartbeatIntervalMs);

  // Stream timeout
  streamTimeout = setTimeout(() => {
    if (!_isComplete) {
      cleanup();
      encoder.enqueueEvent(
        controller,
        'error',
        { error: `Stream timeout after ${config.streamTimeoutMs / 1000} seconds` },
        EventPriority.CRITICAL
      );
      controller.close();
    }
  }, config.streamTimeoutMs);

  return {
    isComplete: () => _isComplete,
    cleanup,
    safeClose,
    safeEnqueue,
  };
}
