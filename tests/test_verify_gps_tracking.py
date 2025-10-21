
import pytest
from playwright.async_api import async_playwright, expect

@pytest.mark.asyncio
async def test_automatic_gps_tracking():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(permissions=['geolocation'])
        page = await context.new_page()

        await page.goto("http://localhost:8000")

        await page.add_init_script("""
            navigator.geolocation.getCurrentPosition = (success, error) => {
                success({ coords: { latitude: -21.17, longitude: -48.45 } });
            };
            navigator.geolocation.watchPosition = (success, error, options) => {
                const position = { coords: { latitude: -21.17, longitude: -48.45, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
                success(position);
                return 1; // Return a watchId
            };
        """)

        await page.goto("http://localhost:8000")

        # Mock the currentUser and trigger the app screen
        await page.evaluate("""() => {
            window.App.state.currentUser = {
                uid: 'mock_uid',
                email: 'test@example.com',
                username: 'Test User',
                role: 'admin',
                companyId: 'mock_company_id',
                permissions: { dashboard: true, monitoramentoAereo: true }
            };
            window.App.ui.showAppScreen();
        }""")

        # Wait for the app to initialize and check the tracking state
        await page.wait_for_timeout(2000) # Give it a moment to run the startup logic

        is_tracking = await page.evaluate("() => window.App.state.isTracking")
        assert is_tracking is True, "GPS tracking did not start automatically"

        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()
