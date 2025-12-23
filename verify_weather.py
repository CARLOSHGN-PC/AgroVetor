from playwright.sync_api import sync_playwright, expect
import time

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(permissions=['geolocation', 'clipboard-read', 'clipboard-write'])
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:8000")

        # Bypass Login
        print("Bypassing login via state injection...")
        page.wait_for_function("window.App && window.App.state")
        page.evaluate("""
            window.App.state.currentUser = {
                uid: 'test_user',
                email: 'test@example.com',
                role: 'admin',
                companyId: 'test_company',
                permissions: { configuracoes: true }
            };
            window.App.state.companies = [{id: 'test_company', name: 'Test Company', subscribedModules: ['configuracoes']}];
            window.App.state.globalConfigs = { configuracoes: true };
            window.App.ui.showAppScreen();
        """)

        print("Forcing navigation to Configuracoes Empresa...")
        # Force the tab to be visible by removing the 'hidden' attribute directly if showTab fails or animates too slowly
        page.evaluate("""
            App.ui.showTab('configuracoesEmpresa');
            // Force visibility just in case
            document.getElementById('configuracoesEmpresa').hidden = false;
            document.getElementById('configuracoesEmpresa').classList.add('active');
        """)

        # Wait a bit for transition
        time.sleep(1)

        screenshot_path = "verification_weather.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
