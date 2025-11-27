import { analyzeText } from '../src/utils/analyze';

describe('analyzeText', () => {
  describe('empty string', () => {
    it('should return zero counts for empty string', () => {
      const result = analyzeText('');
      expect(result).toEqual({
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        longestWord: '',
        topNWords: [],
        uniqueWords: [],
        mostFrequentWord: null,
      });
    });

    it('should return zero counts for whitespace-only string', () => {
      const result = analyzeText('   \n\n\t  ');
      expect(result).toEqual({
        wordCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        longestWord: '',
        topNWords: [],
        uniqueWords: [],
        mostFrequentWord: null,
      });
    });
  });

  describe('single sentence', () => {
    it('should return wordCount=1 and sentenceCount=1 for single word', () => {
      const result = analyzeText('Hello.');
      expect(result.wordCount).toBe(1);
      expect(result.sentenceCount).toBe(1);
      expect(result.paragraphCount).toBe(1);
      expect(result.longestWord).toBe('Hello');
      expect(result.topNWords).toEqual([{ word: 'hello', count: 1 }]);
      expect(result.uniqueWords).toEqual(['hello']);
      expect(result.mostFrequentWord).toEqual({ word: 'hello', count: 1 });
    });

    it('should return correct counts for single sentence with multiple words', () => {
      const result = analyzeText('The quick brown fox jumps.');
      expect(result.wordCount).toBe(5);
      expect(result.sentenceCount).toBe(1);
      expect(result.paragraphCount).toBe(1);
      // longestWord could be "quick" or "jumps" (both 5 chars), depends on iteration order
      expect(['quick', 'jumps']).toContain(result.longestWord);
      expect(result.topNWords.length).toBeGreaterThan(0);
    });
  });

  describe('multiple paragraphs', () => {
    it('should correctly count paragraphs separated by \\n\\n', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = analyzeText(text);
      expect(result.paragraphCount).toBe(3);
    });

    it('should handle multiple newlines between paragraphs', () => {
      const text = 'Paragraph one.\n\n\n\nParagraph two.';
      const result = analyzeText(text);
      expect(result.paragraphCount).toBe(2);
    });

    it('should return paragraphCount=1 for single paragraph with single newline', () => {
      const text = 'Line one.\nLine two.';
      const result = analyzeText(text);
      expect(result.paragraphCount).toBe(1);
    });
  });

  describe('punctuation and hyphenated words', () => {
    it('should correctly tokenize hyphenated words', () => {
      const result = analyzeText('This is a well-known fact.');
      expect(result.wordCount).toBe(5);
      expect(result.topNWords.some(w => w.word === 'well-known')).toBe(true);
    });

    it('should handle punctuation correctly', () => {
      const result = analyzeText('Hello, world! How are you?');
      expect(result.wordCount).toBe(5);
      expect(result.sentenceCount).toBe(2);
      expect(result.topNWords.some(w => w.word === 'hello' || w.word === 'world')).toBe(true);
    });

    it('should find longest word correctly', () => {
      const result = analyzeText('The longest word is supercalifragilisticexpialidocious.');
      expect(result.longestWord).toBe('supercalifragilisticexpialidocious');
    });

    it('should handle words with apostrophes', () => {
      const result = analyzeText("It's a don't situation.");
      expect(result.wordCount).toBe(4);
      expect(result.topNWords.some(w => w.word === "it's" || w.word === "don't")).toBe(true);
    });

    it('should handle words with backticks', () => {
      const result = analyzeText('The `code` word.');
      expect(result.wordCount).toBe(3);
      expect(result.topNWords.some(w => w.word === 'code')).toBe(true);
    });
  });

  describe('topNWords', () => {
    it('should return top 5 words by frequency', () => {
      const text = 'the the the quick quick brown fox';
      const result = analyzeText(text);
      expect(result.topNWords.length).toBeLessThanOrEqual(5);
      expect(result.topNWords[0].word).toBe('the');
      expect(result.topNWords[0].count).toBe(3);
      expect(result.topNWords[1].word).toBe('quick');
      expect(result.topNWords[1].count).toBe(2);
    });

    it('should be case-insensitive for topNWords', () => {
      const text = 'The THE the Quick QUICK quick';
      const result = analyzeText(text);
      const theWord = result.topNWords.find(w => w.word === 'the');
      const quickWord = result.topNWords.find(w => w.word === 'quick');
      expect(theWord).toBeDefined();
      expect(theWord?.count).toBe(3);
      expect(quickWord).toBeDefined();
      expect(quickWord?.count).toBe(3);
    });

    it('should include expected words in topNWords (case-insensitive)', () => {
      const text = 'JavaScript is great. JavaScript is powerful.';
      const result = analyzeText(text);
      const jsWord = result.topNWords.find(w => w.word === 'javascript');
      expect(jsWord).toBeDefined();
      expect(jsWord?.count).toBe(2);
    });
  });

  describe('uniqueWords', () => {
    it('should return unique words sorted alphabetically and lowercased', () => {
      const result = analyzeText('Zebra Apple Banana apple');
      expect(result.uniqueWords).toEqual(['apple', 'banana', 'zebra']);
    });

    it('should be case-insensitive and sorted', () => {
      const result = analyzeText('The Quick Brown Fox Jumps Over The Lazy Dog');
      expect(result.uniqueWords).toEqual(['brown', 'dog', 'fox', 'jumps', 'lazy', 'over', 'quick', 'the']);
    });

    it('should handle duplicate words correctly', () => {
      const result = analyzeText('hello hello world world test');
      expect(result.uniqueWords).toEqual(['hello', 'test', 'world']);
    });

    it('should be empty for empty text', () => {
      const result = analyzeText('');
      expect(result.uniqueWords).toEqual([]);
    });
  });

  describe('mostFrequentWord', () => {
    it('should return the most frequent word with count', () => {
      const result = analyzeText('the the the quick quick brown');
      expect(result.mostFrequentWord).toEqual({ word: 'the', count: 3 });
    });

    it('should be case-insensitive', () => {
      const result = analyzeText('The THE the Quick QUICK quick');
      expect(result.mostFrequentWord).toEqual({ word: 'the', count: 3 });
    });

    it('should return first word when all have same frequency', () => {
      const result = analyzeText('apple banana cherry');
      expect(result.mostFrequentWord).toBeDefined();
      expect(result.mostFrequentWord?.count).toBe(1);
      expect(['apple', 'banana', 'cherry']).toContain(result.mostFrequentWord?.word);
    });

    it('should return null for empty text', () => {
      const result = analyzeText('');
      expect(result.mostFrequentWord).toBeNull();
    });

    it('should correctly identify most frequent word among multiple', () => {
      const result = analyzeText('cat dog cat bird cat dog');
      expect(result.mostFrequentWord).toEqual({ word: 'cat', count: 3 });
    });
  });
});

