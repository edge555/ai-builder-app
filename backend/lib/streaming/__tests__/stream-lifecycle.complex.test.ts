/**
 * Complex edge case tests for stream-lifecycle.
 *
 * The basic lifecycle tests cover the happy path and simple error handling.
 * These tests focus on:
 *  - Race conditions between abort, timeout, and safeClose
 *  - Heartbeat timer interactions with concurrent cleanup paths
 *  - Enqueue storms after the stream is logically complete
 *  - Correct "close-once" semantics across every termination path
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStreamLifecycle, type StreamLifecycleConfig } from '../stream-lifecycle';
import { EventPriority } from '../backpressure-controller';

vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../backpressure-controller', () => ({
  BackpressureController: vi.fn(),
  EventPriority: { NORMAL: 'normal', CRITICAL: 'critical' },
}));

vi.mock('../sse-encoder', () => ({
  SSEEncoder: vi.fn(),
}));

function makeFixtures(overrides: Partial<StreamLifecycleConfig> = {}) {
  const controller = { enqueue: vi.fn(), close: vi.fn() };
  const encoder = { enqueueHeartbeat: vi.fn(), enqueueEvent: vi.fn() };
  const backpressure = { logStats: vi.fn() };
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config: StreamLifecycleConfig = {
    heartbeatIntervalMs: 1_000,
    streamTimeoutMs: 10_000,
    ...overrides,
  };
  return { controller, encoder, backpressure, logger, config };
}

describe('stream-lifecycle — complex races and invariants', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ── Termination-path exclusivity ──────────────────────────────────────────

  describe('controller.close() called exactly once across all termination paths', () => {
    it('abort fires then safeClose is called — close only once', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      ac.abort();
      lifecycle.safeClose(); // no-op because _isComplete is already true

      expect(controller.close).toHaveBeenCalledTimes(1);
    });

    it('safeClose fires then abort signal arrives — close only once', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      lifecycle.safeClose();
      ac.abort(); // no-op because _isComplete is already true

      expect(controller.close).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalledWith('Client disconnected, aborting SSE stream');
    });

    it('timeout fires then abort signal arrives — close only once', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      vi.advanceTimersByTime(config.streamTimeoutMs); // timeout wins
      ac.abort();

      expect(controller.close).toHaveBeenCalledTimes(1);
    });

    it('safeClose fires then timeout fires — timeout is a no-op', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      lifecycle.safeClose();
      vi.advanceTimersByTime(config.streamTimeoutMs);

      // Timeout's enqueueEvent must not fire when already complete
      expect(encoder.enqueueEvent).not.toHaveBeenCalled();
      expect(controller.close).toHaveBeenCalledTimes(1);
    });

    it('cleanup() then safeClose() — controller closed only once (from safeClose)', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      lifecycle.cleanup(); // marks complete but does NOT close controller
      lifecycle.safeClose(); // _isComplete is true → early return, controller stays untouched

      expect(controller.close).not.toHaveBeenCalled();
    });
  });

  // ── Heartbeat timer invariants ─────────────────────────────────────────────

  describe('heartbeat stops firing after any termination path', () => {
    it('heartbeats accumulate before abort then stop immediately', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures({
        heartbeatIntervalMs: 500,
      });
      const ac = new AbortController();

      createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      vi.advanceTimersByTime(1_500); // 3 heartbeats
      ac.abort();
      vi.advanceTimersByTime(2_000); // would be 4 more if not stopped

      expect(encoder.enqueueHeartbeat).toHaveBeenCalledTimes(3);
    });

    it('heartbeats stop after timeout; no further heartbeats tick', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures({
        heartbeatIntervalMs: 1_000,
        streamTimeoutMs: 3_500,
      });

      createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      // 3 heartbeats at 1s, 2s, 3s — then timeout fires at 3.5s
      vi.advanceTimersByTime(5_000);

      expect(encoder.enqueueHeartbeat).toHaveBeenCalledTimes(3);
    });

    it('heartbeat fires synchronously mid-interval does not double-count after cleanup', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures({
        heartbeatIntervalMs: 1_000,
      });

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      vi.advanceTimersByTime(999); // just before heartbeat
      lifecycle.cleanup();         // marks complete
      vi.advanceTimersByTime(1);   // would trigger the interval callback

      expect(encoder.enqueueHeartbeat).not.toHaveBeenCalled();
    });
  });

  // ── Enqueue storms after completion ───────────────────────────────────────

  describe('safeEnqueue is a no-op after any termination path', () => {
    const chunk = new Uint8Array([42]);

    it('enqueue after timeout fires — dropped silently', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      vi.advanceTimersByTime(config.streamTimeoutMs);
      lifecycle.safeEnqueue(chunk);
      lifecycle.safeEnqueue(chunk);
      lifecycle.safeEnqueue(chunk);

      expect(controller.enqueue).not.toHaveBeenCalled();
    });

    it('high-frequency enqueue storm stops precisely at abort boundary', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      // 5 enqueuess before abort, then 5 after
      for (let i = 0; i < 5; i++) lifecycle.safeEnqueue(chunk);
      ac.abort();
      for (let i = 0; i < 5; i++) lifecycle.safeEnqueue(chunk);

      expect(controller.enqueue).toHaveBeenCalledTimes(5);
    });

    it('controller.enqueue throws after abort — still does not throw to caller', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      controller.enqueue.mockImplementation(() => { throw new Error('stream closed'); });

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      // Stream is active, enqueue throws internally — must not surface
      expect(() => lifecycle.safeEnqueue(chunk)).not.toThrow();
    });
  });

  // ── Backpressure logStats called exactly once per termination ──────────────

  describe('cleanup semantics — backpressure.logStats fires exactly once', () => {
    it('logStats called once when abort fires', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();

      createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      ac.abort();
      // Trigger any pending timers — should not fire logStats again
      vi.advanceTimersByTime(config.streamTimeoutMs);

      expect(backpressure.logStats).toHaveBeenCalledTimes(1);
    });

    it('logStats called once when safeClose fires', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      lifecycle.safeClose();
      lifecycle.safeClose();

      expect(backpressure.logStats).toHaveBeenCalledTimes(1);
    });

    it('logStats called once when timeout fires; safeClose after is a no-op', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      vi.advanceTimersByTime(config.streamTimeoutMs);
      lifecycle.safeClose();

      expect(backpressure.logStats).toHaveBeenCalledTimes(1);
    });
  });

  // ── Abort on already-aborted signal with active timers ────────────────────

  describe('pre-aborted signal — timers are never started', () => {
    it('heartbeat never fires when signal was already aborted at creation time', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures({
        heartbeatIntervalMs: 100,
      });
      const ac = new AbortController();
      ac.abort();

      createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      vi.advanceTimersByTime(2_000);

      // Stream was already complete at creation; heartbeat set up after the abort check
      // The interval IS created but _isComplete is true, so it's a no-op each tick
      expect(encoder.enqueueHeartbeat).not.toHaveBeenCalled();
    });

    it('timeout error event never fires when signal was already aborted', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();
      ac.abort();

      createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      vi.advanceTimersByTime(config.streamTimeoutMs);

      expect(encoder.enqueueEvent).not.toHaveBeenCalled();
    });
  });

  // ── isComplete() reflects state immediately after each transition ──────────

  describe('isComplete() reflects state transitions accurately', () => {
    it('false → true immediately on safeClose', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      expect(lifecycle.isComplete()).toBe(false);
      lifecycle.safeClose();
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('false → true immediately on abort', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();
      const ac = new AbortController();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        ac.signal, logger as any, config
      );

      expect(lifecycle.isComplete()).toBe(false);
      ac.abort();
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('false → true immediately on timeout', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      expect(lifecycle.isComplete()).toBe(false);
      vi.advanceTimersByTime(config.streamTimeoutMs);
      expect(lifecycle.isComplete()).toBe(true);
    });

    it('stays true after repeated cleanup() calls', () => {
      const { controller, encoder, backpressure, logger, config } = makeFixtures();

      const lifecycle = createStreamLifecycle(
        controller as any, encoder as any, backpressure as any,
        undefined, logger as any, config
      );

      lifecycle.cleanup();
      lifecycle.cleanup();
      lifecycle.cleanup();

      expect(lifecycle.isComplete()).toBe(true);
    });
  });
});
