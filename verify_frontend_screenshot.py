from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        # Take screenshot of login screen to verify absence of offline mode UI
        page.wait_for_selector("#loginForm")
        page.screenshot(path="screenshots/frontend_verification.png")
        print("Screenshot taken at screenshots/frontend_verification.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
