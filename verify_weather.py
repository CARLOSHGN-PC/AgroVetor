import asyncio
from playwright.async_api import async_playwright
import json
import time

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # 1. Navigate to the local server
        await page.goto("http://localhost:8000")

        # 2. Wait for App to be defined
        await page.wait_for_function("() => window.App && window.App.state")

        # 3. Mock Data
        mock_data_script = """
        () => {
            // Mock User
            App.state.currentUser = {
                uid: 'test-uid',
                email: 'test@example.com',
                companyId: 'test-company',
                role: 'admin',
                permissions: { dashboardClima: true }
            };
            App.state.companies = [{ id: 'test-company', name: 'Test Company', subscribedModules: ['dashboardClima'] }];
            App.state.globalConfigs = { dashboardClima: true };

            // Mock Farms (needed for dashboard filter population)
            App.state.fazendas = [
                { id: 'f1', name: 'Fazenda A', code: '101' },
                { id: 'f2', name: 'Fazenda B', code: '102' }
            ];

            // Mock GeoJSON (needed for turf.center in getWeatherForecast, although we will mock the result too)
            App.state.geoJsonData = {
                type: "FeatureCollection",
                features: [
                    { type: "Feature", geometry: { type: "Point", coordinates: [-48.0, -21.0] }, properties: {} }
                ]
            };

            // Mock Precipitation Data (clima collection)
            // Generate data for Current Month (Daily) and Previous Month (Weekly consolidation test)
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();

            const data = [];

            // Helper to add data
            const addData = (dateStr, rain) => {
                data.push({
                    data: dateStr,
                    pluviosidade: rain,
                    tempMax: 30,
                    tempMin: 20,
                    umidade: 60,
                    vento: 10,
                    fazendaId: 'f1',
                    fazendaNome: 'Fazenda A'
                });
                // Add a second record for the same day to test averaging
                data.push({
                    data: dateStr,
                    pluviosidade: rain + 10, // Average will be (rain + rain+10)/2 = rain + 5
                    tempMax: 32,
                    tempMin: 22,
                    umidade: 55,
                    vento: 12,
                    fazendaId: 'f2',
                    fazendaNome: 'Fazenda B'
                });
            };

            // Previous Month Data (e.g., 1st to end)
            // Let's assume previous month has 30 days
            let prevMonth = currentMonth - 1;
            let prevYear = currentYear;
            if (prevMonth < 0) { prevMonth = 11; prevYear--; }

            for(let i=1; i<=28; i++) {
                const day = String(i).padStart(2, '0');
                const month = String(prevMonth + 1).padStart(2, '0');
                addData(`${prevYear}-${month}-${day}`, 10); // Daily avg should be 15
            }

            // Current Month Data
            for(let i=1; i<=15; i++) {
                const day = String(i).padStart(2, '0');
                const month = String(currentMonth + 1).padStart(2, '0');
                addData(`${currentYear}-${month}-${day}`, 20); // Daily avg should be 25
            }

            // Historical Data (Older years)
            addData(`${currentYear - 1}-05-10`, 50);
            addData(`${currentYear - 2}-05-10`, 40);

            // Mock Firestore Get (for consolidated data)
            App.actions.getConsolidatedData = async (collection) => {
                if(collection === 'clima') return data;
                return [];
            };

            // Mock Weather Forecast API response
            App.actions.getWeatherForecast = async () => {
                return {
                    daily: {
                        time: ['2023-10-27', '2023-10-28', '2023-10-29', '2023-10-30', '2023-10-31', '2023-11-01', '2023-11-02'],
                        temperature_2m_max: [30, 31, 29, 28, 32, 33, 30],
                        temperature_2m_min: [20, 21, 19, 18, 22, 23, 20],
                        precipitation_sum: [0, 5, 10, 0, 0, 2, 0]
                    }
                };
            };

            // Force App Init logic
            App.ui.showAppScreen();

            // Navigate to Dashboard Clima
            setTimeout(() => {
                App.ui.showTab('dashboard');
                // Trigger specific dashboard view
                App.ui.showDashboardView('clima');
            }, 500);
        };
        """
        await page.evaluate(mock_data_script)

        # 4. Wait for charts to render
        await page.wait_for_timeout(3000)

        # 5. Take screenshot
        await page.screenshot(path="verification_weather.png", full_page=True)
        print("Screenshot saved to verification_weather.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
