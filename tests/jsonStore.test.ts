import { JsonStore, jsonStore } from '../src/store/jsonStore';
import { JobQueue } from '../src/jobQueue';
import { InMemoryCache } from '../src/cache/inMemoryCache';
import * as fs from 'fs';
import * as path from 'path';

describe('JSON Store Integration', () => {
    let testStoreDir: string;
    let defaultStoreDir: string;
    let store: JsonStore;
    let cache: InMemoryCache;
    let queue: JobQueue;

    beforeEach(() => {
        testStoreDir = path.join(__dirname, '..', 'var', 'test-store');
        defaultStoreDir = path.join(__dirname, '..', 'var', 'store', 'jobs');
        
        // Clean up test store directories
        if (fs.existsSync(testStoreDir)) {
            fs.rmSync(testStoreDir, { recursive: true, force: true });
        }
        if (fs.existsSync(defaultStoreDir)) {
            fs.rmSync(defaultStoreDir, { recursive: true, force: true });
        }
        
        store = new JsonStore(testStoreDir);
        cache = new InMemoryCache();
        queue = new JobQueue({ cache, concurrency: 2 });
        queue.start();
    });

    afterEach(async () => {
        // Shutdown queue to prevent open handles
        if (queue) {
            await queue.shutdown(2000);
        }
        
        // Clean up test store directories
        if (fs.existsSync(testStoreDir)) {
            fs.rmSync(testStoreDir, { recursive: true, force: true });
        }
        if (fs.existsSync(defaultStoreDir)) {
            fs.rmSync(defaultStoreDir, { recursive: true, force: true });
        }
    });

    describe('JsonStore', () => {
        it('should save and read job results', async () => {
            const jobId = 'test-job-1';
            const result = {
                jobId,
                status: 'completed' as const,
                analysis: {
                    wordCount: 10,
                    sentenceCount: 2,
                    paragraphCount: 1,
                    longestWord: 'test',
                    topNWords: [{ word: 'test', count: 1 }],
                    uniqueWords: ['test'],
                    mostFrequentWord: { word: 'test', count: 1 }
                }
            };

            await store.saveJobResult(jobId, result);
            const readResult = await store.getJobResult(jobId);

            expect(readResult).toEqual(result);
        });

        it('should return null for non-existent job', async () => {
            const result = await store.getJobResult('non-existent-job');
            expect(result).toBeNull();
        });

        it('should use atomic write pattern', async () => {
            const jobId = 'atomic-test';
            const result = {
                jobId,
                status: 'completed' as const,
                analysis: { wordCount: 5 }
            };

            await store.saveJobResult(jobId, result);

            // Verify file exists and temp file doesn't
            const filePath = path.join(testStoreDir, `${jobId}.json`);
            const tempPath = path.join(testStoreDir, `${jobId}.json.tmp`);

            expect(fs.existsSync(filePath)).toBe(true);
            expect(fs.existsSync(tempPath)).toBe(false);
        });

        it('should handle errors gracefully when reading invalid JSON', async () => {
            const jobId = 'invalid-json';
            const filePath = path.join(testStoreDir, `${jobId}.json`);

            // Ensure directory exists
            await fs.promises.mkdir(testStoreDir, { recursive: true });

            // Write invalid JSON
            await fs.promises.writeFile(filePath, 'invalid json content', 'utf8');

            const result = await store.getJobResult(jobId);
            expect(result).toBeNull();
        });

        it('should check if job result exists', async () => {
            const jobId = 'exists-test';
            const result = {
                jobId,
                status: 'completed' as const,
                analysis: { wordCount: 1 }
            };

            expect(await store.hasJobResult(jobId)).toBe(false);

            await store.saveJobResult(jobId, result);

            expect(await store.hasJobResult(jobId)).toBe(true);
        });
    });

    describe('JobQueue integration', () => {
        it('should persist job result to file after completion', async () => {
            const job = {
                jobId: 'integration-job-1',
                article: {
                    id: 'article-1',
                    title: 'Test Article',
                    content: 'Hello world. This is a test.'
                },
                status: 'queued' as const,
                attempts: 0,
                createdAt: new Date().toISOString()
            };

            queue.enqueue(job);

            // Wait for job to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check that file was created in default store directory (used by singleton)
            const filePath = path.join(defaultStoreDir, `${job.jobId}.json`);
            expect(fs.existsSync(filePath)).toBe(true);

            // Read and verify content
            const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            expect(fileContent.jobId).toBe(job.jobId);
            expect(fileContent.status).toBe('completed');
            expect(fileContent.analysis).toBeDefined();
            expect(fileContent.analysis.wordCount).toBeGreaterThan(0);
        });

        it('should create job result file in correct directory', async () => {
            const job = {
                jobId: 'directory-test',
                article: {
                    id: 'article-1',
                    title: 'Test',
                    content: 'Test content.'
                },
                status: 'queued' as const,
                attempts: 0,
                createdAt: new Date().toISOString()
            };

            queue.enqueue(job);

            // Wait for job to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify directory structure (default store directory)
            expect(fs.existsSync(defaultStoreDir)).toBe(true);
            const files = fs.readdirSync(defaultStoreDir);
            expect(files).toContain(`${job.jobId}.json`);
        });
    });

    describe('Cache fallback integration', () => {
        it('should return persisted result when cache misses', async () => {
            const jobId = 'fallback-test';
            const result = {
                jobId,
                status: 'completed' as const,
                analysis: {
                    wordCount: 20,
                    sentenceCount: 3,
                    paragraphCount: 1,
                    longestWord: 'fallback',
                    topNWords: [{ word: 'test', count: 2 }],
                    uniqueWords: ['test', 'fallback'],
                    mostFrequentWord: { word: 'test', count: 2 }
                }
            };

            // Save to store directly (simulating cache expiry)
            await store.saveJobResult(jobId, result);

            // Verify cache doesn't have it
            expect(await cache.get(`job:${jobId}`)).toBeUndefined();

            // Verify store has it
            const storedResult = await store.getJobResult(jobId);
            expect(storedResult).toEqual(result);
        });

        it('should handle cache expiry scenario', async () => {
            const job = {
                jobId: 'expiry-test',
                article: {
                    id: 'article-1',
                    title: 'Test',
                    content: 'This will be stored persistently.'
                },
                status: 'queued' as const,
                attempts: 0,
                createdAt: new Date().toISOString()
            };

            queue.enqueue(job);

            // Wait for job to complete
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify it's in cache initially
            const cached = await cache.get(`job:${job.jobId}`);
            expect(cached).toBeDefined();
            expect(cached?.status).toBe('completed');

            // Clear cache (simulating expiry)
            await cache.clear();

            // Verify cache is empty
            expect(await cache.get(`job:${job.jobId}`)).toBeUndefined();

            // Verify store still has it (using singleton which uses default directory)
            const storedResult = await jsonStore.getJobResult(job.jobId);
            expect(storedResult).toBeDefined();
            expect(storedResult?.status).toBe('completed');
            expect(storedResult?.analysis).toBeDefined();
        });
    });
});

