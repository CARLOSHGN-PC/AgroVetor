import pytest
from playwright.sync_api import sync_playwright, expect

@pytest.fixture(scope="module")
def browser_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        yield context
        browser.close()

def test_farm_outlines_always_visible(browser_context):
    page = browser_context.new_page()
    try:
        # Navigate to the app
        page.goto("http://localhost:8000", wait_until="networkidle")

        # Mock application state and UI
        page.evaluate("""
            window.App.state.currentUser = {
                uid: 'test-user',
                companyId: 'test-company',
                role: 'admin',
                permissions: { monitoramentoAereo: true }
            };
            window.App.state.companies = [{id: 'test-company', subscribedModules: ['monitoramentoAereo'] }];
            window.App.state.globalConfigs = { monitoramentoAereo: true };
            window.App.state.fazendas = [
                { id: '1', code: '123', name: 'Fazenda Risco Alto', companyId: 'test-company', talhoes: [] },
                { id: '2', code: '456', name: 'Fazenda Risco Baixo', companyId: 'test-company', talhoes: [] }
            ];
            window.App.state.armadilhas = [
                { id: 't1', fazendaCode: '123', status: 'Coletada', contagemMariposas: 10, dataColeta: new Date(), companyId: 'test-company' },
                { id: 't2', fazendaCode: '123', status: 'Coletada', contagemMariposas: 10, dataColeta: new Date(), companyId: 'test-company' },
                { id: 't3', fazendaCode: '123', status: 'Coletada', contagemMariposas: 10, dataColeta: new Date(), companyId: 'test-company' },
                { id: 't4', fazendaCode: '123', status: 'Coletada', contagemMariposas: 2, dataColeta: new Date(), companyId: 'test-company' }
            ];
             window.App.state.geoJsonData = {
                "type": "FeatureCollection",
                "features": [
                    { "type": "Feature", "id": 1, "properties": { "FAZENDA": "123" }, "geometry": { "type": "Polygon", "coordinates": [[]] } },
                    { "type": "Feature", "id": 2, "properties": { "FAZENDA": "456" }, "geometry": { "type": "Polygon", "coordinates": [[]] } }
                ]
            };

            window.App.state.mapboxMap = {
                _paint: {},
                _sources: {},
                _layers: {},
                featureStates: {},
                setPaintPropertyCalls: [],
                getLayer: function(id) { return this._layers && this._layers[id]; },
                getSource: function(id) { return this._sources[id]; },
                setPaintProperty: function(layer, prop, value) {
                    this.setPaintPropertyCalls.push({layer, prop, value});
                },
                setFeatureState: function(feature, state) {
                     if (!this.featureStates) this.featureStates = {};
                    const key = `${feature.source}-${feature.id}`;
                    this.featureStates[key] = { ...this.featureStates[key], ...state };
                },
                isStyleLoaded: () => true,
                on: () => {},
                addSource: () => {},
                addLayer: function(layer) {
                    if(!this._layers) this._layers = {};
                    this._layers[layer.id] = layer;
                },
                getCanvas: () => ({style: {cursor: ''}}),
                flyTo: () => {},
                fitBounds: () => {}
            };

            window.App.ui.showAppScreen();
            window.App.ui.showTab('monitoramentoAereo');
            window.App.mapModule.loadShapesOnMap();
        """)

        # 1. Verify outlines are visible by default
        border_opacity = page.evaluate("() => window.App.state.mapboxMap._layers['talhoes-border-layer'].paint['line-opacity']")
        assert border_opacity == 0.9

        # 2. Activate risk view
        page.evaluate("""
            window.App.state.riskViewActive = true;
            window.App.mapModule.calculateAndApplyRiskView();
        """)

        # 3. Verify at-risk farm is filled and others are not
        calls = page.evaluate("() => window.App.state.mapboxMap.setPaintPropertyCalls")

        fill_color_call = next(call for call in calls if call['prop'] == 'fill-color')
        assert fill_color_call['value'][2] == '#d32f2f' # Red for at-risk

        fill_opacity_call = next(call for call in calls if call['prop'] == 'fill-opacity')
        assert fill_opacity_call['value'][0] == 'case' # Opacity is conditional

    finally:
        page.close()
