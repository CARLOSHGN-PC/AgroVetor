from playwright.sync_api import sync_playwright
import json
from datetime import datetime, timedelta

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto('http://localhost:8000/index.html', timeout=60000)
        page.wait_for_function('window.App !== undefined')

        # --- Test State ---
        company_id = 'test_company_123'
        user_profile = {
            'uid': 'test_user_123', 'email': 'test@test.com', 'username': 'Test User',
            'role': 'admin', 'companyId': company_id,
            'permissions': {'monitoramentoAereo': True} # Simplified for test
        }

        install_date = (datetime.now() - timedelta(days=5)).isoformat()
        collection_date = (datetime.now() - timedelta(days=1)).isoformat()

        # Scenario: Farm name in DB differs from SHP, but the code matches.
        # Expected: The farm SHOULD be highlighted because the code matches.
        test_farms = [{
            'id': 'farm_code_match',
            'name': 'Fazenda Santa Maria', # Name in Database
            'code': '101',                 # Code in Database
            'companyId': company_id
        }]

        test_traps = [
            {
                'id': 'trap1', 'fazendaNome': 'Fazenda Santa Maria', 'talhaoNome': 'T1',
                'status': 'Coletada',
                'dataInstalacao': install_date,
                'dataColeta': collection_date,
                'contagemMariposas': 20, # High count
                'companyId': company_id
            }
        ]

        geo_json_data = {
            'type': 'FeatureCollection',
            'features': [{
                'id': 1, 'type': 'Feature',
                'geometry': {'type': 'Polygon', 'coordinates': [[[-48, -21], [-48, -22], [-49, -22], [-49, -21], [-48, -21]]]},
                'properties': {
                    'NM_IMOVEL': 'STA MARIA', # Different Name in SHP
                    'FUNDO_AGR': 101          # Matching Code in SHP
                }
            }]
        }

        # --- Inject State into App ---
        state = {
            'user': user_profile,
            'companies': [{'id': company_id, 'name': 'Test Company'}],
            'fazendas': test_farms,
            'armadilhas': test_traps,
            'geoJsonData': geo_json_data
        }

        page.evaluate(f"window.App.state.currentUser = {json.dumps(state['user'])}")
        page.evaluate(f"window.App.state.companies = {json.dumps(state['companies'])}")
        page.evaluate(f"window.App.state.fazendas = {json.dumps(state['fazendas'])}")
        page.evaluate(f"window.App.state.armadilhas = {json.dumps(state['armadilhas'])}")
        page.evaluate(f"window.App.state.geoJsonData = {json.dumps(state['geoJsonData'])}")

        page.evaluate('window.App.ui.showAppScreen()')
        page.evaluate("window.App.ui.showTab('monitoramentoAereo')")

        # --- Verification ---
        page.wait_for_function('window.App.state.mapboxMap && window.App.state.mapboxMap.isStyleLoaded()')

        # Programmatically trigger the risk view calculation
        page.evaluate("window.App.mapModule.toggleRiskView()")
        page.wait_for_timeout(1500) # Allow for re-render and style application

        # Take screenshot for visual confirmation
        screenshot_path = "jules-scratch/verification/verify_code_matching_fix.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # Check the feature state
        is_at_risk = page.evaluate("window.App.state.mapboxMap.getFeatureState({ source: 'talhoes-source', id: 1 }).risk")

        if is_at_risk:
            print("SUCCESS: Farm was correctly highlighted as 'at risk' using the farm code.")
        else:
            print("FAILURE: Farm was NOT highlighted. The code-based matching failed.")
            raise AssertionError("Verification failed: Farm was not highlighted.")

    finally:
        context.close()
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
