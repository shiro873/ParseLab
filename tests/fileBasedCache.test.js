"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fileBasedCache_1 = require("../src/cache/fileBasedCache");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
describe('FileBasedCache', () => {
    let cacheDir;
    let cache;
    beforeEach(() => {
        cacheDir = path.join(__dirname, '..', 'var', 'test-cache');
        // Clean up test cache directory
        if (fs.existsSync(cacheDir)) {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
        cache = new fileBasedCache_1.FileBasedCache(cacheDir);
    });
    afterEach(() => {
        // Clean up test cache directory
        if (fs.existsSync(cacheDir)) {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    });
    describe('set/get', () => {
        it('should set and get a value', async () => {
            await cache.set('key1', 'value1');
            const result = await cache.get('key1');
            expect(result).toBe('value1');
        });
        it('should return undefined for non-existent key', async () => {
            const result = await cache.get('nonexistent');
            expect(result).toBeUndefined();
        });
        it('should handle different value types', async () => {
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
            await cache.set('key', 'value1');
            await cache.set('key', 'value2');
            const result = await cache.get('key');
            expect(result).toBe('value2');
        });
        it('should create cache directory if it does not exist', () => {
            const newCacheDir = path.join(__dirname, '..', 'var', 'new-cache');
            if (fs.existsSync(newCacheDir)) {
                fs.rmSync(newCacheDir, { recursive: true, force: true });
            }
            const newCache = new fileBasedCache_1.FileBasedCache(newCacheDir);
            expect(fs.existsSync(newCacheDir)).toBe(true);
            fs.rmSync(newCacheDir, { recursive: true, force: true });
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
            await cache.set('key', 'value', 5000);
            jest.advanceTimersByTime(3000);
            const result = await cache.get('key');
            expect(result).toBe('value');
        });
        it('should return undefined after TTL expires', async () => {
            await cache.set('key', 'value', 2000);
            jest.advanceTimersByTime(2001);
            const result = await cache.get('key');
            expect(result).toBeUndefined();
        });
        it('should delete file after TTL expires', async () => {
            await cache.set('key', 'value', 1000);
            const filePath = path.join(cacheDir, 'key.json');
            expect(fs.existsSync(filePath)).toBe(true);
            jest.advanceTimersByTime(1001);
            await cache.get('key');
            expect(fs.existsSync(filePath)).toBe(false);
        });
        it('should handle multiple keys with different TTLs', async () => {
            await cache.set('short', 'value1', 1000);
            await cache.set('long', 'value2', 5000);
            jest.advanceTimersByTime(1500);
            expect(await cache.get('short')).toBeUndefined();
            expect(await cache.get('long')).toBe('value2');
            jest.advanceTimersByTime(4000);
            expect(await cache.get('long')).toBeUndefined();
        });
    });
    describe('atomic writes', () => {
        it('should write to temporary file first, then rename', async () => {
            await cache.set('key', 'value');
            const filePath = path.join(cacheDir, 'key.json');
            const tmpPath = `${filePath}.tmp`;
            // Temporary file should not exist after successful write
            expect(fs.existsSync(tmpPath)).toBe(false);
            // Final file should exist
            expect(fs.existsSync(filePath)).toBe(true);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            expect(content.value).toBe('value');
        });
    });
    describe('key sanitization', () => {
        it('should sanitize keys with special characters', async () => {
            await cache.set('job:123-abc', 'value1');
            await cache.set('key/with\\special:chars', 'value2');
            expect(await cache.get('job:123-abc')).toBe('value1');
            expect(await cache.get('key/with\\special:chars')).toBe('value2');
        });
    });
    describe('error handling', () => {
        it('should return undefined for corrupted files', async () => {
            const filePath = path.join(cacheDir, 'corrupted.json');
            fs.writeFileSync(filePath, 'invalid json', 'utf8');
            const result = await cache.get('corrupted');
            expect(result).toBeUndefined();
            // File should be cleaned up
            expect(fs.existsSync(filePath)).toBe(false);
        });
        it('should handle missing files gracefully', async () => {
            const result = await cache.get('nonexistent');
            expect(result).toBeUndefined();
        });
    });
    describe('concurrency', () => {
        it('should handle concurrent set operations', async () => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(cache.set(`key${i}`, `value${i}`));
            }
            await Promise.all(promises);
            for (let i = 0; i < 10; i++) {
                const value = await cache.get(`key${i}`);
                expect(value).toBe(`value${i}`);
            }
        });
        it('should handle concurrent get operations', async () => {
            await cache.set('key', 'value');
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(cache.get('key'));
            }
            const results = await Promise.all(promises);
            results.forEach(result => {
                expect(result).toBe('value');
            });
        });
        it('should handle concurrent set and get operations', async () => {
            const setPromises = [];
            const getPromises = [];
            for (let i = 0; i < 5; i++) {
                setPromises.push(cache.set(`key${i}`, `value${i}`));
            }
            await Promise.all(setPromises);
            for (let i = 0; i < 5; i++) {
                getPromises.push(cache.get(`key${i}`));
            }
            const results = await Promise.all(getPromises);
            results.forEach((result, i) => {
                expect(result).toBe(`value${i}`);
            });
        });
    });
});
