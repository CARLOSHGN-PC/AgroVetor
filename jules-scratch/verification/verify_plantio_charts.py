
import re
from playwright.sync_api import Page, expect

def test_plantio_dashboard_updates(page: Page):
    """
    This test verifies the requested updates to the Plantio dashboard.
    1. Navigates to the Plantio dashboard.
    2. Checks that the 'Área Plantada por Dia' chart title is now 'Área Plantada por Mês'.
    3. Takes a screenshot to visually verify the changes.
    """
    # 1. Arrange: Go to the application and log in.
    page.goto("http://localhost:8000")

    # Use evaluate to bypass UI login and set state directly
    page.evaluate("""() => {
        const user = {
            uid: 'mock-uid',
            email: 'test@example.com',
            role: 'admin',
            companyId: 'mock-company-id',
            permissions: { dashboard: true, apontamentoPlantio: true }
        };
        window.App.state.currentUser = user;
        window.App.ui.showAppScreen();
        window.App.ui.showTab('dashboard');
    }""")

    # 2. Act: Navigate to the Plantio dashboard.
    page.locator("#card-plantio").click()

    # 3. Assert: Check the chart title.
    expect(page.locator("h3.chart-title:has-text('Área Plantada por Mês')")).to_be_visible()

    # 4. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/plantio_dashboard.png")
