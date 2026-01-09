export const ConnectivityStates = {
    BOOTING: 'BOOTING',
    OFFLINE: 'OFFLINE',
    ONLINE: 'ONLINE',
    DEGRADED: 'DEGRADED'
};

export class ConnectivityManager {
    constructor(options = {}) {
        this.heartbeatUrl = options.heartbeatUrl || 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
        this.heartbeatTimeoutMs = options.heartbeatTimeoutMs || 4000;
        this.heartbeatIntervalMs = options.heartbeatIntervalMs || 15000;
        this.failureThreshold = options.failureThreshold || 2;
        this.state = ConnectivityStates.BOOTING;
        this.lastChange = new Date();
        this.details = {
            signalConnected: null,
            signalSource: null,
            lastHeartbeatAt: null,
            lastHeartbeatSuccessAt: null,
            lastHeartbeatFailureAt: null,
            failureCount: 0
        };
        this.listeners = new Set();
        this.started = false;
        this._heartbeatTimer = null;
        this._abortController = null;
        this._unsubscribeNative = null;
        this._boundOnline = () => this._updateSignal(true, 'browser');
        this._boundOffline = () => this._updateSignal(false, 'browser');
    }

    getStatus() {
        return {
            state: this.state,
            lastChange: this.lastChange,
            details: { ...this.details }
        };
    }

    onChange(callback) {
        if (typeof callback !== 'function') return () => {};
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    start() {
        if (this.started) return;
        this.started = true;
        this._setState(ConnectivityStates.BOOTING, { reason: 'start' });
        this._setupSignalSources();
        this._scheduleHeartbeat(0);
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        this._clearHeartbeat();
        window.removeEventListener('online', this._boundOnline);
        window.removeEventListener('offline', this._boundOffline);
        if (this._unsubscribeNative) {
            this._unsubscribeNative();
            this._unsubscribeNative = null;
        }
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
    }

    _setupSignalSources() {
        window.addEventListener('online', this._boundOnline);
        window.addEventListener('offline', this._boundOffline);
        if (typeof navigator !== 'undefined') {
            this._updateSignal(navigator.onLine, 'browser');
        }

        if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
            try {
                const { Network } = Capacitor.Plugins;
                Network.getStatus().then((status) => {
                    this._updateSignal(status.connected, 'capacitor');
                });
                const handler = Network.addListener('networkStatusChange', (status) => {
                    this._updateSignal(status.connected, 'capacitor');
                });
                this._unsubscribeNative = () => handler.remove();
            } catch (error) {
                console.warn('ConnectivityManager: falha ao iniciar @capacitor/network', error);
            }
        }
    }

    _scheduleHeartbeat(delayMs = this.heartbeatIntervalMs) {
        this._clearHeartbeat();
        if (!this.started) return;
        this._heartbeatTimer = setTimeout(() => this._runHeartbeat(), delayMs);
    }

    _clearHeartbeat() {
        if (this._heartbeatTimer) {
            clearTimeout(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    async _runHeartbeat() {
        if (!this.started) return;
        this.details.lastHeartbeatAt = new Date();

        if (this.details.signalConnected === false) {
            this._evaluateState({ heartbeatOk: false, reason: 'signal_offline' });
            this._scheduleHeartbeat();
            return;
        }

        try {
            if (this._abortController) {
                this._abortController.abort();
            }
            this._abortController = new AbortController();
            const timeoutId = setTimeout(() => {
                if (this._abortController) {
                    this._abortController.abort();
                }
            }, this.heartbeatTimeoutMs);

            await fetch(this.heartbeatUrl, {
                method: 'HEAD',
                cache: 'no-store',
                mode: 'no-cors',
                signal: this._abortController.signal
            });

            clearTimeout(timeoutId);
            this.details.lastHeartbeatSuccessAt = new Date();
            this.details.failureCount = 0;
            this._evaluateState({ heartbeatOk: true, reason: 'heartbeat_success' });
        } catch (error) {
            this.details.lastHeartbeatFailureAt = new Date();
            this.details.failureCount += 1;
            this._evaluateState({ heartbeatOk: false, reason: 'heartbeat_failure' });
        } finally {
            this._scheduleHeartbeat();
        }
    }

    _updateSignal(connected, source) {
        this.details.signalConnected = connected;
        this.details.signalSource = source;
        this._evaluateState({ heartbeatOk: null, reason: 'signal_update' });
        this._scheduleHeartbeat(0);
    }

    _evaluateState({ heartbeatOk, reason }) {
        let nextState = this.state;
        if (this.details.signalConnected === false) {
            nextState = ConnectivityStates.OFFLINE;
        } else if (heartbeatOk === true) {
            nextState = ConnectivityStates.ONLINE;
        } else if (this.details.failureCount >= this.failureThreshold) {
            nextState = ConnectivityStates.OFFLINE;
        } else if (this.details.signalConnected === true) {
            nextState = ConnectivityStates.DEGRADED;
        } else {
            nextState = ConnectivityStates.BOOTING;
        }

        if (nextState !== this.state) {
            this._setState(nextState, { reason });
        }
    }

    _setState(state, meta = {}) {
        this.state = state;
        this.lastChange = new Date();
        const payload = this.getStatus();
        console.log(`CONNECTIVITY_CHANGE -> ${state}`, { meta, details: payload.details });
        window.dispatchEvent(new CustomEvent('connectivity:changed', { detail: payload }));
        this.listeners.forEach((listener) => {
            try {
                listener(payload);
            } catch (error) {
                console.warn('ConnectivityManager listener failed', error);
            }
        });
    }
}
