from playwright.sync_api import sync_playwright
import time

def verify_app_entry():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            permissions=['geolocation'],
            geolocation={'latitude': -21.17, 'longitude': -48.45}
        )
        page = context.new_page()
        page.goto("http://localhost:8000")

        # WAIT for the REAL App to be initialized
        # We check for App.ui.showAppScreen to ensure the script has loaded and parsed
        page.wait_for_function("window.App && window.App.ui && typeof window.App.ui.showAppScreen === 'function'")

        # Now bypass login by setting state and calling the real showAppScreen
        page.evaluate("""
            window.App.state.currentUser = {
                uid: 'test-user',
                email: 'test@agrovetor.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'test-company',
                permissions: { registroAplicacao: true }
            };

            // We need to ensure state structures exist
            window.App.state.companies = [{
                id: 'test-company',
                name: 'Test Company',
                subscribedModules: ['registroAplicacao']
            }];

            window.App.state.fazendas = [{
                id: 'farm-1',
                code: '100',
                name: 'FAZENDA TESTE',
                talhoes: [
                    { id: 1, name: 'T-01', area: 10.0 },
                    { id: 2, name: 'T-02', area: 20.0 }
                ]
            }];

            // Mock Mapbox to prevent errors since we are headless/offline-ish
            window.mapboxgl = {
                Map: class {
                    constructor() { return this; }
                    on(event, id, cb) {
                        // Simulate load event immediately
                        if (event === 'load') {
                             if (typeof id === 'function') id();
                             else if (cb) cb();
                        }
                    }
                    remove() {}
                    addSource() {}
                    addLayer() {}
                    getLayer() { return null; }
                    getSource() { return null; }
                    resize() {}
                    setFeatureState() {}
                    setPaintProperty() {}
                    setFilter() {}
                    fitBounds() {}
                    isStyleLoaded() { return true; }
                },
                Marker: class {
                    constructor() { return this; }
                    setLngLat() { return this; }
                    addTo() { return this; }
                }
            };

            // Force the UI to show the app screen now that we are "logged in"
            window.App.ui.showAppScreen();
        """)

        # Allow time for rendering
        time.sleep(2)

        # Open "Lançamentos" submenu
        page.locator("button.menu-btn").filter(has_text="Lançamentos").click()
        time.sleep(0.5)

        # Click "Registro de Aplicação"
        page.locator("button.submenu-btn").filter(has_text="Registro de Aplicação").click()
        time.sleep(1)

        # Select Farm
        page.select_option("#appFarmSelect", "farm-1")
        time.sleep(0.5)

        # Select Shift
        page.select_option("#appShift", "A")

        # Click the toggle switch for partial
        page.locator(".partial-toggle").first.click()
        time.sleep(0.5)

        # Type partial area
        page.locator(".partial-area-input").first.fill("5")

        # Select Direction
        page.locator(".partial-direction-select").first.select_option("N")

        # Fill dosage
        page.fill("#appDosage", "2.0")

        time.sleep(1)

        page.screenshot(path="verification/app_entry_screenshot.png")
        print("Screenshot saved to verification/app_entry_screenshot.png")

        browser.close()

if __name__ == "__main__":
    verify_app_entry()
