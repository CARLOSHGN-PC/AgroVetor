export default class PerfLogger {
    constructor() {
        this.metrics = {};
        this.marks = {};
        this.logs = [];
    }

    start(label) {
        this.marks[label] = performance.now();
    }

    end(label) {
        if (this.marks[label]) {
            const duration = performance.now() - this.marks[label];
            this.metrics[label] = duration;
            this.logs.push({ label, duration, timestamp: new Date().toISOString() });
            // console.log(`[PerfLogger] ${label}: ${duration.toFixed(2)}ms`);
            delete this.marks[label];
            return duration;
        }
        return 0;
    }

    measure(label, fn) {
        this.start(label);
        try {
            const result = fn();
            // Handle promises
            if (result instanceof Promise) {
                return result.finally(() => {
                    this.end(label);
                });
            }
            this.end(label);
            return result;
        } catch (e) {
            this.end(label);
            throw e;
        }
    }

    getMetrics() {
        return this.metrics;
    }

    getLogs() {
        return this.logs;
    }

    export() {
        return JSON.stringify(this.logs, null, 2);
    }
}

// Singleton instance for global usage if needed
export const perfLogger = new PerfLogger();
window.PerfLogger = perfLogger; // Expose to window for console debugging
