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
const analyze_1 = require("../src/utils/analyze");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
describe('Integration Test - Sample Articles', () => {
    let articles;
    let expectedResults;
    beforeAll(() => {
        const samplesDir = path.join(__dirname, '..', 'samples');
        const articlesPath = path.join(samplesDir, 'articles.json');
        const expectedPath = path.join(samplesDir, 'expected-results.json');
        articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
        expectedResults = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    });
    it('should load sample articles and expected results', () => {
        expect(articles).toBeDefined();
        expect(articles.length).toBeGreaterThan(0);
        expect(expectedResults).toBeDefined();
        expect(expectedResults.length).toBe(articles.length);
    });
    it('should analyze each article and match expected results', () => {
        articles.forEach((article, index) => {
            const result = (0, analyze_1.analyzeText)(article.content);
            const expected = expectedResults[index];
            expect(result.wordCount).toBe(expected.wordCount);
            expect(result.sentenceCount).toBe(expected.sentenceCount);
            expect(result.paragraphCount).toBe(expected.paragraphCount);
            expect(result.longestWord).toBe(expected.longestWord);
            expect(result.topNWords).toEqual(expected.topNWords);
            expect(result.uniqueWords).toEqual(expected.uniqueWords);
            expect(result.mostFrequentWord).toEqual(expected.mostFrequentWord);
        });
    });
    it('should handle empty content correctly', () => {
        const emptyArticle = articles.find(a => a.content === '');
        expect(emptyArticle).toBeDefined();
        if (emptyArticle) {
            const index = articles.indexOf(emptyArticle);
            const result = (0, analyze_1.analyzeText)(emptyArticle.content);
            const expected = expectedResults[index];
            expect(result).toEqual(expected);
            expect(result.wordCount).toBe(0);
            expect(result.sentenceCount).toBe(0);
            expect(result.paragraphCount).toBe(0);
            expect(result.longestWord).toBe('');
            expect(result.topNWords).toEqual([]);
            expect(result.uniqueWords).toEqual([]);
            expect(result.mostFrequentWord).toBeNull();
        }
    });
    it('should handle single word articles correctly', () => {
        const singleWordArticle = articles.find(a => a.content === 'Test.');
        expect(singleWordArticle).toBeDefined();
        if (singleWordArticle) {
            const index = articles.indexOf(singleWordArticle);
            const result = (0, analyze_1.analyzeText)(singleWordArticle.content);
            const expected = expectedResults[index];
            expect(result).toEqual(expected);
            expect(result.wordCount).toBe(1);
            expect(result.sentenceCount).toBe(1);
        }
    });
    it('should correctly identify most frequent words', () => {
        const repeatedWordArticle = articles.find(a => a.content.includes('JavaScript') && a.content.split('JavaScript').length > 2);
        expect(repeatedWordArticle).toBeDefined();
        if (repeatedWordArticle) {
            const index = articles.indexOf(repeatedWordArticle);
            const result = (0, analyze_1.analyzeText)(repeatedWordArticle.content);
            const expected = expectedResults[index];
            expect(result.mostFrequentWord).toEqual(expected.mostFrequentWord);
            expect(result.mostFrequentWord?.word).toBe('javascript');
            expect(result.mostFrequentWord?.count).toBeGreaterThan(1);
        }
    });
    it('should correctly count paragraphs', () => {
        const multiParagraphArticle = articles.find(a => a.content.includes('\n\n'));
        expect(multiParagraphArticle).toBeDefined();
        if (multiParagraphArticle) {
            const index = articles.indexOf(multiParagraphArticle);
            const result = (0, analyze_1.analyzeText)(multiParagraphArticle.content);
            const expected = expectedResults[index];
            expect(result.paragraphCount).toBe(expected.paragraphCount);
            expect(result.paragraphCount).toBeGreaterThan(1);
        }
    });
});
