import json
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Listen for console messages to debug initialization issues
    page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))

    # Go to the app
    page.goto("http://localhost:8000")

    # Wait for the main App object to be initialized on the window
    page.wait_for_function("() => window.App", timeout=15000)

    # Mock user state to log in
    user_profile = {
        "uid": "test-user-id",
        "username": "testuser",
        "email": "test@example.com",
        "role": "admin",
        "active": True,
        "companyId": "test-company",
        "permissions": {
            "dashboard": True,
            "monitoramentoAereo": True,
            "relatorioMonitoramento": True,
            "planejamentoColheita": True,
            "planejamento": True,
            "lancamentoBroca": True,
            "lancamentoPerda": True,
            "lancamentoCigarrinha": True,
            "relatorioBroca": True,
            "relatorioPerda": True,
            "relatorioCigarrinha": True,
            "lancamentoCigarrinhaPonto": True,
            "relatorioCigarrinhaPonto": True,
            "lancamentoCigarrinhaAmostragem": True,
            "relatorioCigarrinhaAmostragem": True,
            "excluir": True,
            "gerenciarUsuarios": True,
            "configuracoes": True,
            "cadastrarPessoas": True,
            "syncHistory": True,
            "frenteDePlantio": True,
            "apontamentoPlantio": True,
            "relatorioPlantio": True,
            "gerenciarLancamentos": True
        }
    }

    # Mock trap data
    trap_data = [{
        "id": "trap1",
        "latitude": -21.17,
        "longitude": -48.45,
        "dataInstalacao": "2024-07-20T12:00:00.000Z",
        "status": "Ativa",
        "fazendaNome": "Fazenda Teste",
        "talhaoNome": "Talhão 1",
        "companyId": "test-company"
    }]

    # Mock GeoJSON data
    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": { "FUNDO_AGR": "FUNDO_TESTE", "NM_IMOVEL": "FAZENDA TESTE", "CD_TALHAO": "TALHAO-01" },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-48.455, -21.175],
                            [-48.445, -21.175],
                            [-48.445, -21.165],
                            [-48.455, -21.165],
                            [-48.455, -21.175]
                        ]
                    ]
                }
            }
        ]
    }

    # Inject the mocked data by passing it as an argument to evaluate
    page.evaluate("""
        (args) => {
            window.App.state.currentUser = args.userProfile;
            window.App.state.armadilhas = args.trapData;
            window.App.state.geoJsonData = args.geojson;
            window.App.state.companies = [{ id: 'test-company', name: 'Test Company', subscribedModules: ['monitoramentoAereo'] }];
            window.App.state.globalConfigs = { monitoramentoAereo: true };

            const el = document.createElement('div');
            el.style.backgroundColor = '#4285F4';
            el.style.width = '16px';
            el.style.height = '16px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid #ffffff';
            window.App.state.mapboxUserMarker = {
                _lngLat: { lng: -48.45, lat: -21.17 },
                getElement: () => el,
                getLngLat: () => ({ lng: -48.45, lat: -21.17 })
            };

            localStorage.setItem('localUserProfiles', JSON.stringify([args.userProfile]));

            Object.defineProperty(navigator, 'onLine', {
                get: () => false
            });

            window.App.ui.showAppScreen();
            window.App.ui.showTab('monitoramentoAereo');
        }
    """, {
        "userProfile": user_profile,
        "trapData": trap_data,
        "geojson": geojson_data
    })

    # Wait for the main app screen to be visible after state injection
    expect(page.locator("#logoutBtn")).to_be_visible()

    # Verify manual installation confirmation
    page.locator("#btnAddTrap").click()
    page.locator("#trapPlacementModalManualBtn").click()
    # No password needed due to offline mock
    page.locator("#adminPasswordConfirmModalConfirmBtn").click()

    page.wait_for_timeout(500) # wait for modal to disappear

    # Directly invoke the function that should be called on map click
    page.evaluate("""
        () => {
            const feature = window.App.state.geoJsonData.features[0];
            const position = { lng: -48.45, lat: -21.17 };
            window.App.mapModule.showTrapPlacementModal('manual_confirm', { feature, position });
        }
    """)

    page.wait_for_timeout(1000) # Wait for modal to appear
    page.screenshot(path="jules-scratch/verification/before_expect.png")

    # Wait for the confirmation button to be visible before interacting
    expect(page.locator("#trapPlacementModalConfirmBtn")).to_be_visible()

    # Screenshot of the manual installation confirmation modal
    page.screenshot(path="jules-scratch/verification/manual_install_confirmation.png")

    # Confirm installation
    page.locator("#trapPlacementModalConfirmBtn").click()

    page.wait_for_timeout(1000)

    # Verify trap collection UI update
    # Directly invoke the function to show the trap info box
    page.evaluate("() => { window.App.mapModule.showTrapInfo('trap1'); }")

    # Click collect button
    page.locator("#btnCollectTrap").click()

    # Fill in collection data
    page.locator("#confirmationModalInputContainer input[type='number']").fill("10")
    page.locator("#confirmationModalConfirmBtn").click()

    page.wait_for_timeout(1000)

    # Screenshot to show the trap marker is gone
    page.screenshot(path="jules-scratch/verification/trap_collected.png")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        run(p)