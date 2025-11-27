import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';
import pino from 'pino';

const logger = pino();

export type AnalysisResult = {
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    longestWord: string;
    topNWords: Array<{ word: string; count: number }>;
    uniqueWords: string[];
    mostFrequentWord: { word: string; count: number } | null;
};

type WorkerTask = {
    taskId: string;
    content: string;
    resolve: (result: AnalysisResult) => void;
    reject: (error: Error) => void;
};

type WorkerState = {
    worker: Worker;
    busy: boolean;
    taskId: string | null;
};

export class WorkerPool {
    private workers: WorkerState[] = [];
    private taskQueue: WorkerTask[] = [];
    private activeTasks: Map<string, WorkerTask> = new Map();
    private taskIdCounter = 0;
    private isShuttingDown = false;
    private readonly poolSize: number;

    constructor(poolSize?: number) {
        this.poolSize = poolSize || parseInt(process.env.WORKER_POOL_SIZE || '0', 10) || os.cpus().length;
    }

    async start(): Promise<void> {
        if (this.workers.length > 0) {
            logger.warn('Worker pool already started');
            return;
        }

        logger.info({ poolSize: this.poolSize }, 'starting worker pool');

        for (let i = 0; i < this.poolSize; i++) {
            await this.createWorker(i);
        }

        logger.info({ poolSize: this.poolSize }, 'worker pool started');
    }

    private async createWorker(index: number): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                let workerFile: string;
                const fs = require('fs');

                if (__dirname.includes('dist')) {
                    workerFile = path.join(__dirname, 'worker.js');
                } else {
                    const distWorkerPath = path.join(process.cwd(), 'dist', 'worker', 'worker.js');
                    if (fs.existsSync(distWorkerPath)) {
                        workerFile = distWorkerPath;
                    } else {
                        workerFile = path.join(__dirname, 'worker.ts');
                    }
                }

                const execArgv = workerFile.endsWith('.ts')
                    ? ['-r', 'ts-node/register']
                    : [];

                const worker = new Worker(workerFile, {
                    execArgv
                });

                const state: WorkerState = {
                    worker,
                    busy: false,
                    taskId: null
                };

                worker.on('message', (message: { taskId: string; success: boolean; result?: AnalysisResult; error?: string }) => {
                    this.handleWorkerMessage(state, message);
                });

                worker.on('error', (error) => {
                    logger.error({ workerIndex: index, error: String(error) }, 'worker error');
                    this.handleWorkerError(state, error);
                });

                worker.on('exit', (code) => {
                    logger.warn({ workerIndex: index, exitCode: code }, 'worker exited');
                    if (!this.isShuttingDown) {
                        this.restartWorker(index);
                    }
                });

                this.workers.push(state);
                resolve();
            } catch (error) {
                logger.error({ workerIndex: index, error: String(error) }, 'failed to create worker');
                reject(error);
            }
        });
    }

    private handleWorkerMessage(state: WorkerState, message: { taskId: string; success: boolean; result?: AnalysisResult; error?: string }): void {
        state.busy = false;
        state.taskId = null;

        const task = this.activeTasks.get(message.taskId);
        if (!task) {
            logger.warn({ taskId: message.taskId }, 'received message for unknown task');
            return;
        }

        this.activeTasks.delete(message.taskId);

        if (message.success && message.result) {
            task.resolve(message.result);
        } else {
            task.reject(new Error(message.error || 'Unknown worker error'));
        }

        this.processQueue();
    }

    private handleWorkerError(state: WorkerState, error: Error): void {
        if (state.taskId) {
            const task = this.activeTasks.get(state.taskId);
            if (task) {
                this.activeTasks.delete(state.taskId);
                task.reject(error);
            }
        }
        state.busy = false;
        state.taskId = null;

        this.processQueue();
    }

    private async restartWorker(index: number): Promise<void> {
        try {
            const oldState = this.workers[index];
            if (oldState) {
                try {
                    await oldState.worker.terminate();
                } catch (error) {
                    logger.error({ workerIndex: index, error: String(error) }, 'failed to terminate worker');
                }
            }
            await this.createWorker(index);
            this.processQueue();
        } catch (error) {
            logger.error({ workerIndex: index, error: String(error) }, 'failed to restart worker');
        }
    }


    private processQueue(): void {
        if (this.taskQueue.length === 0) return;

        const availableWorker = this.workers.find(w => !w.busy);
        if (!availableWorker) return;

        const task = this.taskQueue.shift();
        if (!task) return;

        availableWorker.busy = true;
        availableWorker.taskId = task.taskId;
        this.activeTasks.set(task.taskId, task);

        try {
            availableWorker.worker.postMessage({
                content: task.content,
                taskId: task.taskId
            });
        } catch (error) {
            availableWorker.busy = false;
            availableWorker.taskId = null;
            this.activeTasks.delete(task.taskId);
            task.reject(error as Error);
            this.processQueue();
        }
    }

    async analyzeText(content: string): Promise<AnalysisResult> {
        if (this.isShuttingDown) {
            throw new Error('Worker pool is shutting down');
        }

        return new Promise((resolve, reject) => {
            const taskId = `task-${++this.taskIdCounter}`;
            const task: WorkerTask = {
                taskId,
                content,
                resolve,
                reject
            };

            this.taskQueue.push(task);
            this.processQueue();
        });
    }

    async shutdown(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        logger.info('shutting down worker pool');
        this.isShuttingDown = true;

        for (const task of this.taskQueue) {
            task.reject(new Error('Worker pool is shutting down'));
        }
        this.taskQueue = [];

        for (const task of this.activeTasks.values()) {
            task.reject(new Error('Worker pool is shutting down'));
        }
        this.activeTasks.clear();

        const terminationPromises = this.workers.map((state, index) => {
            return new Promise<void>((resolve) => {
                state.worker.terminate()
                    .then(() => {
                        logger.debug({ workerIndex: index }, 'worker terminated');
                        resolve();
                    })
                    .catch((error) => {
                        logger.error({ workerIndex: index, error: String(error) }, 'error terminating worker');
                        resolve();
                    });
            });
        });

        await Promise.all(terminationPromises);
        this.workers = [];

        logger.info('worker pool shut down');
    }

    getStats() {
        return {
            poolSize: this.workers.length,
            busyWorkers: this.workers.filter(w => w.busy).length,
            queueLength: this.taskQueue.length,
            isShuttingDown: this.isShuttingDown
        };
    }
}

let workerPoolInstance: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool | null {
    const poolSize = parseInt(process.env.WORKER_POOL_SIZE || '0', 10);
    if (poolSize <= 0) {
        return null;
    }

    if (!workerPoolInstance) {
        workerPoolInstance = new WorkerPool(poolSize);
    }

    return workerPoolInstance;
}

