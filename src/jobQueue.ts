import { Cache } from './cache/cacheInterface';
import { analyzeText } from './utils/analyze';
import { metrics } from './metrics';
import { jsonStore } from './store/jsonStore';
import { getWorkerPool } from './worker/pool';
import pino from 'pino';

const logger = pino();

type Job = {
    jobId: string;
    article: { id: string; title: string; content: string };
    status: 'queued' | 'processing' | 'completed' | 'failed';
    attempts: number;
    createdAt: string;
};


export class JobQueue {
    private queue: Job[] = [];
    private active = 0;
    private running = false;
    private workerPool = getWorkerPool();
    private idleTimer: NodeJS.Timeout | null = null;
    // Track pending retry timers to ensure shutdown waits for scheduled retries
    // This prevents Jest "open handles" warnings and ensures metrics are accurate
    private pendingRetries = 0;


    constructor(private opts: { cache: Cache; concurrency: number }) {
        if (this.workerPool) {
            this.workerPool.start().catch(err => {
                logger.error({ error: String(err) }, 'failed to start worker pool');
            });
        }
    }


    enqueue(job: Job) {
        this.queue.push(job);
        metrics.setActiveWorkers(this.active);
        logger.info({ jobId: job.jobId, articleId: job.article.id }, 'jobEnqueued');

        // Clear idle timer since we have work to do
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }

        // If queue is running and we have available workers, kick processing
        if (this.running && this.active < this.opts.concurrency) {
            setImmediate(() => this.processNext());
        }
    }

    getQueueLength(): number {
        return this.queue.length;
    }

    start() {
        if (this.running) return;
        this.running = true;
        for (let i = 0; i < this.opts.concurrency; i++) this.processNext();
    }

    /**
     * Stop the job queue (immediate, doesn't wait for active jobs)
     */
    stop(): void {
        if (!this.running) return;

        this.running = false;

        // Clear idle timer to prevent it from keeping the process alive
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    /**
     * Gracefully shutdown the job queue and worker pool
     * @param timeoutMs Maximum time to wait for active jobs, queue, and pending retries to complete (default: 5000ms)
     */
    async shutdown(timeoutMs: number = 5000): Promise<void> {
        if (!this.running) return;

        logger.info('shutting down job queue');

        // Clear idle timer to prevent it from keeping the process alive
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }

        // Don't call stop() immediately - let existing jobs finish processing
        // We'll set running = false after queue is empty
        const startTime = Date.now();

        // Wait for active jobs, queued jobs, and pending retries to complete
        // This ensures all scheduled work finishes before shutdown completes
        while ((this.active > 0 || this.queue.length > 0 || this.pendingRetries > 0) &&
            (Date.now() - startTime) < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 25));
        }

        // Now stop accepting new work
        this.running = false;

        if (this.active > 0 || this.queue.length > 0 || this.pendingRetries > 0) {
            logger.warn({
                activeJobs: this.active,
                queueLength: this.queue.length,
                pendingRetries: this.pendingRetries
            }, 'some work still pending after shutdown timeout');
        }

        // Shutdown worker pool if enabled
        if (this.workerPool) {
            await this.workerPool.shutdown();
        }

        logger.info('job queue shut down');
    }


    private async processNext() {
        if (!this.running) return;
        const job = this.queue.shift();
        if (!job) {
            // Schedule idle check with unref to prevent keeping process alive
            const timer = setTimeout(() => this.processNext(), 200);
            if (typeof (timer as any).unref === 'function') {
                (timer as any).unref();
            }
            this.idleTimer = timer;
            metrics.setActiveWorkers(this.active);
            return;
        }

        // Clear idle timer since we have work to process
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }


        this.active++;
        metrics.setActiveWorkers(this.active);
        const startTime = Date.now();

        logger.info({ jobId: job.jobId, articleId: job.article.id }, 'jobStarted');

        try {
            await this.opts.cache.set(`job:${job.jobId}`, { jobId: job.jobId, status: 'processing' }, 1000 * 60 * 5);

            let result;
            if (this.workerPool) {
                result = await this.workerPool.analyzeText(job.article.content);
            } else {
                result = analyzeText(job.article.content);
            }

            const jobResult = { jobId: job.jobId, status: 'completed' as const, analysis: result };
            await this.opts.cache.set(`job:${job.jobId}`, jobResult, 1000 * 60 * 60);

            try {
                await jsonStore.saveJobResult(job.jobId, jobResult);
            } catch (storeErr) {
                logger.error({
                    jobId: job.jobId,
                    articleId: job.article.id,
                    error: String(storeErr)
                }, 'failed to save job result to store');
            }

            const processingTime = Date.now() - startTime;
            metrics.recordProcessingTime(processingTime);
            metrics.incrementProcessed();
            metrics.setActiveWorkers(this.active);

            logger.info({
                jobId: job.jobId,
                articleId: job.article.id,
                processingTimeMs: processingTime
            }, 'jobCompleted');
        } catch (err) {
            job.attempts = (job.attempts || 0) + 1;
            if (job.attempts <= 3) {
                // Increment metrics immediately when retry is scheduled (not when it executes)
                // This ensures tests can observe retry scheduling even if shutdown happens before retry executes
                metrics.incrementRetried();

                const backoff = 500 * Math.pow(2, job.attempts - 1);
                this.pendingRetries++;

                logger.info({
                    jobId: job.jobId,
                    articleId: job.article.id,
                    attempt: job.attempts,
                    backoffMs: backoff,
                    error: String(err)
                }, 'jobRetried');

                // Schedule retry with unref to prevent keeping Node/Jest event loop alive
                const retryTimer = setTimeout(() => {
                    try {
                        this.enqueue(job);
                        // If queue is running, try to kick processing immediately
                        if (this.running) {
                            setImmediate(() => this.processNext());
                        }
                    } finally {
                        // Ensure pendingRetries is decremented even if enqueue throws
                        this.pendingRetries--;
                    }
                }, backoff);

                // Do not let this timer keep Node/Jest alive
                if (typeof (retryTimer as any).unref === 'function') {
                    (retryTimer as any).unref();
                }
            } else {
                // Job has exhausted all retries - mark as failed
                metrics.incrementFailed();
                metrics.setActiveWorkers(this.active);
                logger.error({
                    jobId: job.jobId,
                    articleId: job.article.id,
                    attempts: job.attempts,
                    error: String(err)
                }, 'jobFailed');

                try {
                    await this.opts.cache.set(`job:${job.jobId}`, { jobId: job.jobId, status: 'failed', error: String(err) }, 1000 * 60 * 5);
                } catch (cacheErr) {
                    logger.error({
                        jobId: job.jobId,
                        articleId: job.article.id,
                        error: String(cacheErr)
                    }, 'failed to update cache with failed status');
                }
            }
        } finally {
            this.active--;
            metrics.setActiveWorkers(this.active);
            setImmediate(() => this.processNext());
        }
    }
}