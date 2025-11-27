import { Cache, CacheEntry } from './cacheInterface';

export class InMemoryCache implements Cache {
    private map = new Map<string, { value: any; expiresAt: number }>();


    constructor(private sweepIntervalMs = 1000) {
        setInterval(() => this.cleanup(), this.sweepIntervalMs).unref();
    }


    async set(key: string, value: any, ttlMs = 1000 * 60 * 5) {
        const expiresAt = Date.now() + ttlMs;
        this.map.set(key, { value, expiresAt });
    }


    async get<T = any>(key: string): Promise<T | undefined> {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.map.delete(key);
            return undefined;
        }
        return entry.value as T;
    }

    async clear(): Promise<void> {
        this.map.clear();
    }

    // Helper method for migration: get all entries with remaining TTL
    getAllEntries(): CacheEntry[] {
        const now = Date.now();
        const entries: CacheEntry[] = [];

        for (const [key, entry] of this.map.entries()) {
            if (entry.expiresAt > now) {
                const remainingTtl = entry.expiresAt - now;
                entries.push({
                    key,
                    value: entry.value,
                    ttlMs: remainingTtl
                });
            }
        }

        return entries;
    }


    private cleanup() {
        const now = Date.now();
        for (const [k, v] of this.map.entries()) {
            if (v.expiresAt <= now) this.map.delete(k);
        }
    }
}