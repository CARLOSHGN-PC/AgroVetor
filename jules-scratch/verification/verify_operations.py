import os
from playwright.sync_api import sync_playwright, expect

def run_verification(page):
    # Navigate to the local HTML file using a hardcoded absolute path
    page.goto('file:///app/frontend/index.html')

    # Wait for the App object to be exposed on the window object.
    # This is the most reliable way to know the app is initialized.
    page.wait_for_function('() => window.App !== undefined', timeout=15000)

    # --- Login Bypass ---
    # Inject JavaScript to bypass the login process.
    page.evaluate("""() => {
        App.state.currentUser = {
            uid: 'mock-admin-uid',
            email: 'admin@test.com',
            username: 'Admin',
            role: 'admin',
            permissions: App.config.roles.admin,
            active: true
        };
        App.ui.showAppScreen();
    }""")

    # Now, wait for the app screen to be visible after the bypass
    expect(page.locator("#appScreen")).to_be_visible(timeout=10000)
    expect(page.locator("#loading-overlay")).to_be_hidden()


    # --- Verification Steps ---

    # Open the main menu to ensure buttons are visible
    menu_toggle = page.locator("#btnToggleMenu")
    if menu_toggle.is_visible():
        menu_toggle.click()

    expect(page.locator("#menu")).to_be_visible()

    # Click on the "Operações" menu
    page.get_by_role("button", name="Operações").click()

    # Wait for the operations tab to be visible
    operations_tab = page.locator("#operacoes")
    expect(operations_tab).to_be_visible()

    # Wait for the "Fazenda" dropdown to be populated from the mock API
    farm_select = page.locator("#opFazenda")
    expect(farm_select.locator("option >> nth=1")).to_have_text("Fazenda Santa Maria", timeout=10000)

    # Select the first farm
    farm_select.select_option(label="Fazenda Santa Maria")

    # Wait for the "Talhão" dropdown to be populated
    plot_select = page.locator("#opTalhao")
    expect(plot_select.locator("option >> nth=1")).to_have_text("Talhão 01")

    # Select the first plot
    plot_select.select_option(label="Talhão 01")

    # Check that the area display is updated
    area_display = page.locator("#opAreaDisplay")
    expect(area_display).to_have_text("Área (ha): 15.50")

    # Fill in the dosage
    dosage_input = page.locator("#opDosagem")
    dosage_input.fill("2.5")

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/operations_screen.png")
    print("Screenshot saved to jules-scratch/verification/operations_screen.png")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    run_verification(page)
    browser.close()
