import asyncio
import json
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # 1. Navigate and bypass service worker/login
            await page.goto("http://localhost:8000/", wait_until="load")
            await page.evaluate("navigator.serviceWorker.getRegistrations().then(registrations => { for(let registration of registrations) { registration.unregister(); } })")
            await page.reload()
            await page.wait_for_function("() => window.App")

            # 2. Mock all necessary state for the menu to render
            all_permissions = await page.evaluate("() => App.config.menuConfig.flatMap(item => item.submenu ? item.submenu : [item]).map(item => item.permission).filter(p => p)")

            mock_user = {
                "uid": "mock-uid",
                "companyId": "mock-company-id",
                "role": "admin",
                "permissions": {p: True for p in all_permissions}
            }
            mock_company = {
                "id": "mock-company-id",
                "name": "Mock Company",
                "subscribedModules": all_permissions
            }
            mock_global_configs = {p: True for p in all_permissions}

            # Convert Python dicts to JSON strings
            mock_user_json = json.dumps(mock_user)
            mock_company_json = json.dumps(mock_company)
            mock_global_configs_json = json.dumps(mock_global_configs)

            # Inject the mock state using the JSON strings
            await page.evaluate(f"window.App.state.currentUser = JSON.parse('{mock_user_json}')")
            await page.evaluate(f"window.App.state.companies = [JSON.parse('{mock_company_json}')]")
            await page.evaluate(f"window.App.state.globalConfigs = JSON.parse('{mock_global_configs_json}')")

            # 3. Render the app UI with the mocked state
            await page.evaluate("() => App.ui.showAppScreen()")

            # Force hide any lingering loading screens
            await page.evaluate("() => { document.getElementById('splash-screen').style.display = 'none'; }")
            await page.evaluate("() => { document.getElementById('loading-overlay').style.display = 'none'; }")
            await page.evaluate("() => { document.getElementById('appScreen').classList.remove('hidden'); }")

            # 4. Navigate to the map tab
            await page.locator("#btnToggleMenu").click()
            await page.get_by_role("button", name="Monitoramento Aéreo").click()

            await expect(page.locator("#map")).to_be_visible(timeout=15000)

            # 5. Perform the search
            map_search_btn = page.locator("#map-farm-search-btn")
            map_search_input = page.locator("#map-farm-search-input")

            await map_search_btn.click()
            await expect(map_search_input).to_be_visible()

            await map_search_input.fill("USINA")
            await map_search_btn.click()

            await page.wait_for_timeout(3000)

            # 6. Take a screenshot
            await page.screenshot(path="jules-scratch/verification/verification.png")
            print("Screenshot taken successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            await browser.close()

asyncio.run(main())