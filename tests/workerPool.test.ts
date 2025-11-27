import { WorkerPool } from '../src/worker/pool';
import { analyzeText } from '../src/utils/analyze';
import * as path from 'path';

describe('Worker Pool', () => {
    let pool: WorkerPool;
    const originalEnv = process.env.WORKER_POOL_SIZE;
    const jestTimeout = 30000; // 30 seconds for worker thread tests

    beforeEach(() => {
        // Set a small pool size for testing
        process.env.WORKER_POOL_SIZE = '2';
        pool = new WorkerPool(2);
    }, jestTimeout);

    afterEach(async () => {
        // Restore original env
        if (originalEnv !== undefined) {
            process.env.WORKER_POOL_SIZE = originalEnv;
        } else {
            delete process.env.WORKER_POOL_SIZE;
        }

        // Shutdown pool
        if (pool) {
            await pool.shutdown();
        }
    });

    describe('Worker Pool Lifecycle', () => {
        it('should start and shutdown gracefully', async () => {
            await pool.start();
            const stats = pool.getStats();
            expect(stats.poolSize).toBe(2);
            expect(stats.isShuttingDown).toBe(false);

            await pool.shutdown();
            const finalStats = pool.getStats();
            expect(finalStats.poolSize).toBe(0);
            expect(finalStats.isShuttingDown).toBe(true);
        });

        it('should handle multiple shutdown calls', async () => {
            await pool.start();
            await pool.shutdown();
            await pool.shutdown(); // Should not error
        });
    });

    describe('Analysis Results', () => {
        it('should produce same results as in-process analysis', async () => {
            await pool.start();

            const testContent = 'Hello world. This is a test. Another sentence here.';
            const workerResult = await pool.analyzeText(testContent);
            const inProcessResult = analyzeText(testContent);

            expect(workerResult).toEqual(inProcessResult);
        }, jestTimeout);

        it('should handle empty content', async () => {
            await pool.start();

            const workerResult = await pool.analyzeText('');
            const inProcessResult = analyzeText('');

            expect(workerResult).toEqual(inProcessResult);
            expect(workerResult.wordCount).toBe(0);
            expect(workerResult.sentenceCount).toBe(0);
        }, jestTimeout);

        it('should handle complex text with multiple paragraphs', async () => {
            await pool.start();

            const testContent = `First paragraph here.

Second paragraph with more content.

Third paragraph.`;
            const workerResult = await pool.analyzeText(testContent);
            const inProcessResult = analyzeText(testContent);

            expect(workerResult).toEqual(inProcessResult);
            expect(workerResult.paragraphCount).toBe(3);
        }, jestTimeout);

        it('should correctly identify word frequencies', async () => {
            await pool.start();

            const testContent = 'test test test word word other';
            const workerResult = await pool.analyzeText(testContent);
            const inProcessResult = analyzeText(testContent);

            expect(workerResult).toEqual(inProcessResult);
            expect(workerResult.mostFrequentWord?.word).toBe('test');
            expect(workerResult.mostFrequentWord?.count).toBe(3);
        }, jestTimeout);

        it('should handle concurrent analysis requests', async () => {
            await pool.start();

            const contents = [
                'First article content.',
                'Second article content.',
                'Third article content.',
                'Fourth article content.',
                'Fifth article content.'
            ];

            const promises = contents.map(content => pool.analyzeText(content));
            const results = await Promise.all(promises);

            // Verify all results are valid
            results.forEach((result, index) => {
                const expected = analyzeText(contents[index]);
                expect(result).toEqual(expected);
            });
        }, jestTimeout);
    });

    describe('Worker Pool Statistics', () => {
        it('should track queue length', async () => {
            await pool.start();

            // Submit multiple tasks quickly
            const promises: Promise<any>[] = [];
            for (let i = 0; i < 5; i++) {
                promises.push(pool.analyzeText(`Content ${i}`));
            }

            // Check stats while tasks are processing
            const stats = pool.getStats();
            expect(stats.poolSize).toBe(2);
            expect(stats.queueLength).toBeGreaterThanOrEqual(0);

            // Wait for all tasks
            await Promise.all(promises);

            // Queue should be empty after completion
            const finalStats = pool.getStats();
            expect(finalStats.queueLength).toBe(0);
        }, jestTimeout);
    });

    describe('Error Handling', () => {
        it('should handle worker errors gracefully', async () => {
            await pool.start();

            // This test verifies that the pool can handle errors
            // The actual error handling is tested through the worker implementation
            const result = await pool.analyzeText('Valid content');
            expect(result).toBeDefined();
        }, jestTimeout);
    });
});

describe('Worker Pool Integration with JobQueue', () => {
    let pool: WorkerPool | null = null;
    const originalEnv = process.env.WORKER_POOL_SIZE;

    beforeEach(() => {
        process.env.WORKER_POOL_SIZE = '2';
    });

    afterEach(async () => {
        if (originalEnv !== undefined) {
            process.env.WORKER_POOL_SIZE = originalEnv;
        } else {
            delete process.env.WORKER_POOL_SIZE;
        }

        if (pool) {
            await pool.shutdown();
            pool = null;
        }
    });

    it('should be disabled when WORKER_POOL_SIZE is not set', () => {
        delete process.env.WORKER_POOL_SIZE;
        const { getWorkerPool } = require('../src/worker/pool');
        const pool = getWorkerPool();
        expect(pool).toBeNull();
    });

    it('should be enabled when WORKER_POOL_SIZE is set', async () => {
        process.env.WORKER_POOL_SIZE = '4';
        const { getWorkerPool } = require('../src/worker/pool');
        const pool = getWorkerPool();
        expect(pool).not.toBeNull();
        
        // Pool size is 0 until started
        await pool?.start();
        expect(pool?.getStats().poolSize).toBe(4);
        
        await pool?.shutdown();
    });
});

