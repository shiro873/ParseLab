import * as fs from 'fs';
import * as path from 'path';
import { Cache, CacheEntry } from './cacheInterface';

interface FileCacheEntry {
    key: string; // Store original key for migration
    value: any;
    expiresAt: number;
}

export class FileBasedCache implements Cache {
    private cacheDir: string;

    constructor(cacheDir: string = 'var/cache') {
        this.cacheDir = cacheDir;
        this.ensureCacheDir();
    }

    private ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    private getFilePath(key: string): string {
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.cacheDir, `${safeKey}.json`);
    }

    async set(key: string, value: any, ttlMs: number = 1000 * 60 * 5): Promise<void> {
        const expiresAt = Date.now() + ttlMs;
        const entry: FileCacheEntry = { key, value, expiresAt };

        const filePath = this.getFilePath(key);
        const tmpPath = `${filePath}.tmp`;

        fs.writeFileSync(tmpPath, JSON.stringify(entry), 'utf8');

        fs.renameSync(tmpPath, filePath);
    }

    async get<T = any>(key: string): Promise<T | undefined> {
        const filePath = this.getFilePath(key);

        if (!fs.existsSync(filePath)) {
            return undefined;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const entry: FileCacheEntry = JSON.parse(content);

            // Check if expired
            if (Date.now() > entry.expiresAt) {
                // Delete expired file
                fs.unlinkSync(filePath);
                return undefined;
            }

            return entry.value as T;
        } catch (err) {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.error({ filePath, error: String(err) }, 'failed to cleanup corrupted file');
                }
            }
            return undefined;
        }
    }

    async clear(): Promise<void> {
        if (!fs.existsSync(this.cacheDir)) {
            return;
        }

        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
            if (file.endsWith('.json') || file.endsWith('.tmp')) {
                try {
                    fs.unlinkSync(path.join(this.cacheDir, file));
                } catch (err) {
                    console.error({ file, error: String(err) }, 'failed to cleanup corrupted file');
                }
            }
        }
    }

    getAllEntries(): CacheEntry[] {
        if (!fs.existsSync(this.cacheDir)) {
            return [];
        }

        const entries: CacheEntry[] = [];
        const now = Date.now();
        const files = fs.readdirSync(this.cacheDir);

        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }

            const filePath = path.join(this.cacheDir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const entry: FileCacheEntry = JSON.parse(content);

                if (entry.expiresAt > now) {
                    const remainingTtl = entry.expiresAt - now;
                    const key = entry.key || this.reconstructKeyFromFilename(file);
                    entries.push({
                        key,
                        value: entry.value,
                        ttlMs: remainingTtl
                    });
                }
            } catch (err) {
                console.error({ filePath, error: String(err) }, 'failed to read corrupted file');
            }
        }

        return entries;
    }

    private reconstructKeyFromFilename(filename: string): string {
        return filename.replace(/\.json$/, '').replace(/_/g, ':');
    }
}

