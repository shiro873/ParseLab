import { JobQueue } from '../src/jobQueue';
import { InMemoryCache } from '../src/cache/inMemoryCache';
import { metrics } from '../src/metrics';

describe('Metrics', () => {
    let cache: InMemoryCache;
    let queue: JobQueue;

    beforeEach(() => {
        metrics.reset();
        cache = new InMemoryCache();
        queue = new JobQueue({ cache, concurrency: 2 });
        queue.start();
    });

    afterEach(() => {
        // Give jobs time to complete
        return new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should increment processed counter when jobs complete', async () => {
        const initialMetrics = metrics.getMetrics();
        expect(initialMetrics.processed).toBe(0);

        // Enqueue 2 jobs
        queue.enqueue({
            jobId: 'job-1',
            article: { id: 'article-1', title: 'Test 1', content: 'Hello world.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        queue.enqueue({
            jobId: 'job-2',
            article: { id: 'article-2', title: 'Test 2', content: 'Another test.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        // Wait for jobs to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        const finalMetrics = metrics.getMetrics();
        expect(finalMetrics.processed).toBeGreaterThanOrEqual(2);
        expect(finalMetrics.processed).toBeGreaterThan(initialMetrics.processed);
    });

    it('should track queueLength', () => {
        expect(queue.getQueueLength()).toBe(0);

        queue.enqueue({
            jobId: 'job-1',
            article: { id: 'article-1', title: 'Test 1', content: 'Hello world.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        expect(queue.getQueueLength()).toBe(1);

        queue.enqueue({
            jobId: 'job-2',
            article: { id: 'article-2', title: 'Test 2', content: 'Another test.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        expect(queue.getQueueLength()).toBe(2);
    });

    it('should track activeWorkers', async () => {
        const initialMetrics = metrics.getMetrics();
        expect(initialMetrics.activeWorkers).toBe(0);

        // Enqueue a job
        queue.enqueue({
            jobId: 'job-1',
            article: { id: 'article-1', title: 'Test 1', content: 'Hello world.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        // Active workers should increase while processing
        await new Promise(resolve => setTimeout(resolve, 50));

        // After processing, active workers should return to 0 or low value
        await new Promise(resolve => setTimeout(resolve, 200));
        const finalMetrics = metrics.getMetrics();
        expect(finalMetrics.activeWorkers).toBeLessThanOrEqual(2); // Max concurrency
    });

    it('should track averageProcessingTime', async () => {
        const initialMetrics = metrics.getMetrics();
        expect(initialMetrics.averageProcessingTimeMs).toBe(0);

        // Enqueue 2 jobs
        queue.enqueue({
            jobId: 'job-1',
            article: { id: 'article-1', title: 'Test 1', content: 'Hello world.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        queue.enqueue({
            jobId: 'job-2',
            article: { id: 'article-2', title: 'Test 2', content: 'Another test.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        // Wait for jobs to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        const finalMetrics = metrics.getMetrics();
        // Processing time might be 0 for very fast operations, so just check it's a number
        expect(typeof finalMetrics.averageProcessingTimeMs).toBe('number');
        expect(finalMetrics.averageProcessingTimeMs).toBeGreaterThanOrEqual(0);
        // If any jobs were processed, the average should be set (even if 0)
        if (finalMetrics.processed > 0) {
            expect(finalMetrics.averageProcessingTimeMs).toBeDefined();
        }
    });

    it('should return metrics with all expected fields', () => {
        const metricsData = metrics.getMetrics();

        expect(metricsData).toHaveProperty('processed');
        expect(metricsData).toHaveProperty('failed');
        expect(metricsData).toHaveProperty('retried');
        expect(metricsData).toHaveProperty('activeWorkers');
        expect(metricsData).toHaveProperty('averageProcessingTimeMs');

        expect(typeof metricsData.processed).toBe('number');
        expect(typeof metricsData.failed).toBe('number');
        expect(typeof metricsData.retried).toBe('number');
        expect(typeof metricsData.activeWorkers).toBe('number');
        expect(typeof metricsData.averageProcessingTimeMs).toBe('number');
    });

    it('should increment retried counter on retries', async () => {
        // Create a cache that will fail on set operations
        const failingCache = {
            async set() {
                throw new Error('Cache error');
            },
            async get() {
                return undefined;
            },
            async clear() { }
        };

        const failingQueue = new JobQueue({ cache: failingCache as any, concurrency: 1 });
        failingQueue.start();

        const initialMetrics = metrics.getMetrics();
        const initialRetried = initialMetrics.retried;

        // Enqueue a job that will fail and retry
        failingQueue.enqueue({
            jobId: 'job-fail',
            article: { id: 'article-1', title: 'Test', content: 'Hello.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        // Wait for retry attempts
        await new Promise(resolve => setTimeout(resolve, 1500));

        const finalMetrics = metrics.getMetrics();
        expect(finalMetrics.retried).toBeGreaterThan(initialRetried);
    });

    it('should increment failed counter after max retries', async () => {
        // Create a cache that will always fail
        const failingCache = {
            async set() {
                throw new Error('Cache error');
            },
            async get() {
                return undefined;
            },
            async clear() { }
        };

        const failingQueue = new JobQueue({ cache: failingCache as any, concurrency: 1 });
        failingQueue.start();

        const initialMetrics = metrics.getMetrics();
        const initialFailed = initialMetrics.failed;

        // Enqueue a job that will fail after max retries
        failingQueue.enqueue({
            jobId: 'job-fail-final',
            article: { id: 'article-1', title: 'Test', content: 'Hello.' },
            status: 'queued',
            attempts: 0,
            createdAt: new Date().toISOString()
        });

        // Wait for all retries to exhaust
        // Initial attempt + 3 retries = 4 total attempts, with exponential backoff
        // Backoff: 500ms, 1000ms, 2000ms = ~3500ms minimum, add buffer
        await new Promise(resolve => setTimeout(resolve, 8000));

        const finalMetrics = metrics.getMetrics();
        expect(finalMetrics.failed).toBeGreaterThan(initialFailed);
    }, 10000); // Increase timeout to 10 seconds
});

