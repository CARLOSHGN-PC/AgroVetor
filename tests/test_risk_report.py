
import pytest
from playwright.sync_api import sync_playwright, expect

@pytest.fixture(scope="module")
def browser_context():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        yield context
        browser.close()

def test_risk_report_farm_filter(browser_context):
    page = browser_context.new_page()
    page.goto("http://localhost:8000")

    # Login
    login_button = page.locator("button[type=submit]")
    expect(login_button).to_be_visible()
    page.fill("#loginUser", "test@gmail.com")
    page.fill("#loginPass", "123456")
    login_button.click()

    # Wait for the app to load
    expect(page.locator("#dashboard")).to_be_visible()

    # Navigate to the Risk Report page
    page.click("#btnToggleMenu")
    page.click("text=Relatórios")
    page.click("text=Relatório de Risco")

    # Check if the farm filter is visible
    farm_filter = page.locator("#riscoFazendaFiltro")
    expect(farm_filter).to_be_visible()

    # Check if the farm filter is populated
    expect(farm_filter.locator("option")).to_have_count.greater_than(1)

    page.close()
