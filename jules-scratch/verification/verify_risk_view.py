
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:8000", wait_until="networkidle")

        # Bypass login and go directly to the map view by manipulating app state
        page.evaluate("""() => {
            window.App.state.currentUser = {
                uid: 'mock-user-id',
                email: 'test@example.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'mock-company-id',
                permissions: {
                    dashboard: true,
                    monitoramentoAereo: true,
                    relatorioMonitoramento: true
                }
            };
            window.App.state.companies = [{ id: 'mock-company-id', name: 'Mock Company', active: true, subscribedModules: ['monitoramentoAereo'] }];
            window.App.state.globalConfigs = { monitoramentoAereo: true };
            // Mock geoJsonData to ensure the map module initializes correctly and shows the button
            window.App.state.geoJsonData = { type: 'FeatureCollection', features: [] };
            window.App.ui.showAppScreen();
            window.App.ui.showTab('monitoramentoAereo');
        }""")

        # Wait for the map to be ready and the button to be visible
        page.wait_for_selector("#btnToggleRiskView", state="visible")

        page.click("#btnToggleRiskView")
        page.wait_for_timeout(2000)  # Wait for the risk view to be applied
        page.screenshot(path="jules-scratch/verification/verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
