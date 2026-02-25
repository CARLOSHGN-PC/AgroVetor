export class AerialMapProvider {
    constructor({ app }) {
        this.app = app;
        this.kind = 'base';
    }

    static isSupported() {
        return false;
    }

    async initMap() {
        throw new Error('initMap não implementado para este provider.');
    }

    async setBaseMap() {}
    async loadTalhoes() {}
    async highlightTalhao() {}
    async fitBounds() {}
    async enableSelectionMode() {}
    onTalhaoClick() {}
    async setCamera() {}
    async destroy() {}

    async downloadOfflineRegion() {
        throw new Error('downloadOfflineRegion não suportado para este provider.');
    }

    async listOfflineRegions() {
        return [];
    }

    async removeOfflineRegion() {
        return false;
    }
}
