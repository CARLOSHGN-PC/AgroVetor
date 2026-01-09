// docs/js/services/NetworkManager.js

export const NetworkStatus = Object.freeze({
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    UNSTABLE: 'UNSTABLE'
});

const DEFAULT_OPTIONS = {
    heartbeatUrl: '/health',
    heartbeatIntervalMs: 15000,
    heartbeatTimeoutMs: 4000,
    failureThreshold: 2,
    stableDelayMs: 4000
};

class NetworkManager extends EventTarget {
    constructor(options = {}) {
        super();
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.status = NetworkStatus.OFFLINE;
        this.transportOnline = navigator.onLine;
        this.failureCount = 0;
        this.heartbeatTimer = null;
        this.stableTimer = null;
        this.started = false;
    }

    configure(options = {}) {
        this.options = { ...this.options, ...options };
    }

    start() {
        if (this.started) return;
        this.started = true;

        window.addEventListener('online', () => this.updateTransportStatus(true, 'browser'));
        window.addEventListener('offline', () => this.updateTransportStatus(false, 'browser'));

        this.updateTransportStatus(this.transportOnline, 'browser');
    }

    updateTransportStatus(isOnline, source = 'unknown') {
        this.transportOnline = Boolean(isOnline);

        if (!this.transportOnline) {
            this.stopHeartbeat();
            this.clearStableTimer();
            this.failureCount = 0;
            this.setStatus(NetworkStatus.OFFLINE, source);
            return;
        }

        if (this.status === NetworkStatus.OFFLINE) {
            this.setStatus(NetworkStatus.UNSTABLE, source);
        }

        this.startHeartbeat();
        this.checkNow(source);
    }

    async checkNow(source = 'heartbeat') {
        if (!this.transportOnline) {
            this.setStatus(NetworkStatus.OFFLINE, source);
            return false;
        }

        try {
            const ok = await this.checkInternet();
            if (ok) {
                this.handleHeartbeatSuccess(source);
                return true;
            }
            this.handleHeartbeatFailure(source);
            return false;
        } catch (error) {
            this.handleHeartbeatFailure(source);
            return false;
        }
    }

    async checkInternet() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.heartbeatTimeoutMs);

        try {
            const response = await fetch(this.options.heartbeatUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-store' },
                signal: controller.signal
            });
            return response.ok;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    handleHeartbeatSuccess(source) {
        this.failureCount = 0;

        if (this.status !== NetworkStatus.ONLINE) {
            this.scheduleStableOnline(source);
        }
    }

    handleHeartbeatFailure(source) {
        this.failureCount += 1;
        if (this.failureCount >= this.options.failureThreshold) {
            this.clearStableTimer();
            this.setStatus(NetworkStatus.UNSTABLE, source);
        }
    }

    scheduleStableOnline(source) {
        if (this.stableTimer) return;
        this.stableTimer = setTimeout(() => {
            this.stableTimer = null;
            if (this.transportOnline) {
                this.setStatus(NetworkStatus.ONLINE, source);
            }
        }, this.options.stableDelayMs);
    }

    clearStableTimer() {
        if (this.stableTimer) {
            clearTimeout(this.stableTimer);
            this.stableTimer = null;
        }
    }

    startHeartbeat() {
        if (this.heartbeatTimer) return;
        this.heartbeatTimer = setInterval(() => this.checkNow('heartbeat'), this.options.heartbeatIntervalMs);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    setStatus(status, source) {
        if (this.status === status) return;
        this.status = status;
        this.dispatchEvent(new CustomEvent('connectivity:changed', {
            detail: {
                status,
                source,
                isOnline: status === NetworkStatus.ONLINE
            }
        }));
    }

    isOnline() {
        return this.status === NetworkStatus.ONLINE;
    }

    getStatus() {
        return this.status;
    }
}

export const networkManager = new NetworkManager();
