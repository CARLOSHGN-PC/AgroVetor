import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            extra_http_headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
        page = await context.new_page()

        try:
            await page.goto("http://localhost:8000")

            # Wait for the App object to be initialized
            await page.wait_for_function("() => window.App && window.App.state")

            # Use page.evaluate to log in, set state, and show the dashboard
            await page.evaluate("""() => {
                // Mock login
                window.App.state.currentUser = {
                    uid: 'test-uid',
                    email: 'test@gmail.com',
                    username: 'Test User',
                    role: 'admin',
                    companyId: 'test-company-id',
                    permissions: window.App.config.roles.admin
                };
                window.App.state.companies = [{id: 'test-company-id', name: 'Test Company', subscribedModules: Object.keys(window.App.config.roles.admin) }]

                // Mock some climatological data directly into the state
                window.App.state.clima = [
                    { data: '2025-10-20', fazendaId: '1', fazendaNome: 'Fazenda Alpha', talhaoNome: 'T-01', tempMax: 30, tempMin: 15, umidade: 70, pluviosidade: 5, vento: 12, companyId: 'test-company-id' },
                    { data: '2025-10-21', fazendaId: '1', fazendaNome: 'Fazenda Alpha', talhaoNome: 'T-02', tempMax: 32, tempMin: 16, umidade: 65, pluviosidade: 0, vento: 20, companyId: 'test-company-id' },
                    { data: '2025-10-22', fazendaId: '2', fazendaNome: 'Fazenda Beta', talhaoNome: 'B-05', tempMax: 28, tempMin: 14, umidade: 80, pluviosidade: 15, vento: 10, companyId: 'test-company-id' },
                    { data: '2025-10-23', fazendaId: '1', fazendaNome: 'Fazenda Alpha', talhaoNome: 'T-01', tempMax: 31, tempMin: 17, umidade: 60, pluviosidade: 2, vento: 25, companyId: 'test-company-id' },
                ];

                // Mock fazendas for the filter dropdown
                window.App.state.fazendas = [
                    { id: '1', code: 'F01', name: 'Fazenda Alpha', companyId: 'test-company-id', talhoes: [{id: 1, name: 'T-01'}] },
                    { id: '2', code: 'F02', name: 'Fazenda Beta', companyId: 'test-company-id', talhoes: [{id: 2, name: 'B-05'}] }
                ];

                // Show the app screen and then the correct tab
                window.App.ui.showAppScreen();
                window.App.ui.showTab('dashboardClima');
            }""")

            # Wait for the charts to be rendered.
            await page.wait_for_selector("#graficoVariacaoTemperatura", state="visible")
            await asyncio.sleep(2) # Give it a bit more time for animations

            await page.screenshot(path="jules-scratch/verification/clima_dashboard_with_data.png")
            print("Screenshot of the climatological dashboard with data has been taken.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
