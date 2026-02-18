export class AppDiagnostics {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.debugEnabled = params.get('debug') === '1';
    this.bootStartedAt = performance.now();
    this.bootFinished = false;
    this.metrics = {
      ttiMs: 0,
      bootRequests: 0,
      cacheMisses: 0,
      networkFailures: 0,
      longTasks: 0,
      bundleSizeBytes: 0
    };
    this._origFetch = null;
    this._observer = null;
  }

  isDebug() {
    return this.debugEnabled;
  }

  start() {
    this.installFetchInstrumentation();
    this.installLongTaskObserver();
    this.measureBundleSize();
    if (this.debugEnabled) {
      console.info('[debug] AppDiagnostics enabled via ?debug=1');
      this.renderDebugChip();
    }
  }

  finishBoot() {
    if (this.bootFinished) return;
    this.bootFinished = true;
    this.metrics.ttiMs = Math.round(performance.now() - this.bootStartedAt);
    this.logSummary();
    this.updateDebugChip();
  }

  installFetchInstrumentation() {
    if (this._origFetch || typeof window.fetch !== 'function') return;

    this._origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const requestInfo = args[0];
      const url = typeof requestInfo === 'string' ? requestInfo : requestInfo?.url;
      if (!this.bootFinished) this.metrics.bootRequests += 1;

      try {
        const response = await this._origFetch(...args);
        const cacheStatus = response.headers?.get?.('x-cache') || response.headers?.get?.('cf-cache-status');
        if (cacheStatus && /miss/i.test(cacheStatus)) {
          this.metrics.cacheMisses += 1;
        }
        if (!response.ok && response.status >= 500) {
          this.metrics.networkFailures += 1;
        }
        return response;
      } catch (error) {
        this.metrics.networkFailures += 1;
        if (this.debugEnabled) {
          console.warn('[debug] fetch failure', url, error?.message || error);
        }
        throw error;
      } finally {
        this.updateDebugChip();
      }
    };
  }

  installLongTaskObserver() {
    if (!('PerformanceObserver' in window)) return;
    try {
      this._observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 200) {
            this.metrics.longTasks += 1;
            if (this.debugEnabled) {
              console.warn(`[debug] long task detected: ${entry.duration.toFixed(1)}ms`);
            }
          }
        }
        this.updateDebugChip();
      });
      this._observer.observe({ type: 'longtask', buffered: true });
    } catch (err) {
      // Long task API unsupported in some WebViews.
    }
  }

  measureBundleSize() {
    const entry = performance.getEntriesByType('resource').find((item) => item.name.includes('/app.js'));
    if (entry?.transferSize) {
      this.metrics.bundleSizeBytes = entry.transferSize;
    }
  }

  renderDebugChip() {
    if (document.getElementById('debug-metrics-chip')) return;
    const chip = document.createElement('div');
    chip.id = 'debug-metrics-chip';
    chip.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;background:#111;color:#fff;padding:8px 10px;border-radius:8px;font-size:11px;max-width:240px;opacity:.9;';
    document.body.appendChild(chip);
    this.updateDebugChip();
  }

  updateDebugChip() {
    if (!this.debugEnabled) return;
    const chip = document.getElementById('debug-metrics-chip');
    if (!chip) return;
    chip.textContent = `TTI:${this.metrics.ttiMs || '-'}ms | Req:${this.metrics.bootRequests} | Miss:${this.metrics.cacheMisses} | NetFail:${this.metrics.networkFailures} | Long>${this.metrics.longTasks}`;
  }

  logSummary() {
    const bundleKb = (this.metrics.bundleSizeBytes / 1024).toFixed(1);
    console.info('[perf] boot summary', {
      ttiMs: this.metrics.ttiMs,
      bootRequests: this.metrics.bootRequests,
      cacheMisses: this.metrics.cacheMisses,
      networkFailures: this.metrics.networkFailures,
      longTasks: this.metrics.longTasks,
      bundleSizeKb: Number.isFinite(Number(bundleKb)) ? bundleKb : 'n/a'
    });
  }
}

export const appDiagnostics = new AppDiagnostics();
