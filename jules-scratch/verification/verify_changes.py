import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # 1. Go to the app
            await page.goto("http://localhost:8001")

            # Wait for the App object to be available on the window
            await page.wait_for_function("window.App")

            # 2. Inject user profile and company data to bypass login
            user_profile = {
                "uid": "test-user-id",
                "email": "test@example.com",
                "username": "Test User",
                "role": "admin",
                "active": True,
                "companyId": "test-company-id",
                "permissions": {
                    "dashboard": True, "monitoramentoAereo": True, "relatorioMonitoramento": True,
                    "planejamentoColheita": True, "planejamento": True, "lancamentoBroca": True,
                    "lancamentoPerda": True, "lancamentoCigarrinha": True, "relatorioBroca": True,
                    "relatorioPerda": True, "relatorioCigarrinha": True, "lancamentoCigarrinhaAmostragem": True,
                    "relatorioCigarrinhaAmostragem": True, "excluir": True, "gerenciarUsuarios": True,
                    "configuracoes": True, "cadastrarPessoas": True, "syncHistory": True
                }
            }

            company_data = {
                "id": "test-company-id",
                "name": "Test Company",
                "active": True,
                "subscribedModules": list(user_profile["permissions"].keys())
            }

            # Correctly pass Python objects to page.evaluate
            await page.evaluate("""(args) => {
                const [user, company] = args;
                localStorage.setItem('localUserProfiles', JSON.stringify([user]));
                window.App.state.currentUser = user;
                window.App.state.companies = [company];
            }""", [user_profile, company_data])

            # Show the main app screen
            await page.evaluate("window.App.ui.showAppScreen()")

            # 3. Navigate to Aerial Monitoring
            await page.get_by_label("Abrir menu").click()
            await page.get_by_role("button", name="Monitoramento Aéreo").click()

            # 4. Verify Loading Spinner
            map_container = page.locator("#map-container")
            await expect(map_container).not_to_have_class("loading", timeout=20000)
            print("Map loaded and spinner disappeared.")

            await page.screenshot(path="jules-scratch/verification/01_map_loaded.png")
            print("Screenshot 1: Map loaded.")

            # 5. Test Farm Search by injecting mock data
            await page.evaluate("""() => {
                window.App.state.fazendas = [{
                    id: 'farm-1', code: '123', name: 'FAZENDA TESTE', talhoes: []
                }];
                window.App.state.geoJsonData = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        id: 1,
                        geometry: { type: 'Polygon', coordinates: [[[-48, -21], [-49, -21], [-49, -22], [-48, -22], [-48, -21]]] },
                        properties: { CD_FAZENDA: '123', NM_IMOVEL: 'FAZENDA TESTE' }
                    }]
                };
                window.App.mapModule.loadShapesOnMap();
            }""")

            await page.locator("#map-farm-search-input").fill("Fazenda Teste")
            await page.locator("#map-farm-search-btn").click()
            await page.wait_for_timeout(2000) # Wait for pan

            await page.screenshot(path="jules-scratch/verification/02_farm_search.png")
            print("Screenshot 2: Farm search executed.")

            # 6. Test Trap Selection by injecting a mock trap
            await page.evaluate("""() => {
                const trap = {
                    id: 'trap-1',
                    latitude: -21.5,
                    longitude: -48.5,
                    dataInstalacao: new Date(),
                    status: 'Ativa',
                    talhaoNome: 'T-01'
                };
                // Mock toDate() for marker creation
                trap.dataInstalacao.toDate = function() { return this; };
                window.App.state.armadilhas = [trap];
                window.App.mapModule.addOrUpdateTrapMarker(trap);
            }""")

            trap_marker = page.locator(".mapbox-marker").first
            await expect(trap_marker).to_be_visible(timeout=10000)
            await trap_marker.click()

            trap_info_box = page.locator("#trap-info-box")
            plot_info_box = page.locator("#talhao-info-box")

            await expect(trap_info_box).to_be_visible()
            await expect(plot_info_box).not_to_be_visible()
            print("Trap info box is visible and plot info box is hidden, as expected.")

            await page.screenshot(path="jules-scratch/verification/03_trap_selection.png")
            print("Screenshot 3: Trap selection verified.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())