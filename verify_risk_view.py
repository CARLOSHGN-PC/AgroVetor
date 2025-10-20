
import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            ignore_https_errors=True,
            java_script_enabled=True
        )
        page = await context.new_page()

        try:
            page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}") if "error" in msg.type.lower() else None)

            await page.goto("http://localhost:8000")
            await page.wait_for_load_state('networkidle')

            install_date_iso = "2023-10-01T00:00:00.000Z"
            collection_date_iso = "2023-10-10T00:00:00.000Z"

            # *** FIX: Corrected Python syntax for page.evaluate call ***
            await page.evaluate("""(args) => {
                window.mockedMap = {
                    _featureState: {},
                    setFeatureState: function(featureIdentifier, state) {
                        const id = featureIdentifier.id;
                        if (id === null || id === undefined) throw new Error('Feature ID is missing in setFeatureState call.');
                        if (!this._featureState[id]) this._featureState[id] = {};
                        Object.assign(this._featureState[id], state);
                    },
                    getFeatureState: function(featureIdentifier) {
                        return this._featureState[featureIdentifier.id] || {};
                    },
                    querySourceFeatures: function(source) {
                        return [
                            {
                                id: 12345,
                                type: 'Feature',
                                properties: { FUNDO_AGR: '123' },
                                geometry: { type: 'Polygon', coordinates: [] }
                            }
                        ];
                    },
                    setPaintProperty: function(layer, prop, val) {},
                    riskFarmFeatureIds: []
                };
                window.App.state.mapboxMap = window.mockedMap;

                window.App.state.currentUser = {
                    uid: 'TEST_UID', email: 'test@example.com', username: 'Test User',
                    role: 'admin', companyId: 'test_company',
                };
                window.App.state.fazendas = [{
                    id: 'farm1', code: '123', name: 'Fazenda Risco', companyId: 'test_company'
                }];
                window.App.state.armadilhas = [
                    {
                        id: 'trap1', fazendaCode: '123', companyId: 'test_company', status: 'Coletada',
                        dataInstalacao: new Date(args.installDate),
                        dataColeta: new Date(args.collectionDate),
                        contagemMariposas: 10
                    },
                    {
                        id: 'trap2', fazendaCode: '123', companyId: 'test_company', status: 'Ativa',
                        dataInstalacao: new Date(args.installDate),
                    }
                ];
                window.App.state.riskViewActive = true;

                window.App.mapModule.calculateAndApplyRiskView();
            }""", { "installDate": install_date_iso, "collectionDate": collection_date_iso })

            feature_state = await page.evaluate("() => window.mockedMap.getFeatureState({ id: 12345 })")

            print(f"Feature state for ID 12345: {feature_state}")

            if feature_state and feature_state.get('risk') is True:
                print("Verification successful: The 'risk' state was correctly applied to the feature.")
                await page.screenshot(path="risk_view_logic_verified.png")
                print("Screenshot saved to risk_view_logic_verified.png")
            else:
                print("Verification failed: The 'risk' state was not applied correctly.")
                await page.screenshot(path="risk_view_logic_failed.png")
                raise Exception("Risk view logic verification failed.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="error_screenshot.png")
            raise
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
