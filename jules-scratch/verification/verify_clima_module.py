
from playwright.sync_api import sync_playwright, Page, expect
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:8000", wait_until="networkidle")

        # Wait for the App object to be initialized
        page.wait_for_function("() => window.App && window.App.state && window.App.ui")

        # Use evaluate to bypass UI login and render the app directly
        page.evaluate("""() => {
            const mockUser = {
                uid: 'mockUserId',
                email: 'test@gmail.com',
                username: 'testuser',
                role: 'admin',
                companyId: 'mockCompanyId',
                permissions: { dashboard: true, lancamentoClima: true, relatorioClima: true }
            };
            window.App.state.currentUser = mockUser;
            window.App.ui.showAppScreen();
        }""")

        # Wait for the dashboard to be visible as a sign of successful login bypass
        expect(page.locator("#dashboard")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/00_login_bypass.png")

        # Navigate to Lançamento Climatológico using internal function
        page.evaluate("() => window.App.ui.showTab('lancamentoClima')")
        expect(page.locator("#lancamentoClima")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/01_lancamento_clima_screen.png")

        # Fill the form
        # We can't select a farm as the data is not loaded in this mock state, but we can fill other fields.
        page.fill("#talhaoClima", "T-01")
        page.fill("#tempMaxClima", "32")
        page.fill("#tempMinClima", "18")
        page.fill("#umidadeRelativaClima", "65")
        page.fill("#pluviosidadeClima", "5")
        page.fill("#velocidadeVentoClima", "15")
        page.fill("#obsClima", "Teste de observação via Playwright")
        page.screenshot(path="jules-scratch/verification/02_lancamento_clima_filled.png")

        # Navigate to Dashboard Climatológico
        page.evaluate("() => window.App.ui.showTab('dashboard')")
        expect(page.locator("#dashboard-selector")).to_be_visible()
        page.click("#card-clima")
        expect(page.locator("#dashboard-clima")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/03_dashboard_clima.png")

        # Navigate to Relatório Climatológico
        page.evaluate("() => window.App.ui.showTab('relatorioClima')")
        expect(page.locator("#relatorioClima")).to_be_visible()
        page.screenshot(path="jules-scratch/verification/04_relatorio_clima.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
