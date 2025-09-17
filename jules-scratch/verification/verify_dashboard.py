from playwright.sync_api import sync_playwright, expect
import os

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    page.goto('http://localhost:8080')

    # Set a local storage item to bypass login for verification
    page.evaluate("() => { localStorage.setItem('jules_verification_mode', 'true'); }")

    # Reload the page for the local storage item to take effect
    page.reload()

    # Wait for the app screen to be visible, which indicates the app has initialized
    expect(page.locator("#appScreen")).to_be_visible(timeout=10000)

    # Add a small delay to allow for data to be loaded and charts to be rendered
    page.wait_for_timeout(2000)

    # Wait for the main content to be visible
    expect(page.locator("#dashboard.tab-content.active")).to_be_visible()

    # --- Broca Dashboard Verification ---
    print("Verifying 'Broca' dashboard...")
    # Wait for the Broca tab button to be visible and have the 'active' class
    expect(page.locator("#btn-dash-broca")).to_be_visible()
    expect(page.locator("#btn-dash-broca")).to_have_class("dashboard-tab-btn active")

    # Wait for a chart to be rendered
    page.wait_for_selector("#graficoTop10FazendasBroca")

    # Take a screenshot of the Broca dashboard
    page.screenshot(path="jules-scratch/verification/01_broca_dashboard.png")
    print("Screenshot for 'Broca' dashboard taken.")

    # --- Perdas Dashboard Verification ---
    print("Verifying 'Perdas' dashboard...")
    # Click the "Perdas" tab
    page.locator("#btn-dash-perda").click()

    # Wait for the Perdas view to be visible
    expect(page.locator("#dashboard-perda")).to_be_visible()
    expect(page.locator("#btn-dash-perda")).to_have_class("dashboard-tab-btn active")

    # Wait for a chart to be rendered
    page.wait_for_selector("#graficoPerdaPorFrenteTurno")

    # Take a screenshot of the Perdas dashboard
    page.screenshot(path="jules-scratch/verification/02_perdas_dashboard.png")
    print("Screenshot for 'Perdas' dashboard taken.")

    # --- Aérea Dashboard Verification ---
    print("Verifying 'Aplicação Aérea' dashboard...")
    # Click the "Aplicação Aérea" tab
    page.locator("#btn-dash-aerea").click()

    # Wait for the Aerea view to be visible
    expect(page.locator("#dashboard-aerea")).to_be_visible()
    expect(page.locator("#btn-dash-aerea")).to_have_class("dashboard-tab-btn active")

    # Take a screenshot of the Aerea dashboard
    page.screenshot(path="jules-scratch/verification/03_aerea_dashboard.png")
    print("Screenshot for 'Aplicação Aérea' dashboard taken.")

    browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)

print("Verification script finished successfully.")
