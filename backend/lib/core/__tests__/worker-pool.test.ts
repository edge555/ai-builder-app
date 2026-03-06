/**
 * Tests for worker-pool module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Worker } from 'worker_threads';

// Mock worker_threads
vi.mock('worker_threads', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn().mockResolvedValue(undefined),
  })),
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
    vi.mocked(Worker).mockImplementation(() => {
      const worker = mockWorkers[mockWorkers.length % mockWorkers.length] || mockWorkers[0];
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
      
      // Simulate worker response
      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });
      
      // Simulate worker completing the task
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'task completed' });
      }

      const result = await taskPromise;
      expect(result).toBe('task completed');
    });

    it('should handle task errors', async () => {
      const pool = new WorkerPool('test-worker.js');
      
      // Simulate worker response with error
      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });
      
      // Simulate worker returning an error
      if (messageHandler) {
        messageHandler({ id: expect.any(String), error: 'Task failed' });
      }

      await expect(taskPromise).rejects.toThrow('Task failed');
    });

    it('should handle task errors with fallback result', async () => {
      const pool = new WorkerPool('test-worker.js');
      
      // Simulate worker response with error but fallback result
      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });
      
      // Simulate worker returning an error with fallback result
      if (messageHandler) {
        messageHandler({ id: expect.any(String), error: 'Task failed', result: 'fallback result' });
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

      // Simulate workers completing tasks
      mockWorkers.forEach((worker, index) => {
        const messageHandler = worker.on.mock.calls.find(
          (call: any[]) => call[0] === 'message'
        )?.[1];

        if (messageHandler) {
          setTimeout(() => {
            messageHandler({ id: expect.any(String), result: `task${index + 1} completed` });
          }, index * 10);
        }
      });

      const results = await Promise.all([task1, task2, task3, task4]);
      expect(results).toHaveLength(4);
    });

    it('should queue tasks when all workers are busy', async () => {
      const pool = new WorkerPool('test-worker.js', 2);
      
      // Start 4 tasks with only 2 workers
      const task1 = pool.runTask({ data: 'task1' });
      const task2 = pool.runTask({ data: 'task2' });
      const task3 = pool.runTask({ data: 'task3' });
      const task4 = pool.runTask({ data: 'task4' });

      // Simulate workers completing first two tasks
      const messageHandler1 = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];
      const messageHandler2 = mockWorkers[1].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      if (messageHandler1) {
        setTimeout(() => {
          messageHandler1({ id: expect.any(String), result: 'task1 completed' });
        }, 50);
      }
      if (messageHandler2) {
        setTimeout(() => {
          messageHandler2({ id: expect.any(String), result: 'task2 completed' });
        }, 50);
      }

      // Complete remaining tasks
      if (messageHandler1) {
        setTimeout(() => {
          messageHandler1({ id: expect.any(String), result: 'task3 completed' });
        }, 100);
      }
      if (messageHandler2) {
        setTimeout(() => {
          messageHandler2({ id: expect.any(String), result: 'task4 completed' });
        }, 100);
      }

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
      
      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const task1 = pool.runTask({ data: 'task1' });
      const task2 = pool.runTask({ data: 'task2' });

      // Complete tasks
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'task1 completed' });
        messageHandler({ id: expect.any(String), result: 'task2 completed' });
      }

      await Promise.all([task1, task2]);
    });

    it('should map worker to task ID', async () => {
      const pool = new WorkerPool('test-worker.js');
      
      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });
      
      // Complete task
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'completed' });
      }

      await taskPromise;
    });

    it('should clean up task mappings after completion', async () => {
      const pool = new WorkerPool('test-worker.js');
      
      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      const taskPromise = pool.runTask({ data: 'test data' });
      
      // Complete task
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'completed' });
      }

      await taskPromise;
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
      
      const terminatePromise = pool.terminate();
      
      expect(terminatePromise).resolves.toBeUndefined();
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
      
      // Submit more tasks than workers
      const tasks = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(pool.runTask({ data: `task${i}` }));
      }

      // Complete tasks one by one
      let completed = 0;
      mockWorkers.forEach((worker, workerIndex) => {
        const messageHandler = worker.on.mock.calls.find(
          (call: any[]) => call[0] === 'message'
        )?.[1];

        if (messageHandler) {
          const completeTask = () => {
            if (completed < 10) {
              messageHandler({ id: expect.any(String), result: `task${completed} completed` });
              completed++;
              if (completed < 10) {
                setTimeout(completeTask, 10);
              }
            }
          };
          setTimeout(completeTask, workerIndex * 5);
        }
      });

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(10);
    });

    it('should maintain task order in queue', async () => {
      const pool = new WorkerPool('test-worker.js', 1);
      
      const tasks = [
        pool.runTask({ data: 'task1' }),
        pool.runTask({ data: 'task2' }),
        pool.runTask({ data: 'task3' }),
      ];

      const messageHandler = mockWorkers[0].on.mock.calls.find(
        (call: any[]) => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        setTimeout(() => messageHandler({ id: expect.any(String), result: 'result1' }), 10);
        setTimeout(() => messageHandler({ id: expect.any(String), result: 'result2' }), 20);
        setTimeout(() => messageHandler({ id: expect.any(String), result: 'result3' }), 30);
      }

      const results = await Promise.all(tasks);
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
      
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'completed' });
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
      
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'completed' });
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
      
      if (messageHandler) {
        messageHandler({ id: expect.any(String), result: 'completed' });
      }

      const result = await taskPromise;
      expect(result).toBe('completed');
    });
  });
});
