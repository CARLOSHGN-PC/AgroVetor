
export class NetworkManager extends EventTarget {
    constructor(backendUrl) {
        super();
        this.backendUrl = backendUrl || 'https://agrovetor-backend.onrender.com';
        this.status = navigator.onLine ? 'ONLINE' : 'OFFLINE';
        this.checkInterval = null;
        this.retryCount = 0;
        this.maxRetries = 2; // Fail 2x -> OFFLINE
        this.isInitialized = false;
        this.debounceTimer = null;
    }

    init(backendUrl) {
        if (this.isInitialized) return;

        if (backendUrl) {
            this.backendUrl = backendUrl;
        }

        window.addEventListener('online', () => this._handleBrowserOnline());
        window.addEventListener('offline', () => this._updateStatus('OFFLINE'));

        // Capacitor Integration
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Network) {
             window.Capacitor.Plugins.Network.addListener('networkStatusChange', (status) => {
                console.log(`[NetworkManager] Capacitor Network Change: ${status.connected}`);
                if (status.connected) {
                    this._handleBrowserOnline();
                } else {
                    this._updateStatus('OFFLINE');
                }
             });
        }

        // Start heartbeat if initially online
        if (this.status === 'ONLINE') {
            this._startHeartbeat();
        }

        this.isInitialized = true;
        console.log("[NetworkManager] Initialized. Status:", this.status);
    }

    _handleBrowserOnline() {
        // Debounce to allow connection to stabilize
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
             console.log("[NetworkManager] Browser Online. Verifying...");
             this._checkInternet();
             this._startHeartbeat();
        }, 3000); // 3s delay
    }

    _startHeartbeat() {
        if (this.checkInterval) clearInterval(this.checkInterval);
        this._checkInternet(); // Check immediately
        this.checkInterval = setInterval(() => this._checkInternet(), 15000); // 15s interval
    }

    _stopHeartbeat() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    async _checkInternet() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            // Add timestamp to prevent caching
            const response = await fetch(`${this.backendUrl}/health?t=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-store' },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this.retryCount = 0;
                this._updateStatus('ONLINE');
            } else {
                throw new Error(`Health check failed: ${response.status}`);
            }
        } catch (error) {
            console.warn(`[NetworkManager] Heartbeat failed: ${error.message}`);
            this.retryCount++;
            if (this.retryCount >= this.maxRetries) {
                this._updateStatus('OFFLINE');
            }
        }
    }

    _updateStatus(newStatus) {
        if (this.status !== newStatus) {
            console.log(`[NetworkManager] Status changed: ${this.status} -> ${newStatus}`);
            this.status = newStatus;

            if (newStatus === 'OFFLINE') {
                this._stopHeartbeat();
            } else if (newStatus === 'ONLINE') {
                // Heartbeat is already running if we came from _handleBrowserOnline
            }

            this.dispatchEvent(new CustomEvent('connectivity:changed', { detail: { status: newStatus } }));
        }
    }

    isOnline() {
        return this.status === 'ONLINE';
    }
}

export const networkManager = new NetworkManager();
