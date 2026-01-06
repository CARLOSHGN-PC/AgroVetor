const { test, expect } = require('@playwright/test');

test.describe('KMRepository offline workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.Capacitor = {
        isNativePlatform: () => false,
        Plugins: {
          StatusBar: { setOverlaysWebView: () => {} },
          Network: { getStatus: async () => ({ connected: true }), addListener: () => {} },
          PushNotifications: { checkPermissions: async () => ({ receive: 'granted' }), requestPermissions: async () => ({ receive: 'granted' }), register: async () => {}, addListener: () => {} },
          Geolocation: { getCurrentPosition: async () => ({ coords: { latitude: -21.17, longitude: -48.45 } }), watchPosition: () => 'watch-id' },
        },
      };
    });

    await page.goto('http://localhost:8000/index.html');
    await page.waitForFunction(() => window.App);

    await page.evaluate(() => {
      const adminPermissions = { controleKM: true, gestaoFrota: true, dashboard: true };
      window.App.state.currentUser = {
        uid: 'mock-user-id',
        email: 'test@test.com',
        username: 'testuser',
        role: 'admin',
        active: true,
        companyId: 'mock-company-id',
        permissions: adminPermissions
      };
      window.App.state.companies = [{ id: 'mock-company-id', name: 'Mock Company', subscribedModules: Object.keys(adminPermissions) }];
      window.App.state.globalConfigs = Object.keys(adminPermissions).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {});
      window.App.ui.showAppScreen();
    });
  });

  test('should create, update, list, and delete KM entries offline', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.App.offlineDB.init();
      window.App.fleet.init();

      const repo = window.App.fleet.kmRepository;
      const created = await repo.createKM({
        veiculoId: 'vehicle-1',
        veiculoNome: 'V1',
        motorista: 'Motorista 1',
        motoristaMatricula: '123',
        kmInicial: 100,
        origem: 'Base',
        dataSaida: new Date().toISOString(),
        status: 'EM_DESLOCAMENTO',
        companyId: window.App.state.currentUser.companyId,
        criadoPor: window.App.state.currentUser.email
      });

      await repo.updateKM(created.id, { kmFinal: 150, kmRodado: 50, destino: 'Fazenda', dataChegada: new Date().toISOString(), status: 'FINALIZADO' });
      const listed = await repo.listKM({
        page: 0,
        pageSize: 10,
        filters: { status: 'FINALIZADO', orderBy: 'dataChegada', direction: 'desc' }
      });
      await repo.deleteKM(created.id);
      const afterDelete = await repo.listKM({
        page: 0,
        pageSize: 10,
        filters: { status: 'FINALIZADO' }
      });

      const queued = await window.App.offlineDB.getAll('offline-writes');

      return {
        createdId: created.id,
        listedCount: listed.total,
        afterDeleteCount: afterDelete.total,
        queuedCount: queued.length
      };
    });

    expect(result.createdId).toBeTruthy();
    expect(result.listedCount).toBe(1);
    expect(result.afterDeleteCount).toBe(0);
    expect(result.queuedCount).toBeGreaterThanOrEqual(2);
  });

  test('should mark KM records as synced after mocked sync', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.App.offlineDB.init();
      window.App.fleet.init();
      const repo = window.App.fleet.kmRepository;

      const created = await repo.createKM({
        veiculoId: 'vehicle-2',
        veiculoNome: 'V2',
        motorista: 'Motorista 2',
        motoristaMatricula: '456',
        kmInicial: 200,
        origem: 'Base',
        dataSaida: new Date().toISOString(),
        status: 'EM_DESLOCAMENTO',
        companyId: window.App.state.currentUser.companyId,
        criadoPor: window.App.state.currentUser.email
      });

      window.App.data.setDocument = async () => {};
      window.App.data.updateDocument = async () => {};
      window.App.data.deleteDocument = async () => {};
      window.App.data.addDocument = async () => ({ id: 'mock-log' });

      await window.App.actions.syncOfflineWrites();

      const refreshed = await repo.getKM(created.id);
      return refreshed?.syncStatus || null;
    });

    expect(result).toBe('synced');
  });
});
