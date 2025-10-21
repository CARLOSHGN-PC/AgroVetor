
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:8000")

        # Mock login and show app screen
        await page.evaluate("""() => {
            window.App.state.currentUser = {
                uid: 'test-user',
                companyId: 'test-company',
                role: 'admin',
                permissions: {
                    dashboard: true,
                    apontamentoPlantio: true
                }
            };
            window.App.state.companies = [{id: 'test-company', subscribedModules: ['dashboard', 'apontamentoPlantio'] }];
            window.App.state.globalConfigs = { dashboard: true, apontamentoPlantio: true };
            window.App.ui.showAppScreen();
        }""")

        # Wait for the dashboard selector to be visible
        await page.wait_for_selector("#dashboard-selector", state="visible")
        await page.wait_for_load_state("networkidle")


        # Navigate to Plantio Dashboard
        await page.click("#card-plantio")
        await page.wait_for_selector("#dashboard-plantio", state="visible")

        # Take screenshot
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
