import express from 'express';
import bodyParser from 'body-parser';
import { InMemoryCache } from './cache/inMemoryCache';
import { FileBasedCache } from './cache/fileBasedCache';
import { Cache } from './cache/cacheInterface';
import { JobQueue } from './jobQueue';
import { v4 as uuidv4 } from 'uuid';
import { metrics } from './metrics';
import { jsonStore } from './store/jsonStore';
import pino from 'pino';

const logger = pino();

const app = express();
app.use(bodyParser.json());


let currentCache: Cache = new InMemoryCache();
let queue = new JobQueue({ cache: currentCache, concurrency: 2 });
queue.start();


app.post('/articles', async (req, res) => {
    const { articles } = req.body;
    if (!Array.isArray(articles) || articles.length === 0) {
        return res.status(400).json({ error: 'articles must be a non-empty array' });
    }


    const jobIds: string[] = [];
    for (const a of articles) {
        const jobId = uuidv4();
        const job = {
            jobId,
            article: { id: a.id || `a-${Date.now()}`, title: a.title || '', content: a.content || '' },
            status: 'queued' as const,
            attempts: 0,
            createdAt: new Date().toISOString()
        };
        await currentCache.set(`job:${jobId}`, { jobId, status: 'queued' }, 1000 * 60 * 5);
        queue.enqueue(job);
        jobIds.push(jobId);
    }


    return res.status(202).json({ jobIds });
});


app.get('/articles/:jobId', async (req, res) => {
    const jobId = req.params.jobId;

    let result = await currentCache.get(`job:${jobId}`);

    if (!result) {
        result = await jsonStore.getJobResult(jobId);
    }

    if (!result) {
        return res.status(404).json({ error: 'job not found' });
    }

    return res.json(result);
});

app.get('/metrics', (req, res) => {
    const metricsData = metrics.getMetrics();
    const queueLength = queue.getQueueLength();

    return res.json({
        ...metricsData,
        queueLength,
    });
});


async function migrateCache(oldCache: Cache, newCache: Cache): Promise<number> {
    let migratedCount = 0;

    if (oldCache instanceof InMemoryCache) {
        const entries = oldCache.getAllEntries();
        for (const entry of entries) {
            try {
                await newCache.set(entry.key, entry.value, entry.ttlMs);
                migratedCount++;
            } catch (err) {
                console.error(`Failed to migrate entry ${entry.key}: ${String(err)}`);
            }
        }
    } else if (oldCache instanceof FileBasedCache) {
        const entries = oldCache.getAllEntries();
        for (const entry of entries) {
            try {
                await newCache.set(entry.key, entry.value, entry.ttlMs);
                migratedCount++;
            } catch (err) {
                console.error(`Failed to migrate entry ${entry.key}: ${String(err)}`);
            }
        }
    }

    return migratedCount;
}

app.post('/admin/cache/switch', async (req, res) => {
    const { strategy, mode = 'invalidate' } = req.body;

    if (strategy !== 'inmemory' && strategy !== 'file') {
        return res.status(400).json({ error: 'strategy must be "inmemory" or "file"' });
    }

    if (mode !== 'invalidate' && mode !== 'migrate') {
        return res.status(400).json({ error: 'mode must be "invalidate" or "migrate"' });
    }

    try {
        const oldCache = currentCache;

        const newCache: Cache = strategy === 'inmemory'
            ? new InMemoryCache()
            : new FileBasedCache();

        let migratedCount = 0;

        if (mode === 'migrate') {
            migratedCount = await migrateCache(oldCache, newCache);
        } else {
            await oldCache.clear();
        }

        currentCache = newCache;

        queue = new JobQueue({ cache: currentCache, concurrency: 2 });
        queue.start();

        return res.json({
            success: true,
            strategy,
            mode,
            migratedCount: mode === 'migrate' ? migratedCount : undefined,
            message: mode === 'migrate'
                ? `Cache switched to ${strategy} with ${migratedCount} entries migrated`
                : `Cache switched to ${strategy} (old cache invalidated)`
        });
    } catch (err) {
        return res.status(500).json({ error: `Failed to switch cache: ${String(err)}` });
    }
});


const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const server = app.listen(port, () => logger.info({ port }, 'ParseLab listening'));

async function shutdown() {
    logger.info('shutting down server');

    server.close(() => {
        logger.info('HTTP server closed');
    });

    await queue.shutdown();

    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
