
import asyncio
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Log console messages
    page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))

    page.goto("http://localhost:8000")

    # Mock successful login and navigate to the map tab
    page.evaluate("""() => {
        window.App.state.currentUser = {
            uid: 'test-uid',
            email: 'test@example.com',
            username: 'Test User',
            role: 'admin',
            companyId: 'test-company-id',
            permissions: { dashboard: true, monitoramentoAereo: true }
        };
        window.App.state.companies = [{ id: 'test-company-id', subscribedModules: ['dashboard', 'monitoramentoAereo'] }];
        window.App.ui.showAppScreen();
        window.App.ui.showTab('monitoramentoAereo');
    }""")

    # Wait for the map to initialize to ensure the app is ready
    page.wait_for_selector("#map")

    # Activate the risk view
    page.locator("#btnToggleRiskView").click()

    # Wait for the risk view to be applied (e.g., by checking for a class or style change)
    expect(page.locator("#btnToggleRiskView")).to_have_class("map-control-btn active")

    page.screenshot(path="jules-scratch/verification/risk_view_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
