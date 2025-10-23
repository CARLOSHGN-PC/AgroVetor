
from playwright.sync_api import sync_playwright, TimeoutError
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Disable cache to ensure we're testing the latest code
        context = browser.new_context(extra_http_headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        page = context.new_page()

        try:
            page.goto("http://localhost:8000", wait_until="domcontentloaded")

            # Wait for the App object to be initialized
            page.wait_for_function("!!window.App && !!window.App.ui && !!window.App.state", timeout=15000)

            # Use evaluate to bypass login and navigate directly
            page.evaluate("""() => {
                // Mock user session
                window.App.state.currentUser = {
                    uid: 'mock-uid',
                    email: 'test@gmail.com',
                    companyId: 'mock-company-id'
                };

                // Bypass login screen and show the main app
                App.ui.showAppScreen();

                // Directly show the reports tab
                App.ui.showTab('relatorios');

                // Show the specific report screen
                const reportsContainer = document.querySelector('#reports');
                const reportScreens = reportsContainer.querySelectorAll('.report-screen');
                reportScreens.forEach(screen => screen.classList.add('hidden'));
                const targetScreen = document.querySelector('#relatorioClassificacao');
                if (targetScreen) {
                    targetScreen.classList.remove('hidden');
                }
            }""")

            # Wait for the report section to be visible and stable
            page.wait_for_selector("#relatorioClassificacao:not(.hidden)", state="visible", timeout=10000)

            # Give it a moment to render fully before screenshot
            time.sleep(1)

            # Take a screenshot
            page.screenshot(path="jules-scratch/verification/verification.png")

            print("Screenshot taken successfully.")

        except TimeoutError as e:
            print(f"A timeout error occurred: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")

        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")

        finally:
            browser.close()

if __name__ == "__main__":
    run()
