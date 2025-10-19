
from playwright.sync_api import sync_playwright
import datetime

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto("http://localhost:8000")

        # Wait for the splash screen to disappear
        page.wait_for_timeout(3000)

        # --- MOCKED DATA SETUP ---
        today = datetime.datetime.now()
        yesterday = today - datetime.timedelta(days=1)

        # Mock user session, permissions, and complex state to simulate the test case
        page.evaluate(f"""() => {{
            const today_iso = "{today.isoformat()}";
            const yesterday_iso = "{yesterday.isoformat()}";

            window.App.state.currentUser = {{
                uid: 'test-uid',
                email: 'test@example.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'test-company-id',
                permissions: {{ dashboard: true, monitoramentoAereo: true }}
            }};
            window.App.state.companies = [{{
                id: 'test-company-id',
                subscribedModules: ['monitoramentoAereo']
            }}];
            window.App.state.globalConfigs = {{
                monitoramentoAereo: true
            }};

            // 1. Mock Farm Data
            window.App.state.fazendas = [
                {{ id: 'farm-1', name: 'FAZENDA TESTE', code: '9999' }}
            ];

            // 2. Mock GeoJSON data for the farm plot to be highlighted
            window.App.state.geoJsonData = {{
                "type": "FeatureCollection",
                "features": [
                    {{
                        "type": "Feature",
                        "id": 1,
                        "properties": {{ "NM_IMOVEL": "FAZENDA TESTE" }},
                        "geometry": {{
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-48.45, -21.17],
                                    [-48.44, -21.17],
                                    [-48.44, -21.16],
                                    [-48.45, -21.16],
                                    [-48.45, -21.17]
                                ]
                            ]
                        }}
                    }}
                ]
            }};

            // 3. Mock Trap data to create the specific risk scenario
            window.App.state.armadilhas = [
                // Trap that was collected with high count
                {{
                    id: 'trap-collected',
                    status: 'Coletada',
                    fazendaNome: 'FAZENDA TESTE',
                    talhaoNome: 'T-01',
                    dataInstalacao: yesterday_iso,
                    dataColeta: today_iso,
                    contagemMariposas: 10 // High count
                }},
                // The most recently installed active trap
                {{
                    id: 'trap-active',
                    status: 'Ativa',
                    fazendaNome: 'FAZENDA TESTE',
                    talhaoNome: 'T-02',
                    dataInstalacao: today_iso,
                    latitude: -21.165,
                    longitude: -48.445
                }}
            ];

            window.App.ui.showAppScreen();
        }}""")

        # 1. Click the main menu toggle button to open the side navigation
        page.locator("#btnToggleMenu").click()

        # 2. Wait for the "Monitoramento Aéreo" button to become visible and click it
        page.get_by_role("button", name="Monitoramento Aéreo").click()

        # 3. Wait for the risk view button to be visible
        page.wait_for_selector("#btnToggleRiskView", state="visible", timeout=15000)

        # 4. Click the risk view button
        page.locator("#btnToggleRiskView").click()

        # 5. Add a delay for the map state to update and render visually
        page.wait_for_timeout(1000)

        # 6. Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
