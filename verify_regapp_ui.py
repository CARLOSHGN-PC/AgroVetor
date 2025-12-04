import time
from playwright.sync_api import sync_playwright

def verify_regapp_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Navigate to the app
        page.goto("http://localhost:8000")

        # Wait for App to be ready
        page.wait_for_function("window.App && window.App.state")

        # Mock Data
        page.evaluate("""() => {
            App.state.currentUser = {
                uid: 'test_user_123',
                email: 'test@example.com',
                companyId: 'company_123',
                role: 'admin',
                permissions: { registroAplicacao: true },
                active: true
            };

            App.state.companies = [{
                id: 'company_123',
                name: 'Test Company',
                subscribedModules: ['registroAplicacao']
            }];

            App.state.fazendas = [{
                id: 'farm_1',
                code: '100',
                name: 'Fazenda Teste',
                talhoes: [
                    { id: 't1', name: 'T-01', area: 50.0 },
                    { id: 't2', name: 'T-02', area: 30.0 }
                ],
                companyId: 'company_123'
            }];

            // Trigger render to update menu
            App.ui.renderMenu();
        }""")

        # Navigate to Registro de Aplicação
        page.evaluate("App.ui.showTab('registroAplicacao')")
        time.sleep(1)

        # Select a farm to populate the plot list
        page.select_option("#regAppFarmSelect", "farm_1")
        time.sleep(1)

        # Click the first plot checkbox to reveal partial options
        page.click("#regapp-plot-t1")
        time.sleep(0.5)

        # Click the 'Partial Application' checkbox
        page.click("#regapp-details-t1 .partial-check")
        time.sleep(0.5)

        # Take a screenshot
        page.screenshot(path="regapp_verification.png")
        print("Screenshot saved to regapp_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_regapp_ui()
