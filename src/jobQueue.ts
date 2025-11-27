import { Cache } from './cache/cacheInterface';
import { analyzeText } from './utils/analyze';
import { metrics } from './metrics';
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


    constructor(private opts: { cache: Cache; concurrency: number }) { }


    enqueue(job: Job) {
        this.queue.push(job);
        metrics.setActiveWorkers(this.active);
        logger.info({ jobId: job.jobId, articleId: job.article.id }, 'jobEnqueued');
    }

    getQueueLength(): number {
        return this.queue.length;
    }

    start() {
        if (this.running) return;
        this.running = true;
        for (let i = 0; i < this.opts.concurrency; i++) this.processNext();
    }


    private async processNext() {
        if (!this.running) return;
        const job = this.queue.shift();
        if (!job) {
            setTimeout(() => this.processNext(), 200);
            metrics.setActiveWorkers(this.active);
            return;
        }


        this.active++;
        metrics.setActiveWorkers(this.active);
        const startTime = Date.now();

        logger.info({ jobId: job.jobId, articleId: job.article.id }, 'jobStarted');

        try {
            await this.opts.cache.set(`job:${job.jobId}`, { jobId: job.jobId, status: 'processing' }, 1000 * 60 * 5);
            const result = analyzeText(job.article.content);
            await this.opts.cache.set(`job:${job.jobId}`, { jobId: job.jobId, status: 'completed', analysis: result }, 1000 * 60 * 60);

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
                const backoff = 500 * Math.pow(2, job.attempts - 1);
                metrics.incrementRetried();
                logger.info({
                    jobId: job.jobId,
                    articleId: job.article.id,
                    attempt: job.attempts,
                    backoffMs: backoff,
                    error: String(err)
                }, 'jobRetried');
                setTimeout(() => this.enqueue(job), backoff);
            } else {
                await this.opts.cache.set(`job:${job.jobId}`, { jobId: job.jobId, status: 'failed', error: String(err) }, 1000 * 60 * 5);
                metrics.incrementFailed();
                metrics.setActiveWorkers(this.active);
                logger.error({
                    jobId: job.jobId,
                    articleId: job.article.id,
                    attempts: job.attempts,
                    error: String(err)
                }, 'jobFailed');
            }
        } finally {
            this.active--;
            metrics.setActiveWorkers(this.active);
            setImmediate(() => this.processNext());
        }
    }
}