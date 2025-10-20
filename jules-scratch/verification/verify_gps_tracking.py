
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("http://localhost:8000")
        await page.reload()

        # Bypass login
        await page.evaluate('''() => {
            window.App.state.currentUser = {
                "uid": "mock-uid",
                "email": "test@gmail.com",
                "username": "test",
                "role": "admin",
                "companyId": "mock-company-id",
                "permissions": {
                    "dashboard": true,
                    "monitoramentoAereo": true
                }
            };
            window.App.ui.showAppScreen();
        }''')
        await page.wait_for_selector("#appScreen", state="visible")

        # Go to map
        await page.evaluate("() => App.ui.showTab('monitoramentoAereo')")
        await page.wait_for_selector("#btnToggleTracking", state="visible")

        # Start tracking
        await page.click("#btnToggleTracking")

        # Simulate movement
        await context.set_geolocation({"latitude": -21.17, "longitude": -48.45})
        await asyncio.sleep(1)
        await context.set_geolocation({"latitude": -21.171, "longitude": -48.451})
        await asyncio.sleep(1)
        await context.set_geolocation({"latitude": -21.172, "longitude": -48.452})
        await asyncio.sleep(1)


        # Take screenshot
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

asyncio.run(main())
