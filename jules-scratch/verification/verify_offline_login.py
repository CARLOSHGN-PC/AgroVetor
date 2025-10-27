
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a clean context
        context = await browser.new_context(
            java_script_enabled=True,
            extra_http_headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
        page = await context.new_page()

        try:
            # Go to the page
            await page.goto("http://localhost:8000", wait_until="networkidle")

            # Wait for the App object to be initialized
            await page.wait_for_function("() => window.App && window.App.ui")

            # Directly trigger the offline UI logic
            await page.evaluate("() => { window.App.ui.showOfflineUserSelection(); }")

            # Expect the offline login screen to be visible
            offline_form = page.locator("#offlineUserSelection")
            await expect(offline_form).to_be_visible()

            # Expect the email input to be present
            email_input = page.locator("#offlineEmail")
            await expect(email_input).to_be_visible()

            # Take a screenshot
            await page.screenshot(path="jules-scratch/verification/offline_login_verification.png")
            print("Screenshot taken successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            # Save a screenshot on error for debugging
            await page.screenshot(path="jules-scratch/verification/error_screenshot.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
