
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 1. Navigate to the app
        page.goto("http://localhost:8000")

        # 2. Bypass Login (Mock App state)
        page.wait_for_function("window.App && window.App.state")

        # Set a mock user in App.state
        page.evaluate("""
            window.App.state.globalConfigs = { registroAplicacao: true };
            window.App.state.currentUser = {
                uid: 'test-user',
                email: 'test@example.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'test-company',
                permissions: { registroAplicacao: true }
            };
            window.App.state.companies = [{
                id: 'test-company',
                name: 'Test Company',
                subscribedModules: ['registroAplicacao']
            }];
            // Re-render menu after setting state
            window.App.ui.showAppScreen();
        """)

        # 3. Open the "Registro de Aplicação" tab
        # Wait for menu to be rendered
        page.wait_for_selector("#menu", state="attached")

        # Click the menu button to open sidebar
        page.click("#btnToggleMenu")

        # Click "Registro de Aplicação" to expand
        # Using a more robust selector
        page.wait_for_selector("button:has-text('Registro de Aplicação')")
        page.click("button:has-text('Registro de Aplicação')")

        # Click "Novo Registro"
        page.wait_for_selector("button:has-text('Novo Registro')")
        page.click("button:has-text('Novo Registro')")

        # 4. Verify UI Elements
        # Wait for the section to be visible
        page.wait_for_selector("#registroAplicacao", state="visible")

        # Check for specific inputs
        assert page.is_visible("#regAppFarmSelect")
        assert page.is_visible("#regAppDate")
        assert page.is_visible("#regAppProduct")
        assert page.is_visible("#regAppDosage")

        # Check Shift Radio Buttons
        assert page.is_visible("input[name='regAppShift'][value='A']")
        assert page.is_visible("input[name='regAppShift'][value='B']")
        assert page.is_visible("input[name='regAppShift'][value='C']")

        # Check Map Container
        assert page.is_visible("#regAppMap")

        # 5. Take Screenshot
        page.screenshot(path="verification/registro_aplicacao.png")
        print("Screenshot saved to verification/registro_aplicacao.png")

        browser.close()

if __name__ == "__main__":
    run()
