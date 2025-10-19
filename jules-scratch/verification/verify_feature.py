from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto('http://localhost:8000/index.html')

    # 1. Wait for the app to be ready
    page.wait_for_function('window.App !== undefined')
    expect(page.locator('#loginScreen')).to_be_visible()

    companyId = 'company-123'
    atRiskFarmCode = '100'
    notAtRiskFarmCode = '200'

    # 2. Mock the entire App.state
    page.evaluate(f'''
        const companyId = '{companyId}';
        const atRiskFarmCode = '{atRiskFarmCode}';
        const notAtRiskFarmCode = '{notAtRiskFarmCode}';

        window.App.state.currentUser = {{
            uid: 'test-user-id',
            username: 'Test User',
            email: 'test@example.com',
            role: 'admin',
            companyId: companyId,
            permissions: {{ dashboard: true, monitoramentoAereo: true }}
        }};
        window.App.state.companies = [{{ id: companyId, name: 'Test Company', subscribedModules: ['monitoramentoAereo'] }}];
        window.App.state.globalConfigs = {{ monitoramentoAereo: true }};

        window.App.state.fazendas = [
            {{ id: 'farm-A', code: atRiskFarmCode, name: 'FARM AT RISK', companyId: companyId, talhoes: [] }},
            {{ id: 'farm-B', code: notAtRiskFarmCode, name: 'FARM NOT AT RISK', companyId: companyId, talhoes: [] }},
        ];

        const lastInstallDate = new Date();
        lastInstallDate.setDate(lastInstallDate.getDate() - 5);
        const oldInstallDate = new Date();
        oldInstallDate.setDate(oldInstallDate.getDate() - 20);

        window.App.state.armadilhas = [
            {{ id: 'trap-1', fazendaNome: 'FARM AT RISK', companyId: companyId, status: 'Coletada', dataInstalacao: oldInstallDate, dataColeta: new Date(), contagemMariposas: 2 }},
            {{ id: 'trap-2', fazendaNome: 'FARM AT RISK', companyId: companyId, status: 'Coletada', dataInstalacao: lastInstallDate, dataColeta: new Date(), contagemMariposas: 10 }},
            {{ id: 'trap-3', fazendaNome: 'FARM NOT AT RISK', companyId: companyId, status: 'Coletada', dataInstalacao: lastInstallDate, dataColeta: new Date(), contagemMariposas: 3 }},
        ];

        window.App.state.geoJsonData = {{
            type: 'FeatureCollection',
            features: [
                {{
                    type: 'Feature',
                    id: 1,
                    geometry: {{ type: 'Polygon', coordinates: [[[-48, -21], [-48, -21.1], [-48.1, -21.1], [-48.1, -21], [-48, -21]]] }},
                    properties: {{ FUNDO_AGR: atRiskFarmCode, NM_IMOVEL: 'FARM AT RISK' }}
                }},
                {{
                    type: 'Feature',
                    id: 2,
                    geometry: {{ type: 'Polygon', coordinates: [[[-49, -22], [-49, -22.1], [-49.1, -22.1], [-49.1, -22], [-49, -22]]] }},
                    properties: {{ FUNDO_AGR: notAtRiskFarmCode, NM_IMOVEL: 'FARM NOT AT RISK' }}
                }}
            ]
        }};
    ''')

    # 3. Manually trigger the app to show the main screen
    page.evaluate('window.App.ui.showAppScreen()')
    expect(page.locator('#appScreen')).to_be_visible()

    # 4. Navigate to the Monitoring tab
    page.locator('#btnToggleMenu').click()
    page.locator('nav').get_by_role('button', name='Monitoramento Aéreo').click()
    expect(page.locator('#monitoramentoAereo-container')).to_be_visible()

    # Wait for the map to fully load and render the shapes
    page.wait_for_function('window.App.state.mapboxMap && window.App.state.mapboxMap.isStyleLoaded()')
    page.wait_for_timeout(1000)

    # 5. Activate the risk view
    risk_button = page.locator('#btnToggleRiskView')
    expect(risk_button).to_be_visible()
    risk_button.click()

    page.wait_for_function('window.App.state.riskViewActive === true')
    page.wait_for_timeout(500)

    # 6. Click on the at-risk farm
    page.evaluate('''
        const map = window.App.state.mapboxMap;
        const feature = window.App.state.geoJsonData.features[0];
        App.mapModule.showTalhaoInfo(feature, 50.0);
    ''')

    # 7. Take a screenshot
    page.screenshot(path='jules-scratch/verification/verification.png')

    browser.close()

with sync_playwright() as p:
    run(p)
