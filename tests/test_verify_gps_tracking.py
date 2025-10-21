
import pytest
from playwright.async_api import async_playwright, expect

@pytest.mark.asyncio
async def test_automatic_gps_tracking():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        await page.goto("http://localhost:8000")

        # Mock geolocation API
        await page.evaluate("""() => {
            navigator.geolocation.watchPosition = (success) => {
                const position = { coords: { latitude: -21.17, longitude: -48.45 } };
                success(position);
                return 1; // Return a watchId
            };
            navigator.geolocation.getCurrentPosition = (success) => {
                const position = { coords: { latitude: -21.17, longitude: -48.45 } };
                success(position);
            };
        }""")

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

        # Use wait_for_function to poll for the state change
        await page.wait_for_function("() => window.App.state.isTracking === true", timeout=5000)

        is_tracking = await page.evaluate("() => window.App.state.isTracking")
        assert is_tracking is True, "GPS tracking did not start automatically"

        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()
