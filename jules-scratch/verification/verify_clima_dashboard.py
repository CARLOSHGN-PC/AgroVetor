
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(extra_http_headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        page = await context.new_page()

        await page.goto("http://localhost:8000")

        # Wait for the main App object to be ready
        await page.wait_for_function("window.App && window.App.ui && window.App.ui.showAppScreen")

        # Bypass UI login and navigation by directly manipulating the app's state
        await page.evaluate("""() => {
            const user = {
                uid: 'mock-user-id',
                email: 'test@gmail.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'mock-company-id',
                active: true,
                permissions: App.config.roles.admin
            };
            App.state.currentUser = user;
            App.state.companies = [{ id: 'mock-company-id', name: 'Mock Company', subscribedModules: Object.keys(App.config.roles.admin) }];
            App.ui.showAppScreen();
        }""")

        # Wait for the main dashboard selector to ensure the app screen is rendered
        await expect(page.locator("#dashboard-selector")).to_be_visible()

        # Directly show the climatological dashboard view
        await page.evaluate("() => App.ui.showDashboardView('clima')")

        # Wait for the specific dashboard to be visible and take a screenshot
        await expect(page.locator("#dashboard-clima")).to_be_visible()

        # Add a small delay for charts to animate
        await page.wait_for_timeout(1000)

        await page.screenshot(path="jules-scratch/verification/clima_dashboard.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
