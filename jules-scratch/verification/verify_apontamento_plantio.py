
from playwright.sync_api import sync_playwright, Page, expect
import json

# Using full permissions from the app's config to be safe
admin_permissions = {
    "dashboard": True, "monitoramentoAereo": True, "relatorioMonitoramento": True,
    "planejamentoColheita": True, "planejamento": True, "lancamentoBroca": True,
    "lancamentoPerda": True, "lancamentoCigarrinha": True, "relatorioBroca": True,
    "relatorioPerda": True, "relatorioCigarrinha": True, "lancamentoCigarrinhaPonto": True,
    "relatorioCigarrinhaPonto": True, "lancamentoCigarrinhaAmostragem": True,
    "relatorioCigarrinhaAmostragem": True, "excluir": True, "gerenciarUsuarios": True,
    "configuracoes": True, "cadastrarPessoas": True, "syncHistory": True,
    "frenteDePlantio": True, "apontamentoPlantio": True, "relatorioPlantio": True,
    "gerenciarLancamentos": True
}
all_modules = list(admin_permissions.keys())

# Mock data
mock_user = {
    "uid": "mock-user-id", "email": "test@agrovetor.com", "username": "Test User", "role": "admin",
    "companyId": "mock-company-id", "active": True, "permissions": admin_permissions
}
mock_company = { "id": "mock-company-id", "name": "Mock Company", "active": True, "subscribedModules": all_modules }
mock_global_configs = {module: True for module in all_modules}
mock_fazendas = [{"id": "farm1", "code": "F01", "name": "Fazenda Mock", "talhoes": [{"id": "talhao1", "name": "T01", "area": 50.0}]}]
mock_frentes = [{"id": "frente1", "name": "Frente Mock 1", "provider": "Provider Mock"}]
mock_personnel = [{"id": "person1", "matricula": "123", "name": "Líder Mock"}]

def run_verification(page: Page):
    """
    This script verifies that the 'Apontamento de Plantio' form can be
    submitted successfully after the bugfix.
    """
    # 1. Arrange: Go to the app and mock the session state.

    # This script is injected into the page to set up a mock user session
    # and provide the necessary data for the form to function.
    injection_script = f"""
        localStorage.setItem('agrovetor_lastActiveTab', 'dashboard');
        Object.assign(window.App.state, {{
            currentUser: {json.dumps(mock_user)},
            companies: [{json.dumps(mock_company)}],
            globalConfigs: {json.dumps(mock_global_configs)},
            fazendas: {json.dumps(mock_fazendas)},
            frentesDePlantio: {json.dumps(mock_frentes)},
            personnel: {json.dumps(mock_personnel)}
        }});
        // Override the session check and manually trigger the app to show
        window.App.auth.checkSession = () => {{}};
        setTimeout(() => window.App.ui.showAppScreen(), 50);
    """

    page.goto("http://localhost:8000")

    # Wait for the login screen to ensure the App object is initialized
    expect(page.locator("#loginScreen")).to_be_visible()

    # Inject script and reload to start the app in a logged-in state
    page.add_init_script(injection_script)
    page.reload()

    # Wait for the main app screen to confirm successful login
    page.wait_for_timeout(1000)
    expect(page.locator("#appScreen")).to_be_visible()

    # 2. Act: Navigate to the form and fill it out.

    # Open the main menu
    page.locator("#btnToggleMenu").click()

    # Click through the menu to the target page
    page.locator("nav#menu").get_by_text("Lançamentos").click()
    page.locator("nav#menu").get_by_text("Apontamento de Plantio").click()

    # Wait for the form to be visible
    form = page.locator("#formApontamentoPlantio")
    expect(form).to_be_visible()

    # Fill out the main form fields
    form.locator("#plantioFrente").select_option(value="frente1")
    form.locator("#plantioLeaderId").fill("123")
    form.locator("#plantioFarmName").select_option(value="farm1")
    form.locator("#plantioDate").fill("2025-10-15")

    # Add a planting record sub-form
    form.locator("#addPlantioRecord").click()

    # Fill out the sub-form
    record_card = form.locator(".amostra-card").last
    expect(record_card).to_be_visible()
    record_card.locator(".plantio-talhao-select").select_option(value="talhao1")
    record_card.locator('input[id^="plantioVariedade-"]').fill("Test Variety")
    record_card.locator(".plantio-area-input").fill("10")

    # Click the save button to trigger the confirmation modal
    form.locator("#btnSaveApontamentoPlantio").click()

    # Handle the custom confirmation modal
    confirmation_modal = page.locator("#confirmationModal")
    expect(confirmation_modal).to_be_visible()
    confirmation_modal.locator("#confirmationModalConfirmBtn").click()

    # 3. Assert: Verify the success state.

    # A success alert should appear after a successful save.
    success_alert = page.locator("#alertContainer.show.success")
    expect(success_alert).to_be_visible()
    expect(success_alert).to_have_text("Apontamento de plantio guardado com sucesso!")

    # 4. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
            print("Verification script ran successfully!")
        finally:
            browser.close()
