export class Metrics {
    private processed = 0;
    private failed = 0;
    private retried = 0;
    private activeWorkers = 0;
    private averageProcessingTime = 0;
    private readonly alpha = 0.1;

    incrementProcessed() {
        this.processed++;
    }

    incrementFailed() {
        this.failed++;
    }

    incrementRetried() {
        this.retried++;
    }

    setActiveWorkers(count: number) {
        this.activeWorkers = count;
    }

    recordProcessingTime(ms: number) {
        if (this.averageProcessingTime === 0) {
            this.averageProcessingTime = ms;
        } else {
            this.averageProcessingTime = this.alpha * ms + (1 - this.alpha) * this.averageProcessingTime;
        }
    }

    getMetrics() {
        return {
            processed: this.processed,
            failed: this.failed,
            retried: this.retried,
            activeWorkers: this.activeWorkers,
            averageProcessingTimeMs: Math.round(this.averageProcessingTime * 100) / 100, // Round to 2 decimal places
        };
    }

    reset() {
        this.processed = 0;
        this.failed = 0;
        this.retried = 0;
        this.activeWorkers = 0;
        this.averageProcessingTime = 0;
    }
}

export const metrics = new Metrics();

