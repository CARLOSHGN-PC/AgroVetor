
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto("http://localhost:8000")

        # Wait for the splash screen to disappear
        page.wait_for_timeout(3000)

        # Mock user session, permissions, and importantly, the geoJsonData to make the map controls appear
        page.evaluate("""() => {
            window.App.state.currentUser = {
                uid: 'test-uid',
                email: 'test@example.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'test-company-id',
                permissions: { dashboard: true, monitoramentoAereo: true }
            };
            window.App.state.companies = [{
                id: 'test-company-id',
                subscribedModules: ['monitoramentoAereo']
            }];
            window.App.state.globalConfigs = {
                monitoramentoAereo: true
            };
            // Simulate that map data is loaded, which triggers the button to become visible
            window.App.state.geoJsonData = { "type": "FeatureCollection", "features": [] };
            window.App.ui.showAppScreen();
        }""")

        # 1. Click the main menu toggle button to open the side navigation
        page.locator("#btnToggleMenu").click()

        # 2. Wait for the "Monitoramento Aéreo" button to become visible
        page.wait_for_selector("text=Monitoramento Aéreo")

        # 3. Click the "Monitoramento Aéreo" button
        page.get_by_role("button", name="Monitoramento Aéreo").click()

        # 4. Wait for the risk view button to be visible
        page.wait_for_selector("#btnToggleRiskView", state="visible", timeout=15000)

        # 5. Click the risk view button
        page.locator("#btnToggleRiskView").click()

        # 6. Add a small delay for the map state to update visually
        page.wait_for_timeout(500)

        # 7. Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
