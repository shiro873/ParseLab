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
        // Sanitize key to be filesystem-safe
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.cacheDir, `${safeKey}.json`);
    }

    async set(key: string, value: any, ttlMs: number = 1000 * 60 * 5): Promise<void> {
        const expiresAt = Date.now() + ttlMs;
        const entry: FileCacheEntry = { key, value, expiresAt };
        
        const filePath = this.getFilePath(key);
        const tmpPath = `${filePath}.tmp`;
        
        // Write to temporary file first
        fs.writeFileSync(tmpPath, JSON.stringify(entry), 'utf8');
        
        // Atomic rename
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
            // If file is corrupted or doesn't exist, return undefined
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch {
                    // Ignore cleanup errors
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
                } catch {
                    // Ignore errors during cleanup
                }
            }
        }
    }

    // Helper method for migration: get all entries with remaining TTL
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
                    // Use the original key if stored, otherwise try to reconstruct from filename
                    const key = entry.key || this.reconstructKeyFromFilename(file);
                    entries.push({
                        key,
                        value: entry.value,
                        ttlMs: remainingTtl
                    });
                }
            } catch {
                // Skip corrupted files
            }
        }

        return entries;
    }

    // Best-effort key reconstruction from filename (for backward compatibility)
    private reconstructKeyFromFilename(filename: string): string {
        // Remove .json extension and try to reverse sanitization
        return filename.replace(/\.json$/, '').replace(/_/g, ':');
    }
}

