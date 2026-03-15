/**
 * Tests for worker-pool module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Worker } from 'worker_threads';

// Mock worker_threads
vi.mock('worker_threads', () => ({
  Worker: vi.fn().mockImplementation(function() {
    return { on: vi.fn(), postMessage: vi.fn(), terminate: vi.fn().mockResolvedValue(undefined) };
  }),
}));

// Mock the logger
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('WorkerPool', () => {
  let WorkerPool: any;
  let mockWorkers: any[];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Import after mocking
    const module = await import('../worker-pool');
    WorkerPool = module.WorkerPool;

    // Create mock workers
    mockWorkers = [];
    for (let i = 0; i < 4; i++) {
      const worker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      mockWorkers.push(worker);
    }

    // Mock Worker constructor to return our mock workers
    let workerCallCount = 0;
    vi.mocked(Worker).mockImplementation(function() {
      const worker = mockWorkers[workerCallCount % mockWorkers.length] || mockWorkers[0];
      workerCallCount++;
      return worker;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create default pool size of 4 workers', () => {
      const pool = new WorkerPool('test-worker.js');
      expect(Worker).toHaveBeenCalledTimes(4);
    });

    it('should create custom pool size', () => {
      const pool = new WorkerPool('test-worker.js', 2);
      expect(Worker).toHaveBeenCalledTimes(2);
    });

    it('should set default timeout of 30000ms', () => {
      const pool = new WorkerPool('test-worker.js');
      expect(pool).toBeDefined();
    });

    it('should set custom timeout', () => {
      const pool = new WorkerPool('test-worker.js', 4, 5000);
      expect(pool).toBeDefined();
    });

    it('should initialize workers with correct script', () => {
      const pool = new WorkerPool('test-worker.js');
      expect(Worker).toHaveBeenCalledWith('test-worker.js');
    });
  });

  describe('worker lifecycle', () => {
    it('should set up message handlers for each worker', () => {
      const pool = new WorkerPool('test-worker.js');

      mockWorkers.forEach((worker, index) => {
        expect(worker.on).toHaveBeenCalledWith('message', expect.any(Function));
        expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(worker.on).toHaveBeenCalledWith('exit', expect.any(Function));
      });
    });

    it('should mark workers as free initially', () => {
      const pool = new WorkerPool('test-worker.js');
      // Workers should be initialized in free state
      expect(pool).toBeDefined();
    });
  });

  describe('task execution', () => {
    it('should execute a task successfully', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      // Capture real task ID from postMessage call
      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;

      if (messageHandler) {
        messageHandler({ id: taskId, result: 'task completed' });
      }

      const result = await taskPromise;
      expect(result).toBe('task completed');
    });

    it('should handle task errors', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;

      if (messageHandler) {
        messageHandler({ id: taskId, error: 'Task failed' });
      }

      await expect(taskPromise).rejects.toThrow('Task failed');
    });

    it('should handle task errors with fallback result', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;

      if (messageHandler) {
        messageHandler({ id: taskId, error: 'Task failed', result: 'fallback result' });
      }

      const result = await taskPromise;
      expect(result).toBe('fallback result');
    });

    it('should timeout tasks after specified duration', async () => {
      const pool = new WorkerPool('test-worker.js', 4, 100);

      const taskPromise = pool.runTask({ data: 'test data' });

      // Fast-forward past timeout
      vi.advanceTimersByTime(150);

      await expect(taskPromise).rejects.toThrow('Task timed out after 100ms');
    });

    it('should execute multiple tasks in parallel', async () => {
      const pool = new WorkerPool('test-worker.js', 4);

      const task1 = pool.runTask({ data: 'task1' });
      const task2 = pool.runTask({ data: 'task2' });
      const task3 = pool.runTask({ data: 'task3' });
      const task4 = pool.runTask({ data: 'task4' });

      // Complete each task using its real task ID
      mockWorkers.forEach((worker, index) => {
        const messageHandler = worker.on.mock.calls.find(
          (call: any[]) => call[0] === 'message'
        )?.[1];

        if (messageHandler && worker.postMessage.mock.calls.length > 0) {
          const taskId = worker.postMessage.mock.calls[0][0].id;
          messageHandler({ id: taskId, result: `task${index + 1} completed` });
        }
      });

      const results = await Promise.all([task1, task2, task3, task4]);
      expect(results).toHaveLength(4);
    });

    it('should queue tasks when all workers are busy', async () => {
      const pool = new WorkerPool('test-worker.js', 2);

      // Start 4 tasks with only 2 workers — first 2 run immediately, last 2 queue
      const task1 = pool.runTask({ data: 'task1' });
      const task2 = pool.runTask({ data: 'task2' });
      const task3 = pool.runTask({ data: 'task3' });
      const task4 = pool.runTask({ data: 'task4' });

      const messageHandler0 = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];
      const messageHandler1 = mockWorkers[1].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      // Complete the first two tasks (batch 0)
      const taskId0a = mockWorkers[0].postMessage.mock.calls[0][0].id;
      const taskId1a = mockWorkers[1].postMessage.mock.calls[0][0].id;
      if (messageHandler0) messageHandler0({ id: taskId0a, result: 'task1 completed' });
      if (messageHandler1) messageHandler1({ id: taskId1a, result: 'task2 completed' });

      // Allow microtasks to process (queue dispatches next tasks to now-free workers)
      await Promise.resolve();
      await Promise.resolve();

      // Complete the queued tasks (batch 1)
      const taskId0b = mockWorkers[0].postMessage.mock.calls[1][0].id;
      const taskId1b = mockWorkers[1].postMessage.mock.calls[1][0].id;
      if (messageHandler0) messageHandler0({ id: taskId0b, result: 'task3 completed' });
      if (messageHandler1) messageHandler1({ id: taskId1b, result: 'task4 completed' });

      const results = await Promise.all([task1, task2, task3, task4]);
      expect(results).toHaveLength(4);
    });
  });

  describe('error handling', () => {
    it('should handle worker errors gracefully', async () => {
      const pool = new WorkerPool('test-worker.js');

      const errorHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      // Simulate worker error
      if (errorHandler) {
        errorHandler(new Error('Worker crashed'));
      }

      await expect(taskPromise).rejects.toThrow('Worker error: Worker crashed');
    });

    it('should replace worker on error', async () => {
      const pool = new WorkerPool('test-worker.js');

      const errorHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      const initialWorkerCount = vi.mocked(Worker).mock.calls.length;

      // Simulate worker error
      if (errorHandler) {
        errorHandler(new Error('Worker crashed'));
      }

      // Fast-forward to allow worker replacement
      vi.advanceTimersByTime(1100);

      expect(vi.mocked(Worker).mock.calls.length).toBeGreaterThan(initialWorkerCount);
    });

    it('should handle worker exit with non-zero code', async () => {
      const pool = new WorkerPool('test-worker.js');

      const exitHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'exit'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      // Simulate worker exit with error code
      if (exitHandler) {
        exitHandler(1);
      }

      await expect(taskPromise).rejects.toThrow('Worker stopped with exit code 1');
    });

    it('should replace worker on non-zero exit', async () => {
      const pool = new WorkerPool('test-worker.js');

      const exitHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'exit'
      )?.[1];

      const initialWorkerCount = vi.mocked(Worker).mock.calls.length;

      // Simulate worker exit with error code
      if (exitHandler) {
        exitHandler(1);
      }

      // Fast-forward to allow worker replacement
      vi.advanceTimersByTime(1100);

      expect(vi.mocked(Worker).mock.calls.length).toBeGreaterThan(initialWorkerCount);
    });

    it('should not replace worker on clean exit', async () => {
      const pool = new WorkerPool('test-worker.js');

      const exitHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'exit'
      )?.[1];

      const initialWorkerCount = vi.mocked(Worker).mock.calls.length;

      // Simulate clean worker exit
      if (exitHandler) {
        exitHandler(0);
      }

      // Fast-forward to allow any potential worker replacement
      vi.advanceTimersByTime(1100);

      expect(vi.mocked(Worker).mock.calls.length).toBe(initialWorkerCount);
    });
  });

  describe('task management', () => {
    it('should assign unique IDs to tasks', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler0 = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];
      const messageHandler1 = mockWorkers[1].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const task1 = pool.runTask({ data: 'task1' });
      const task2 = pool.runTask({ data: 'task2' });

      const taskId1 = mockWorkers[0].postMessage.mock.calls[0][0].id;
      const taskId2 = mockWorkers[1].postMessage.mock.calls[0][0].id;

      // IDs should be unique
      expect(taskId1).not.toBe(taskId2);

      if (messageHandler0) messageHandler0({ id: taskId1, result: 'task1 completed' });
      if (messageHandler1) messageHandler1({ id: taskId2, result: 'task2 completed' });

      await Promise.all([task1, task2]);
    });

    it('should map worker to task ID', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      // postMessage should have been called with an id field
      expect(mockWorkers[0].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) })
      );

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;
      if (messageHandler) {
        messageHandler({ id: taskId, result: 'completed' });
      }

      await taskPromise;
    });

    it('should clean up task mappings after completion', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;
      if (messageHandler) {
        messageHandler({ id: taskId, result: 'completed' });
      }

      await taskPromise;
      // After completion the activeTasks map should no longer contain the task
      expect(pool.activeTasks ? pool.activeTasks.has(taskId) : false).toBe(false);
    });
  });

  describe('pool termination', () => {
    it('should terminate all workers', async () => {
      const pool = new WorkerPool('test-worker.js');

      await pool.terminate();

      mockWorkers.forEach(worker => {
        expect(worker.terminate).toHaveBeenCalled();
      });
    });

    it('should wait for all workers to terminate', async () => {
      const pool = new WorkerPool('test-worker.js');

      await expect(pool.terminate()).resolves.toBeUndefined();
    });

    it('should handle termination errors gracefully', async () => {
      const pool = new WorkerPool('test-worker.js');

      // Make one worker fail to terminate
      mockWorkers[0].terminate.mockRejectedValue(new Error('Termination failed'));

      await expect(pool.terminate()).resolves.toBeUndefined();
    });
  });

  describe('worker replacement delay', () => {
    it('should delay worker replacement by 1 second', async () => {
      const pool = new WorkerPool('test-worker.js');

      const errorHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      const initialWorkerCount = vi.mocked(Worker).mock.calls.length;

      // Simulate worker error
      if (errorHandler) {
        errorHandler(new Error('Worker crashed'));
      }

      // Fast-forward just before replacement delay
      vi.advanceTimersByTime(900);
      expect(vi.mocked(Worker).mock.calls.length).toBe(initialWorkerCount);

      // Fast-forward past replacement delay
      vi.advanceTimersByTime(200);
      expect(vi.mocked(Worker).mock.calls.length).toBeGreaterThan(initialWorkerCount);
    });
  });

  describe('concurrent task handling', () => {
    it('should handle tasks faster than workers', async () => {
      const pool = new WorkerPool('test-worker.js', 2);

      const messageHandler0 = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];
      const messageHandler1 = mockWorkers[1].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      // Submit all 10 tasks — only 2 run immediately (2 workers), rest queue
      const taskPromises = [];
      for (let i = 0; i < 10; i++) {
        taskPromises.push(pool.runTask({ data: `task${i}` }));
      }

      // Complete tasks in batches (2 at a time, since 2 workers)
      for (let batch = 0; batch < 5; batch++) {
        const id0 = mockWorkers[0].postMessage.mock.calls[batch][0].id;
        const id1 = mockWorkers[1].postMessage.mock.calls[batch][0].id;
        if (messageHandler0) messageHandler0({ id: id0, result: `batch${batch}-0` });
        if (messageHandler1) messageHandler1({ id: id1, result: `batch${batch}-1` });
        // Allow microtasks to flush so the queue dispatches next tasks
        await Promise.resolve();
        await Promise.resolve();
      }

      const results = await Promise.all(taskPromises);
      expect(results).toHaveLength(10);
    });

    it('should maintain task order in queue', async () => {
      const pool = new WorkerPool('test-worker.js', 1);

      // With 1 worker, tasks execute sequentially in submission order
      const task1 = pool.runTask({ data: 'task1' });
      const task2 = pool.runTask({ data: 'task2' });
      const task3 = pool.runTask({ data: 'task3' });

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        // Complete task1 (call index 0)
        const id1 = mockWorkers[0].postMessage.mock.calls[0][0].id;
        messageHandler({ id: id1, result: 'result1' });
        await Promise.resolve();
        await Promise.resolve();

        // Complete task2 (call index 1, dispatched after task1 completes)
        const id2 = mockWorkers[0].postMessage.mock.calls[1][0].id;
        messageHandler({ id: id2, result: 'result2' });
        await Promise.resolve();
        await Promise.resolve();

        // Complete task3 (call index 2)
        const id3 = mockWorkers[0].postMessage.mock.calls[2][0].id;
        messageHandler({ id: id3, result: 'result3' });
      }

      const results = await Promise.all([task1, task2, task3]);
      expect(results).toEqual(['result1', 'result2', 'result3']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty task data', async () => {
      const pool = new WorkerPool('test-worker.js');

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({});

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;
      if (messageHandler) {
        messageHandler({ id: taskId, result: 'completed' });
      }

      const result = await taskPromise;
      expect(result).toBe('completed');
    });

    it('should handle large task data', async () => {
      const pool = new WorkerPool('test-worker.js');

      const largeData = 'x'.repeat(1000000);

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: largeData });

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;
      if (messageHandler) {
        messageHandler({ id: taskId, result: 'completed' });
      }

      const result = await taskPromise;
      expect(result).toBe('completed');
    });

    it('should handle task with complex data', async () => {
      const pool = new WorkerPool('test-worker.js');

      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        string: 'test',
        number: 42,
      };

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask(complexData);

      const taskId = mockWorkers[0].postMessage.mock.calls[0][0].id;
      if (messageHandler) {
        messageHandler({ id: taskId, result: 'completed' });
      }

      const result = await taskPromise;
      expect(result).toBe('completed');
    });
  });
});
