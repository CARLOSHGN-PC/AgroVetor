import pytest
from playwright.sync_api import sync_playwright

def test_login_and_load_app():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        # Handle console logs and errors
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Page error: {exc}"))

        page.goto("http://localhost:8000")

        # Wait for the splash screen to be hidden first
        page.wait_for_selector("#splash-screen", state="hidden", timeout=10000)

        # Now, wait for the login screen to be ready
        page.wait_for_selector("#loginScreen", state="visible", timeout=10000)

        # Perform login
        page.fill("#loginUser", "test@gmail.com")
        page.fill("#loginPass", "123456")
        page.click("#btnLogin")

        # Wait for the app screen to be visible
        page.wait_for_selector("#appScreen", state="visible", timeout=20000)

        # A small delay to ensure rendering is complete before screenshot
        page.wait_for_timeout(1000)

        # Take a screenshot to verify the UI
        page.screenshot(path="jules-scratch/verify_login_fix.png")

        browser.close()
