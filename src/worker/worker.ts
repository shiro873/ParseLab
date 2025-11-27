import { parentPort } from 'worker_threads';

function analyzeText(content: string) {
    const text = (content || '').trim();
    if (!text) {
        return {
            wordCount: 0,
            sentenceCount: 0,
            paragraphCount: 0,
            longestWord: '',
            topNWords: [],
            uniqueWords: [],
            mostFrequentWord: null
        };
    }

    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);
    const sentenceMatches = text.match(/[^.!?]+[.!?]+/g);
    const sentenceCount = sentenceMatches ? sentenceMatches.length : (text.length > 0 ? 1 : 0);
    const wordRegex = /[A-Za-z0-9\-_'`]+/g;
    const words = (text.match(wordRegex) || []).map(w => w.replace(/^['`]+|['`]+$/g, ''));

    const freq = new Map<string, number>();
    let longestWord = '';
    for (const w of words) {
        const key = w.toLowerCase();
        freq.set(key, (freq.get(key) || 0) + 1);
        if (w.length > longestWord.length) longestWord = w;
    }

    const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
    const topNWords = sorted.slice(0, 5).map(([word, count]) => ({ word, count }));
    const uniqueWords = Array.from(freq.keys()).sort();
    const mostFrequentWord = sorted.length > 0
        ? { word: sorted[0][0], count: sorted[0][1] }
        : null;

    return {
        wordCount: words.length,
        sentenceCount,
        paragraphCount: paragraphs.length || 1,
        longestWord,
        topNWords,
        uniqueWords,
        mostFrequentWord,
    };
}

if (parentPort) {
    parentPort.on('message', (data: { content: string; taskId: string }) => {
        try {
            const result = analyzeText(data.content);
            parentPort?.postMessage({
                taskId: data.taskId,
                success: true,
                result
            });
        } catch (error) {
            parentPort?.postMessage({
                taskId: data.taskId,
                success: false,
                error: String(error)
            });
        }
    });
}

