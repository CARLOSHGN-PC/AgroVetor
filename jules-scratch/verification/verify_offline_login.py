
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("http://localhost:8000")
        await context.set_offline(True)
        # This second goto should be intercepted by the service worker
        await page.goto("http://localhost:8000", wait_until="networkidle")


        # Wait for the offline login form to be visible
        await page.wait_for_selector("#offlineUserSelection", state="visible", timeout=60000)

        # Take a screenshot of the offline login screen
        await page.screenshot(path="jules-scratch/verification/offline_login_verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
