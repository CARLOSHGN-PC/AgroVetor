
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto('http://localhost:8000/index.html')

            # 1. Wait for the app to be ready
            page.wait_for_function('window.App !== undefined')
            expect(page.locator('#loginScreen')).to_be_visible()

            companyId = 'company-123'
            atRiskFarmCode = '100'
            notAtRiskFarmCode = '200'

            # 2. Mock the entire App.state to simulate the scenario
            args = {
                "companyId": companyId,
                "atRiskFarmCode": atRiskFarmCode,
                "notAtRiskFarmCode": notAtRiskFarmCode
            }

            page.evaluate('''args => {
                window.App.state.currentUser = {
                    uid: 'test-user-id',
                    username: 'Test User',
                    role: 'admin',
                    companyId: args.companyId,
                    permissions: { dashboard: true, monitoramentoAereo: true }
                };
                window.App.state.companies = [{ id: args.companyId, name: 'Test Company', subscribedModules: ['monitoramentoAereo'] }];
                window.App.state.globalConfigs = { monitoramentoAereo: true };

                window.App.state.fazendas = [
                    { id: 'farm-A', code: args.atRiskFarmCode, name: 'FARM AT RISK', companyId: args.companyId, talhoes: [] },
                    { id: 'farm-B', code: args.notAtRiskFarmCode, name: 'FARM NOT AT RISK', companyId: args.companyId, talhoes: [] },
                ];

                const lastInstallDate = new Date();
                lastInstallDate.setDate(lastInstallDate.getDate() - 5);
                const oldInstallDate = new Date();
                oldInstallDate.setDate(oldInstallDate.getDate() - 20);

                window.App.state.armadilhas = [
                    { id: 'trap-1', fazendaCode: args.atRiskFarmCode, fazendaNome: 'FARM AT RISK', companyId: args.companyId, status: 'Coletada', dataInstalacao: oldInstallDate, dataColeta: new Date(), contagemMariposas: 2 },
                    { id: 'trap-2', fazendaCode: args.atRiskFarmCode, fazendaNome: 'FARM AT RISK', companyId: args.companyId, status: 'Coletada', dataInstalacao: lastInstallDate, dataColeta: new Date(), contagemMariposas: 10 },
                    { id: 'trap-3', fazendaNome: 'FARM NOT AT RISK', companyId: args.companyId, status: 'Coletada', dataInstalacao: lastInstallDate, dataColeta: new Date(), contagemMariposas: 3 },
                ];

                window.App.state.geoJsonData = {
                    type: 'FeatureCollection',
                    features: [
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Polygon', coordinates: [[[-48, -21], [-48, -21.1], [-48.1, -21.1], [-48.1, -21], [-48, -21]]] },
                            properties: { FUNDO_AGR: args.atRiskFarmCode, NM_IMOVEL: 'FARM AT RISK' }
                        },
                        {
                            type: 'Feature',
                            id: 2,
                            geometry: { type: 'Polygon', coordinates: [[[-49, -22], [-49, -22.1], [-49.1, -22.1], [-49.1, -22], [-49, -22]]] },
                            properties: { FUNDO_AGR: args.notAtRiskFarmCode, NM_IMOVEL: 'FARM NOT AT RISK' }
                        }
                    ]
                };

                window.App.ui.showAppScreen();
            }''', args)

            # 3. Navigate to the Monitoring tab
            page.locator('#btnToggleMenu').click()
            page.locator('nav').get_by_role('button', name='Monitoramento Aéreo').click()
            expect(page.locator('#monitoramentoAereo-container')).to_be_visible()

            page.wait_for_function('window.App.state.mapboxMap && window.App.state.mapboxMap.isStyleLoaded()')
            page.wait_for_timeout(1000)

            # 4. Activate the risk view
            risk_button = page.locator('#btnToggleRiskView')
            expect(risk_button).to_be_visible()
            risk_button.click()

            page.wait_for_function('window.App.state.riskViewActive === true')
            page.wait_for_timeout(500)

            # 5. Take screenshot
            page.screenshot(path="jules-scratch/verification/verification.png")

            print("Screenshot taken successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
