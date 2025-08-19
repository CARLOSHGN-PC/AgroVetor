from playwright.sync_api import sync_playwright, expect
import os

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Navigate to the local server
        page.goto("http://localhost:8000/index.html", wait_until="networkidle")

        # A reliable way to know the app is ready is to wait for a key element.
        # Let's wait for the login button to be visible, which indicates the app has initialized.
        expect(page.locator('#btnLogin')).to_be_visible(timeout=15000)

        # --- Verification 1: Service Order Layout ---

        # Manually show the service order screen
        page.evaluate("App.ui.showTab('gestaoPulverizacao')")

        # Wait for the service order container to be visible
        expect(page.locator('#gestaoPulverizacao')).to_be_visible(timeout=10000)

        # Take a screenshot of the Service Order screen
        page.screenshot(path='jules-scratch/verification/service_order_layout.png')
        print("Screenshot of Service Order layout taken.")

        # --- Verification 2: Standardized Form Fields ---

        # Manually show the "Cadastros" screen
        page.evaluate("App.ui.showTab('cadastros')")

        # Wait for the registration container to be visible
        expect(page.locator('#cadastros')).to_be_visible(timeout=5000)

        # Take a screenshot of the Cadastros screen
        page.screenshot(path='jules-scratch/verification/standard_forms.png')
        print("Screenshot of Standardized Forms taken.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path='jules-scratch/verification/error.png')

    finally:
        browser.close()

if __name__ == '__main__':
    with sync_playwright() as playwright:
        run_verification(playwright)
