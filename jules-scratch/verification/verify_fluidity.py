
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            page.goto("http://localhost:8000")

            # Use as credenciais de teste padrão
            page.fill("#loginUser", "test@gmail.com")
            page.fill("#loginPass", "123456")
            page.click("#btnLogin")

            # A principal verificação é se a tela do aplicativo aparece rapidamente
            app_screen = page.locator("#appScreen")
            expect(app_screen).to_be_visible(timeout=10000)

            # Uma pequena espera para garantir que os dados secundários comecem a carregar
            page.wait_for_timeout(2000)

            page.screenshot(path="jules-scratch/verification/verification.png")
            print("Screenshot taken successfully. App is responsive.")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            page.screenshot(path="jules-scratch/verification/verification-failure.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
