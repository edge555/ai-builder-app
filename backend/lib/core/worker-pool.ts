import { Worker } from 'worker_threads';
import { createLogger } from '../logger';

const logger = createLogger('worker-pool');

interface WorkerTask {
    id: string;
    data: any;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeout?: NodeJS.Timeout;
}

export class WorkerPool {
    private workers: Worker[] = [];
    private taskQueue: WorkerTask[] = [];
    private activeTasks: Map<string, WorkerTask> = new Map();
    private workerStatus: boolean[] = []; // true = busy, false = free
    private workerScript: string;
    private poolSize: number;
    private taskTimeoutMs: number;

    constructor(workerScript: string, poolSize: number = 4, taskTimeoutMs: number = 30000) {
        this.workerScript = workerScript;
        this.poolSize = poolSize;
        this.taskTimeoutMs = taskTimeoutMs;
        this.initialize();
    }

    private initialize() {
        for (let i = 0; i < this.poolSize; i++) {
            this.createWorker(i);
        }
    }

    private createWorker(index: number) {
        const worker = new Worker(this.workerScript);

        worker.on('message', (message) => {
            this.completeTask(index, message);
        });

        worker.on('error', (err) => {
            logger.error(`Worker ${index} error`, { error: err.message });
            // Clean up current task on this worker if any
            // Since we don't map worker -> task ID easily here without extra state,
            // we rely on the task timeout or a more complex mapping.
            // For now, simpler to just restart worker.
            worker.terminate().catch(() => { });
            this.replaceWorker(index);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logger.error(`Worker ${index} stopped with exit code ${code}`);
                this.replaceWorker(index);
            }
        });

        this.workers[index] = worker;
        this.workerStatus[index] = false; // Worker is ready
    }

    private replaceWorker(index: number) {
        // Small delay to prevent tight loops if worker fails immediately on start
        setTimeout(() => {
            this.createWorker(index);
            // After recreating, try to process queue
            this.processQueue();
        }, 1000);
    }

    public runTask(data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(7);

            const timeout = setTimeout(() => {
                if (this.activeTasks.has(id)) {
                    const task = this.activeTasks.get(id);
                    if (task) {
                        this.activeTasks.delete(id);
                        task.reject(new Error(`Task timed out after ${this.taskTimeoutMs}ms`));
                        // We might want to kill the worker that was processing this, 
                        // but for now we just timeout the promise.
                    }
                }
            }, this.taskTimeoutMs);

            const task: WorkerTask = { id, data, resolve, reject, timeout };
            this.taskQueue.push(task);
            this.processQueue();
        });
    }

    private processQueue() {
        if (this.taskQueue.length === 0) return;

        // Find first free worker
        const workerIndex = this.workerStatus.findIndex(isBusy => !isBusy);

        if (workerIndex === -1) return; // No free workers

        const task = this.taskQueue.shift();
        if (!task) return;

        this.workerStatus[workerIndex] = true;
        this.activeTasks.set(task.id, task);

        // Add ID to data so we can map response back
        this.workers[workerIndex].postMessage({ ...task.data, id: task.id });
    }

    private completeTask(workerIndex: number, message: any) {
        const { id, result, error } = message;

        if (this.activeTasks.has(id)) {
            const task = this.activeTasks.get(id)!;

            clearTimeout(task.timeout);

            if (error) {
                if (result !== undefined) {
                    task.resolve(result); // Resolve with fallback (graceful degradation)
                } else {
                    task.reject(new Error(error));
                }
            } else {
                task.resolve(result);
            }

            this.activeTasks.delete(id);
        }

        this.workerStatus[workerIndex] = false;
        this.processQueue();
    }

    public async terminate() {
        await Promise.all(this.workers.map(w => w.terminate()));
    }
}
