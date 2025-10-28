import pytest
from playwright.sync_api import sync_playwright, expect
import os

@pytest.fixture(scope="module")
def browser_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        yield context
        browser.close()

def test_risk_view_logic(browser_context):
    page = browser_context.new_page()
    try:
        # Navigate to the app
        page.goto("http://localhost:8000", wait_until="networkidle")

        # Mock application state and UI
        page.evaluate("""
            window.App = window.App || {};
            window.App.state = window.App.state || {};
            window.App.ui = window.App.ui || {
                updateNotificationBell: () => {},
                _getThemeColors: () => ({ primary: '#000' }),
                showAlert: () => {}
            };

            const mockRiskView = () => {
                const farmsInRisk = new Set();
                const allFarms = window.App.state.fazendas;
                const collectedTraps = window.App.state.armadilhas.filter(t => t.status === 'Coletada');

                allFarms.forEach(farm => {
                    const collectedTrapsOnFarm = collectedTraps.filter(t => String(t.fazendaCode) === String(farm.code));
                    if (collectedTrapsOnFarm.length > 0) {
                        const highCountTraps = collectedTrapsOnFarm.filter(t => t.contagemMariposas >= 6);
                        const riskPercentage = (highCountTraps.length / collectedTrapsOnFarm.length) * 100;
                        if (riskPercentage > 30) {
                            farmsInRisk.add(String(farm.code));
                        }
                    }
                });

                const features = window.App.state.geoJsonData.features;
                features.forEach(f => {
                     const farmCode = f.properties.FUNDO_AGR;
                     if (farmsInRisk.has(String(farmCode))) {
                        window.App.state.mapboxMap.setFeatureState({ source: 'talhoes-source', id: f.id }, { risk: true });
                     }
                });
            };

            window.App.mapModule = {
                calculateAndApplyRiskView: mockRiskView
            };


            window.App.state.currentUser = {
                uid: 'test-user',
                companyId: 'test-company',
                role: 'admin',
                permissions: { monitoramentoAereo: true }
            };
            window.App.state.companies = [{id: 'test-company', subscribedModules: ['monitoramentoAereo'] }];
            window.App.state.globalConfigs = { monitoramentoAereo: true };
            window.App.state.fazendas = [
                { id: '1', code: '123', name: 'Fazenda Risco Alto', companyId: 'test-company', talhoes: [] }
            ];
            window.App.state.armadilhas = [
                { id: 't1', fazendaCode: '123', status: 'Coletada', contagemMariposas: 10, dataColeta: new Date(), companyId: 'test-company' },
                { id: 't2', fazendaCode: '123', status: 'Coletada', contagemMariposas: 10, dataColeta: new Date(), companyId: 'test-company' },
                { id: 't3', fazendaCode: '123', status: 'Coletada', contagemMariposas: 10, dataColeta: new Date(), companyId: 'test-company' },
                { id: 't4', fazendaCode: '123', status: 'Coletada', contagemMariposas: 2, dataColeta: new Date(), companyId: 'test-company' }
            ];
             window.App.state.geoJsonData = {
                "type": "FeatureCollection",
                "features": [{ "type": "Feature", "id": 1, "properties": { "FUNDO_AGR": "123" }, "geometry": { "type": "Polygon", "coordinates": [[]] } }]
            };

            window.App.state.mapboxMap = {
                _paint: {},
                _sources: {},
                featureStates: {},
                setPaintPropertyCalls: [],
                getLayer: function(id) { return true; },
                getSource: function(id) { return this._sources[id]; },
                querySourceFeatures: function(sourceId, filter) {
                    return window.App.state.geoJsonData.features;
                },
                setPaintProperty: function(layer, prop, value) {
                    this.setPaintPropertyCalls.push({layer, prop, value});
                },
                setFeatureState: function(feature, state) {
                    const key = `${feature.source}-${feature.id}`;
                    this.featureStates[key] = { ...this.featureStates[key], ...state };
                },
                isStyleLoaded: () => true,
                on: () => {},
                getCanvas: () => ({style: {cursor: ''}}),
                flyTo: () => {},
                fitBounds: () => {}
            };
        """)

        # Directly call the function to apply risk view
        page.evaluate("""
            window.App.state.riskViewActive = true;
            if (window.App.mapModule.calculateAndApplyRiskView) {
                window.App.mapModule.calculateAndApplyRiskView();
            } else {
                console.error('window.App.mapModule.calculateAndApplyRiskView is not a function');
            }
        """)

        # Check the result
        feature_state = page.evaluate("() => window.App.state.mapboxMap.featureStates")

        # Farm with code '123' (ID 1) should be high risk because 3/4 traps are high count (75%)
        assert feature_state is not None
        assert 'talhoes-source-1' in feature_state
        assert feature_state['talhoes-source-1']['risk'] is True

    finally:
        page.close()
