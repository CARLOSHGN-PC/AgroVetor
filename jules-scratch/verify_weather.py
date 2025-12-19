
import json
import time
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright, expect

def verify_weather_dashboard(page):
    page.goto("http://localhost:8000")

    # Generate dates relative to today for correct bucketing
    now = datetime.now()
    current_month_day = now.strftime('%Y-%m-%d')

    prev_month = (now.replace(day=1) - timedelta(days=1))
    prev_month_day = prev_month.strftime('%Y-%m-%d')

    older_month = (prev_month.replace(day=1) - timedelta(days=1))
    older_month_day = older_month.strftime('%Y-%m-%d')

    year_ago = (now - timedelta(days=365)).strftime('%Y-%m-%d')

    page.evaluate(f"""
        const currentMonthDay = '{current_month_day}';
        const prevMonthDay = '{prev_month_day}';
        const olderMonthDay = '{older_month_day}';
        const yearAgo = '{year_ago}';

        window.App = window.App || {{}};
        window.App.state = window.App.state || {{}};
        window.App.state.currentUser = {{ uid: 'test-user', companyId: 'test-company', role: 'admin' }};
        window.App.state.companies = [{{ id: 'test-company', name: 'Test Company', subscribedModules: ['dashboard', 'dashboardClima'] }}];
        window.App.state.globalConfigs = {{ dashboardClima: true }};
        window.App.state.fazendas = [{{ id: 'farm1', name: 'Fazenda Teste', code: '100' }}];

        // Hide splash screen manually
        document.getElementById('splash-screen').classList.add('hidden');

        // Mock consolidated data
        window.App.actions = window.App.actions || {{}};
        window.App.actions.getConsolidatedData = async () => {{
            return [
                // Current Month (Daily)
                {{ data: currentMonthDay, pluviosidade: 15, tempMax: 30, tempMin: 20, umidade: 60, vento: 10, fazendaId: 'farm1' }},

                // Previous Month (Weekly - 2 entries in same week to test average)
                {{ data: prevMonthDay, pluviosidade: 20, tempMax: 28, tempMin: 18, umidade: 65, vento: 12, fazendaId: 'farm1' }},
                {{ data: prevMonthDay, pluviosidade: 10, tempMax: 28, tempMin: 18, umidade: 65, vento: 12, fazendaId: 'farm1' }}, // Avg should be 15

                // Older Month (Monthly)
                {{ data: olderMonthDay, pluviosidade: 50, tempMax: 25, tempMin: 15, umidade: 70, vento: 15, fazendaId: 'farm1' }},

                // Historical (Year Ago)
                {{ data: yearAgo, pluviosidade: 120, fazendaId: 'farm1' }}
            ];
        }};

        window.App.actions.filterDashboardData = (data) => data;
        window.App.actions.saveDashboardDates = () => {{}};
        window.App.actions.getDashboardDates = () => ({{ start: '2023-01-01', end: '2025-12-31' }});

        // Mock Weather Forecast
        window.App.actions.getWeatherForecast = async (farmId) => {{
            return {{
                daily: {{
                    time: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05', '2025-01-06', '2025-01-07'],
                    temperature_2m_max: [30, 31, 29, 28, 30, 32, 31],
                    temperature_2m_min: [20, 21, 19, 18, 20, 22, 21],
                    precipitation_sum: [0, 5, 10, 0, 0, 2, 0]
                }}
            }};
        }};

        // Trigger rendering
        window.App.ui.showAppScreen();
        window.App.ui.showTab('dashboardClima');
    """)

    page.wait_for_timeout(3000) # Give time for animations
    page.screenshot(path="jules-scratch/weather_dashboard_verification_2.png", full_page=True)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1200})
        page = context.new_page()
        try:
            verify_weather_dashboard(page)
            print("Verification script executed successfully.")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
