"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const inMemoryCache_1 = require("../src/cache/inMemoryCache");
describe('InMemoryCache', () => {
    describe('set/get', () => {
        it('should set and get a value', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('key1', 'value1');
            const result = await cache.get('key1');
            expect(result).toBe('value1');
        });
        it('should return undefined for non-existent key', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            const result = await cache.get('nonexistent');
            expect(result).toBeUndefined();
        });
        it('should handle different value types', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('string', 'test');
            await cache.set('number', 42);
            await cache.set('object', { foo: 'bar' });
            await cache.set('array', [1, 2, 3]);
            expect(await cache.get('string')).toBe('test');
            expect(await cache.get('number')).toBe(42);
            expect(await cache.get('object')).toEqual({ foo: 'bar' });
            expect(await cache.get('array')).toEqual([1, 2, 3]);
        });
        it('should overwrite existing key', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('key', 'value1');
            await cache.set('key', 'value2');
            const result = await cache.get('key');
            expect(result).toBe('value2');
        });
    });
    describe('TTL expiry', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });
        it('should return value before TTL expires', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('key', 'value', 5000);
            jest.advanceTimersByTime(3000);
            const result = await cache.get('key');
            expect(result).toBe('value');
        });
        it('should return undefined after TTL expires', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('key', 'value', 2000);
            jest.advanceTimersByTime(2001);
            const result = await cache.get('key');
            expect(result).toBeUndefined();
        });
        it('should handle multiple keys with different TTLs', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('short', 'value1', 1000);
            await cache.set('long', 'value2', 5000);
            jest.advanceTimersByTime(1500);
            expect(await cache.get('short')).toBeUndefined();
            expect(await cache.get('long')).toBe('value2');
            jest.advanceTimersByTime(4000);
            expect(await cache.get('long')).toBeUndefined();
        });
    });
    describe('cleanup', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });
        it('should remove expired entries during cleanup', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('key1', 'value1', 500);
            await cache.set('key2', 'value2', 3000);
            // Advance time to trigger cleanup
            jest.advanceTimersByTime(1500);
            // Manually trigger cleanup by advancing time past sweep interval
            jest.advanceTimersByTime(1000);
            expect(await cache.get('key1')).toBeUndefined();
            expect(await cache.get('key2')).toBe('value2');
        });
        it('should cleanup multiple expired entries', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(1000);
            await cache.set('key1', 'value1', 500);
            await cache.set('key2', 'value2', 500);
            await cache.set('key3', 'value3', 3000);
            jest.advanceTimersByTime(1000);
            jest.advanceTimersByTime(1000); // Trigger cleanup
            expect(await cache.get('key1')).toBeUndefined();
            expect(await cache.get('key2')).toBeUndefined();
            expect(await cache.get('key3')).toBe('value3');
        });
        it('should periodically cleanup expired entries via sweep interval', async () => {
            const cache = new inMemoryCache_1.InMemoryCache(500); // 500ms sweep interval
            await cache.set('key1', 'value1', 200);
            await cache.set('key2', 'value2', 200);
            // Advance past TTL
            jest.advanceTimersByTime(300);
            // Advance past sweep interval to trigger cleanup
            jest.advanceTimersByTime(500);
            expect(await cache.get('key1')).toBeUndefined();
            expect(await cache.get('key2')).toBeUndefined();
        });
    });
});
