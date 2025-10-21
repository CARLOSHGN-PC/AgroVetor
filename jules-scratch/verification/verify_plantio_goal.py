
from playwright.sync_api import sync_playwright, expect
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:8000")

        # Wait for the app to be initialized
        page.wait_for_function("window.App && window.App.state")

        # 1. Bypass login by injecting a mock user state
        mock_user = {
            'uid': 'mockUserId',
            'role': 'admin',
            'companyId': 'mockCompanyId',
            'permissions': {
                'dashboard': True,
                'configuracoes': True,
                'relatorioPlantio': True
            }
        }
        page.evaluate(f"window.App.state.currentUser = {json.dumps(mock_user)}")

        # 2. Directly render the company settings tab
        page.evaluate("window.App.ui.showAppScreen()")
        page.wait_for_timeout(500) # Give UI time to render
        page.evaluate("window.App.ui.showTab('configuracoesEmpresa')")
        page.wait_for_timeout(500) # Give UI time to render

        # 3. Set the planting goal
        plantio_meta_input = page.locator("#plantioMetaInput")
        expect(plantio_meta_input).to_be_visible()
        plantio_meta_input.fill("8888")
        page.locator("#btnSavePlantioMeta").click()

        # Wait for the save confirmation alert to disappear to avoid race conditions
        expect(page.get_by_text("Meta de plantio atualizada com sucesso!")).to_be_visible()
        expect(page.get_by_text("Meta de plantio atualizada com sucesso!")).not_to_be_visible()


        # 4. Directly render the dashboard and then the plantio view
        page.evaluate("window.App.ui.showTab('dashboard')")
        page.wait_for_timeout(500) # Give UI time to render
        page.locator("#card-plantio").click()

        # 5. Verify the new goal in the KPI
        expect(page.locator("#kpi-plantio-meta")).to_have_text("8888.00 ha")

        # 6. Take screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
