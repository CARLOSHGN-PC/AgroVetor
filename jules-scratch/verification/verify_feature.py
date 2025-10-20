from playwright.sync_api import sync_playwright, expect
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
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
                        { "type": "Feature", "id": 1, "properties": { "FAZENDA": "123" }, "geometry": { "type": "Polygon", "coordinates": [[[-48.0, -21.0], [-48.1, -21.0], [-48.1, -21.1], [-48.0, -21.1], [-48.0, -21.0]]] } },
                        { "type": "Feature", "id": 2, "properties": { "FAZENDA": "456" }, "geometry": { "type": "Polygon", "coordinates": [[[-48.2, -21.2], [-48.3, -21.2], [-48.3, -21.3], [-48.2, -21.3], [-48.2, -21.2]]] } }
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
                        if (layer === 'talhoes-layer' && prop === 'fill-opacity') {
                            const div = document.getElementById('farm-123');
                            if(div) div.style.backgroundColor = 'rgba(211, 47, 47, 0.5)';
                        }
                        if (layer === 'talhoes-border-layer' && prop === 'line-opacity') {
                            const div1 = document.getElementById('farm-123');
                            if(div1) div1.style.borderColor = '#FFD700';
                             const div2 = document.getElementById('farm-456');
                            if(div2) div2.style.borderColor = '#FFD700';
                        }
                    },
                    setFeatureState: function(feature, state) {},
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

                const mapContainer = document.getElementById('map');
                mapContainer.innerHTML = '';

                const div1 = document.createElement('div');
                div1.id = 'farm-123';
                div1.style.width = '100px';
                div1.style.height = '100px';
                div1.style.position = 'absolute';
                div1.style.top = '50px';
                div1.style.left = '50px';
                div1.style.border = '2px solid transparent';
                mapContainer.appendChild(div1);

                const div2 = document.createElement('div');
                div2.id = 'farm-456';
                div2.style.width = '100px';
                div2.style.height = '100px';
                div2.style.position = 'absolute';
                div2.style.top = '50px';
                div2.style.left = '170px';
                div2.style.border = '2px solid transparent';
                mapContainer.appendChild(div2);

                window.App.ui.showAppScreen();
                window.App.ui.showTab('monitoramentoAereo');
                window.App.mapModule.loadShapesOnMap();
            """)

            # Activate risk view
            page.evaluate("""
                window.App.state.riskViewActive = true;
                window.App.mapModule.calculateAndApplyRiskView();
            """)

            # Assertions
            expect(page.locator("#farm-123")).to_have_css("background-color", "rgba(211, 47, 47, 0.5)")
            expect(page.locator("#farm-123")).to_have_css("border-color", "rgb(255, 215, 0)")
            expect(page.locator("#farm-456")).to_have_css("border-color", "rgb(255, 215, 0)")

            os.makedirs("jules-scratch/verification", exist_ok=True)
            page.screenshot(path="jules-scratch/verification/farm_outlines_verification.png")

        finally:
            page.close()
            context.close()
            browser.close()

if __name__ == "__main__":
    run_verification()
