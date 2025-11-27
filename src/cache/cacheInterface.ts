export interface Cache {
    set(key: string, value: any, ttlMs?: number): Promise<void>;
    get<T = any>(key: string): Promise<T | undefined>;
    clear(): Promise<void>;
}

export interface CacheEntry {
    key: string;
    value: any;
    ttlMs: number; // Remaining TTL in milliseconds
}

