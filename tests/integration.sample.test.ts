import { analyzeText } from '../src/utils/analyze';
import * as fs from 'fs';
import * as path from 'path';

describe('Integration Test - Sample Articles', () => {
  let articles: Array<{ id: string; title: string; content: string }>;
  let expectedResults: Array<{
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    longestWord: string;
    topNWords: Array<{ word: string; count: number }>;
    uniqueWords: string[];
    mostFrequentWord: { word: string; count: number } | null;
  }>;

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
      const result = analyzeText(article.content);
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
      const result = analyzeText(emptyArticle.content);
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
      const result = analyzeText(singleWordArticle.content);
      const expected = expectedResults[index];

      expect(result).toEqual(expected);
      expect(result.wordCount).toBe(1);
      expect(result.sentenceCount).toBe(1);
    }
  });

  it('should correctly identify most frequent words', () => {
    const repeatedWordArticle = articles.find(a => 
      a.content.includes('JavaScript') && a.content.split('JavaScript').length > 2
    );
    expect(repeatedWordArticle).toBeDefined();
    
    if (repeatedWordArticle) {
      const index = articles.indexOf(repeatedWordArticle);
      const result = analyzeText(repeatedWordArticle.content);
      const expected = expectedResults[index];

      expect(result.mostFrequentWord).toEqual(expected.mostFrequentWord);
      expect(result.mostFrequentWord?.word).toBe('javascript');
      expect(result.mostFrequentWord?.count).toBeGreaterThan(1);
    }
  });

  it('should correctly count paragraphs', () => {
    const multiParagraphArticle = articles.find(a => 
      a.content.includes('\n\n')
    );
    expect(multiParagraphArticle).toBeDefined();
    
    if (multiParagraphArticle) {
      const index = articles.indexOf(multiParagraphArticle);
      const result = analyzeText(multiParagraphArticle.content);
      const expected = expectedResults[index];

      expect(result.paragraphCount).toBe(expected.paragraphCount);
      expect(result.paragraphCount).toBeGreaterThan(1);
    }
  });
});

