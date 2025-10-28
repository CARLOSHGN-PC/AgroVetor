
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        # Login
        await page.goto("http://localhost:8000")
        await page.fill("#loginUser", "test@gmail.com")
        await page.fill("#loginPass", "123456")
        await page.click("#btnLogin")

        # Wait for app to load
        await page.wait_for_function("window.App && App.state.currentUser")

        # Navigate to Dashboard Climatológico
        await page.evaluate("App.ui.showTab('dashboardClima')")
        await page.wait_for_selector("#dashboard-clima", state="visible")

        # Take a screenshot of the charts
        await page.screenshot(path="jules-scratch/verification/clima_charts.png")

        # Simulate offline and reload
        await context.set_offline(True)
        await page.reload()

        # Take a screenshot of the offline login screen
        await page.wait_for_selector("#offlineUserSelection", state="visible")
        await page.screenshot(path="jules-scratch/verification/offline_login.png")

        await browser.close()

asyncio.run(main())
