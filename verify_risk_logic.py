
import asyncio
from playwright.async_api import async_playwright
import pytest

async def run_test():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.goto("http://localhost:8000")

            # Mock user state to bypass login
            await page.evaluate("""() => {
                window.App.state.currentUser = {
                    uid: 'test-uid',
                    username: 'test-user',
                    role: 'admin',
                    companyId: 'test-company-id',
                    permissions: { dashboard: true, monitoramentoAereo: true }
                };
            }""")

            # Define controlled test data
            today = "2025-10-20T12:00:00.000Z"
            yesterday = "2025-10-19T12:00:00.000Z"
            last_week = "2025-10-13T12:00:00.000Z"

            test_data = {
                "fazendas": [
                    {"id": "farm-1", "code": "101", "name": "FARM RISK", "companyId": "test-company-id", "talhoes": []},
                    {"id": "farm-2", "code": "102", "name": "FARM NO RISK (OLD DATA)", "companyId": "test-company-id", "talhoes": []},
                    {"id": "farm-3", "code": "103", "name": "FARM SAFE", "companyId": "test-company-id", "talhoes": []}
                ],
                "armadilhas": [
                    # Farm 101 (RISK): 2/3 traps have high count in the most recent cycle
                    {"id": "t1", "fazendaCode": "101", "status": "Coletada", "contagemMariposas": 8, "dataColeta": today, "companyId": "test-company-id"},
                    {"id": "t2", "fazendaCode": "101", "status": "Coletada", "contagemMariposas": 7, "dataColeta": today, "companyId": "test-company-id"},
                    {"id": "t3", "fazendaCode": "101", "status": "Coletada", "contagemMariposas": 2, "dataColeta": today, "companyId": "test-company-id"},
                    # This old data should be ignored
                    {"id": "t4", "fazendaCode": "101", "status": "Coletada", "contagemMariposas": 10, "dataColeta": last_week, "companyId": "test-company-id"},

                    # Farm 102 (NO RISK): High count is from an old cycle
                    {"id": "t5", "fazendaCode": "102", "status": "Coletada", "contagemMariposas": 9, "dataColeta": last_week, "companyId": "test-company-id"},
                    {"id": "t6", "fazendaCode": "102", "status": "Coletada", "contagemMariposas": 1, "dataColeta": yesterday, "companyId": "test-company-id"},
                    {"id": "t7", "fazendaCode": "102", "status": "Coletada", "contagemMariposas": 2, "dataColeta": yesterday, "companyId": "test-company-id"},

                    # Farm 103 (SAFE): No high count traps
                    {"id": "t8", "fazendaCode": "103", "status": "Coletada", "contagemMariposas": 1, "dataColeta": today, "companyId": "test-company-id"},
                    {"id": "t9", "fazendaCode": "103", "status": "Coletada", "contagemMariposas": 3, "dataColeta": today, "companyId": "test-company-id"}
                ]
            }

            # Inject test data and mock map object
            result = await page.evaluate(f"""async () => {{
                // Inject data
                window.App.state.fazendas = {test_data['fazendas']};
                window.App.state.armadilhas = {test_data['armadilhas']};
                // Mock geoJsonData to prevent early exit from calculateAndApplyRiskView
                window.App.state.geoJsonData = {{ features: [] }};

                // Mock map object and its methods
                const callLog = {{}};
                window.App.state.mapboxMap = {{
                    querySourceFeatures: (source) => {{
                        if (source === 'talhoes-source') {{
                            // Return mock features that link farm codes to feature IDs
                            return [
                                {{ id: 1, properties: {{ FUNDO_AGR: '101' }} }},
                                {{ id: 2, properties: {{ FUNDO_AGR: '101' }} }},
                                {{ id: 3, properties: {{ FUNDO_AGR: '102' }} }},
                                {{ id: 4, properties: {{ FUNDO_AGR: '103' }} }}
                            ];
                        }}
                        return [];
                    }},
                    setFeatureState: (featureIdentifier, state) => {{
                        const id = featureIdentifier.id;
                        if (!callLog[id]) callLog[id] = [];
                        callLog[id].push(state);
                    }},
                    getLayer: (id) => true,
                    getPaintProperty: () => {{}},
                    setPaintProperty: () => {{}},
                    riskFarmFeatureIds: [] // Mock property
                }};

                // Activate risk view and run the calculation
                window.App.state.riskViewActive = true;
                window.App.mapModule.calculateAndApplyRiskView();

                // Return the log of calls to setFeatureState
                return callLog;
            }}""")

            print("Result from page.evaluate:", result)

            # Assertions
            # Farm 101 (Features 1 & 2) should be marked as risk: true
            assert result.get('1') == [{'risk': True}]
            assert result.get('2') == [{'risk': True}]
            # Farm 102 (Feature 3) should NOT be marked as risk
            assert '3' not in result
            # Farm 103 (Feature 4) should NOT be marked as risk
            assert '4' not in result

            print("Verification successful: Correct farms were flagged for risk.")

            await page.screenshot(path="verify_risk_fix.png")
            print("Screenshot saved to verify_risk_fix.png")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="verify_risk_fix_error.png")
            pytest.fail(f"Test failed with error: {e}")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run_test())
