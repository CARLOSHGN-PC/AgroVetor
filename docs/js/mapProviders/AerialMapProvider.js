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
    async loadArmadilhas() {}
    async highlightTalhao() {}
    async fitBounds() {}
    async enableSelectionMode() {}
    onTalhaoClick() {}
    async setCamera() {}
    async destroy() {}

    async prepareOfflinePackage() {
        throw new Error('prepareOfflinePackage não suportado para este provider.');
    }

    async updateOfflinePackage() {
        throw new Error('updateOfflinePackage não suportado para este provider.');
    }

    async openOfflinePackage() {
        throw new Error('openOfflinePackage não suportado para este provider.');
    }

    async downloadOfflineRegion() {
        throw new Error('downloadOfflineRegion não suportado para este provider.');
    }

    async listOfflinePackages() {
        return [];
    }

    async listOfflineRegions() {
        return [];
    }

    async removeOfflinePackage() {
        return false;
    }

    async removeOfflineRegion() {
        return false;
    }
}
