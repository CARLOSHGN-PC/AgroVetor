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
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const currentDay = today.getDate();

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
            };

            // Previous Month Data (e.g., 2 months ago, last month)
            // 2 months ago (Should be aggregated as Month)
            let m2 = currentMonth - 2;
            let y2 = currentYear;
            if (m2 < 0) { m2 += 12; y2--; }
            addData(`${y2}-${String(m2+1).padStart(2,'0')}-15`, 50);

            // Last month (Should be aggregated as Month)
            let m1 = currentMonth - 1;
            let y1 = currentYear;
            if (m1 < 0) { m1 += 12; y1--; }
            addData(`${y1}-${String(m1+1).padStart(2,'0')}-15`, 60);

            // Current Month
            // Week 1 (Day 2) -> Should be aggregated in Week 1
            addData(`${currentYear}-${String(currentMonth+1).padStart(2,'0')}-02`, 10);
            // Week 2 (Day 9) -> Should be aggregated in Week 2
            addData(`${currentYear}-${String(currentMonth+1).padStart(2,'0')}-09`, 20);

            // Today (Should be distinct)
            addData(today.toISOString().split('T')[0], 30);

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
        await page.screenshot(path="verification_weather_v2.png", full_page=True)
        print("Screenshot saved to verification_weather_v2.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
