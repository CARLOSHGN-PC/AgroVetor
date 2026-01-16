// docs/js/services/SessionManager.js

export const SessionStatus = {
    SIGNED_OUT: 'SIGNED_OUT',
    AUTHENTICATED_LOCAL: 'AUTHENTICATED_LOCAL',
    NEEDS_ONLINE_REAUTH: 'NEEDS_ONLINE_REAUTH',
};

export class SessionManager {
    constructor(options = {}) {
        this.status = SessionStatus.SIGNED_OUT;
        this.userProfile = null;
        this.onStatusChange = options.onStatusChange || null;
    }

    setAuthenticatedLocal(userProfile, metadata = {}) {
        this.userProfile = userProfile || this.userProfile;
        this._updateStatus(SessionStatus.AUTHENTICATED_LOCAL, metadata);
    }

    setNeedsOnlineReauth(metadata = {}) {
        if (!this.userProfile) return;
        this._updateStatus(SessionStatus.NEEDS_ONLINE_REAUTH, metadata);
    }

    setSignedOut(metadata = {}) {
        this.userProfile = null;
        this._updateStatus(SessionStatus.SIGNED_OUT, metadata);
    }

    isAuthenticated() {
        return this.status === SessionStatus.AUTHENTICATED_LOCAL;
    }

    needsReauth() {
        return this.status === SessionStatus.NEEDS_ONLINE_REAUTH;
    }

    _updateStatus(nextStatus, metadata) {
        if (this.status === nextStatus) return;
        this.status = nextStatus;
        if (this.onStatusChange) {
            this.onStatusChange(this.status, metadata);
        }
    }
}
