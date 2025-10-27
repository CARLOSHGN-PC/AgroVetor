
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(extra_http_headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        page = await context.new_page()

        await page.goto("http://localhost:8000/index.html")

        # Wait for the App object to be initialized
        await page.wait_for_function("() => window.App && window.App.state")


        # Bypass login and navigation by directly manipulating app state
        await page.evaluate("""() => {
            const mockUser = {
                uid: 'mock-uid',
                email: 'test@gmail.com',
                username: 'test',
                role: 'admin',
                permissions: { dashboard: true, configuracoes: true, gerenciarEmpresas: true, superAdmin: true },
                companyId: 'mock-company-id'
            };
            window.App.state.currentUser = mockUser;
            window.App.ui.showAppScreen();
        }""")

        # Wait for a known element on the dashboard to ensure the view is rendered
        await page.wait_for_selector("#dashboard-selector", state="visible")

        # Now, directly show the settings tab
        await page.evaluate("() => window.App.ui.showTab('configuracoesEmpresa')")

        # Click the button to open the modal
        await page.click("#btnEnableOfflineLogin")

        # Wait for the modal to be visible
        await page.wait_for_selector("#enableOfflineLoginModal", state="visible")

        # Take a screenshot of the modal
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
