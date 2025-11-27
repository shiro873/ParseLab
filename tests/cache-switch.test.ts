import { InMemoryCache } from '../src/cache/inMemoryCache';
import { FileBasedCache } from '../src/cache/fileBasedCache';
import * as fs from 'fs';
import * as path from 'path';

describe('Cache Switch Modes', () => {
  let testCacheDir: string;

  beforeEach(() => {
    testCacheDir = path.join(__dirname, '..', 'var', 'test-cache-switch');
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe('clear() method', () => {
    it('should clear InMemoryCache', async () => {
      const cache = new InMemoryCache();
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      expect(await cache.get('key1')).toBe('value1');
      expect(await cache.get('key2')).toBe('value2');
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeUndefined();
      expect(await cache.get('key2')).toBeUndefined();
    });

    it('should clear FileBasedCache', async () => {
      const cache = new FileBasedCache(testCacheDir);
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      expect(await cache.get('key1')).toBe('value1');
      expect(await cache.get('key2')).toBe('value2');
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeUndefined();
      expect(await cache.get('key2')).toBeUndefined();
      
      // Verify files are deleted
      const files = fs.readdirSync(testCacheDir);
      expect(files.filter(f => f.endsWith('.json'))).toHaveLength(0);
    });
  });

  describe('getAllEntries() method', () => {
    it('should return all entries from InMemoryCache with remaining TTL', async () => {
      const cache = new InMemoryCache();
      await cache.set('key1', 'value1', 5000);
      await cache.set('key2', 'value2', 10000);
      
      const entries = cache.getAllEntries();
      expect(entries.length).toBe(2);
      expect(entries.find(e => e.key === 'key1')).toBeDefined();
      expect(entries.find(e => e.key === 'key2')).toBeDefined();
      
      entries.forEach(entry => {
        expect(entry.ttlMs).toBeGreaterThan(0);
        expect(entry.ttlMs).toBeLessThanOrEqual(entry.key === 'key1' ? 5000 : 10000);
      });
    });

    it('should return all entries from FileBasedCache with remaining TTL', async () => {
      const cache = new FileBasedCache(testCacheDir);
      await cache.set('key1', 'value1', 5000);
      await cache.set('key2', 'value2', 10000);
      
      const entries = cache.getAllEntries();
      expect(entries.length).toBe(2);
      expect(entries.find(e => e.key === 'key1')).toBeDefined();
      expect(entries.find(e => e.key === 'key2')).toBeDefined();
      
      entries.forEach(entry => {
        expect(entry.ttlMs).toBeGreaterThan(0);
        expect(entry.ttlMs).toBeLessThanOrEqual(entry.key === 'key1' ? 5000 : 10000);
      });
    });

    it('should not return expired entries', async () => {
      jest.useFakeTimers();
      
      const cache = new InMemoryCache();
      await cache.set('expired', 'value', 1000);
      
      jest.advanceTimersByTime(2000);
      
      const entries = cache.getAllEntries();
      expect(entries.find(e => e.key === 'expired')).toBeUndefined();
      
      jest.useRealTimers();
    });
  });

  describe('migration: InMemoryCache -> FileBasedCache', () => {
    it('should migrate all entries with remaining TTL', async () => {
      const inMemoryCache = new InMemoryCache();
      await inMemoryCache.set('key1', 'value1', 5000);
      await inMemoryCache.set('key2', { foo: 'bar' }, 10000);
      
      const fileCache = new FileBasedCache(testCacheDir);
      const entries = inMemoryCache.getAllEntries();
      
      for (const entry of entries) {
        await fileCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      // Verify migration
      expect(await fileCache.get('key1')).toBe('value1');
      expect(await fileCache.get('key2')).toEqual({ foo: 'bar' });
    });

    it('should preserve TTL during migration', async () => {
      jest.useFakeTimers();
      
      const inMemoryCache = new InMemoryCache(10000); // Longer sweep interval to avoid cleanup interference
      await inMemoryCache.set('key1', 'value1', 5000);
      
      jest.advanceTimersByTime(2000);
      
      const fileCache = new FileBasedCache(testCacheDir);
      const entries = inMemoryCache.getAllEntries();
      
      expect(entries.length).toBe(1);
      expect(entries[0].ttlMs).toBeLessThanOrEqual(3000);
      expect(entries[0].ttlMs).toBeGreaterThan(0);
      
      for (const entry of entries) {
        await fileCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      // Entry should still be valid with remaining TTL
      expect(await fileCache.get('key1')).toBe('value1');
      
      // Advance time past the remaining TTL
      jest.advanceTimersByTime(entries[0].ttlMs + 1);
      expect(await fileCache.get('key1')).toBeUndefined();
      
      jest.useRealTimers();
    });
  });

  describe('migration: FileBasedCache -> InMemoryCache', () => {
    it('should migrate all entries with remaining TTL', async () => {
      const fileCache = new FileBasedCache(testCacheDir);
      await fileCache.set('key1', 'value1', 5000);
      await fileCache.set('key2', { foo: 'bar' }, 10000);
      
      const inMemoryCache = new InMemoryCache();
      const entries = fileCache.getAllEntries();
      
      for (const entry of entries) {
        await inMemoryCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      // Verify migration
      expect(await inMemoryCache.get('key1')).toBe('value1');
      expect(await inMemoryCache.get('key2')).toEqual({ foo: 'bar' });
    });

    it('should preserve TTL during migration', async () => {
      jest.useFakeTimers();
      
      const fileCache = new FileBasedCache(testCacheDir);
      await fileCache.set('key1', 'value1', 5000);
      
      jest.advanceTimersByTime(2000);
      
      const inMemoryCache = new InMemoryCache(10000); // Longer sweep interval to avoid cleanup interference
      const entries = fileCache.getAllEntries();
      
      expect(entries.length).toBe(1);
      expect(entries[0].ttlMs).toBeLessThanOrEqual(3000);
      expect(entries[0].ttlMs).toBeGreaterThan(0);
      
      for (const entry of entries) {
        await inMemoryCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      // Entry should still be valid with remaining TTL
      expect(await inMemoryCache.get('key1')).toBe('value1');
      
      // Advance time past the remaining TTL
      jest.advanceTimersByTime(entries[0].ttlMs + 1);
      expect(await inMemoryCache.get('key1')).toBeUndefined();
      
      jest.useRealTimers();
    });
  });

  describe('invalidate mode', () => {
    it('should clear InMemoryCache when invalidating', async () => {
      const cache = new InMemoryCache();
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeUndefined();
      expect(await cache.get('key2')).toBeUndefined();
    });

    it('should clear FileBasedCache when invalidating', async () => {
      const cache = new FileBasedCache(testCacheDir);
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeUndefined();
      expect(await cache.get('key2')).toBeUndefined();
      
      const files = fs.readdirSync(testCacheDir);
      expect(files.filter(f => f.endsWith('.json'))).toHaveLength(0);
    });
  });

  describe('migration edge cases', () => {
    it('should handle empty cache migration', async () => {
      const inMemoryCache = new InMemoryCache();
      const fileCache = new FileBasedCache(testCacheDir);
      
      const entries = inMemoryCache.getAllEntries();
      expect(entries).toHaveLength(0);
      
      for (const entry of entries) {
        await fileCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      expect(await fileCache.get('any')).toBeUndefined();
    });

    it('should handle migration with special characters in keys', async () => {
      const inMemoryCache = new InMemoryCache();
      await inMemoryCache.set('job:123-abc', 'value1', 5000);
      await inMemoryCache.set('key/with\\special:chars', 'value2', 5000);
      
      const fileCache = new FileBasedCache(testCacheDir);
      const entries = inMemoryCache.getAllEntries();
      
      for (const entry of entries) {
        await fileCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      expect(await fileCache.get('job:123-abc')).toBe('value1');
      expect(await fileCache.get('key/with\\special:chars')).toBe('value2');
    });

    it('should handle large number of entries during migration', async () => {
      const inMemoryCache = new InMemoryCache();
      
      // Create 100 entries
      for (let i = 0; i < 100; i++) {
        await inMemoryCache.set(`key${i}`, `value${i}`, 5000);
      }
      
      const fileCache = new FileBasedCache(testCacheDir);
      const entries = inMemoryCache.getAllEntries();
      
      expect(entries.length).toBe(100);
      
      for (const entry of entries) {
        await fileCache.set(entry.key, entry.value, entry.ttlMs);
      }
      
      // Verify all entries migrated
      for (let i = 0; i < 100; i++) {
        expect(await fileCache.get(`key${i}`)).toBe(`value${i}`);
      }
    });
  });
});

