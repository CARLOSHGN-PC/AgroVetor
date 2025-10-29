
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("http://localhost:8000/docs/")

        # Log in
        await page.fill("#loginUser", "test@gmail.com")
        await page.fill("#loginPass", "123456")
        await page.click("#btnLogin")

        # Wait for the app to load
        await page.wait_for_selector("#appScreen", state="visible")

        # Go to the map page
        await page.click("#btnToggleMenu")
        await page.click("text=Monitoramento Aéreo")
        await page.wait_for_selector("#map", state="visible")

        # Go offline and reload
        await context.set_offline(True)
        await page.reload()

        # Wait for the map to load offline
        await page.wait_for_selector("#map", state="visible")

        # Take a screenshot
        await page.screenshot(path="jules-scratch/verification/offline-map.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
