import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a context with caching disabled to ensure the latest code is tested.
        context = await browser.new_context(
            extra_http_headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
        page = await context.new_page()

        try:
            # Navigate to the local server
            await page.goto("http://localhost:8000", timeout=60000)

            # Wait for the splash screen to disappear before doing anything else
            await page.wait_for_selector("#splash-screen", state="hidden", timeout=30000)

            # Wait for the login form to be visible
            await page.wait_for_selector("#loginUser", state="visible", timeout=30000)

            # Fill in the login credentials
            await page.fill("#loginUser", "test@gmail.com")
            await page.fill("#loginPass", "123456")

            # Click the login button
            await page.click("#btnLogin")

            # Wait for the main app screen to be visible
            await page.wait_for_selector("#appScreen", state="visible", timeout=30000)

            # Use page.evaluate to click the dashboard card for the new module
            await page.evaluate("() => document.querySelector('#card-clima').click()")

            # Wait for the dashboard to be visible
            await page.wait_for_selector("#dashboard-clima", state="visible", timeout=30000)

            # Take a screenshot of the new dashboard
            screenshot_path = "jules-scratch/verification/clima_dashboard_screenshot.png"
            await page.screenshot(path=screenshot_path)

            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            # Save a screenshot on error for debugging
            await page.screenshot(path="jules-scratch/verification/error_screenshot.png")
            raise

        finally:
            await browser.close()

if __name__ == "__main__":
    # Ensure the verification directory exists
    os.makedirs("jules-scratch/verification", exist_ok=True)
    asyncio.run(main())
