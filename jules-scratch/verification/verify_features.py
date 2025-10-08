import re
import json
from playwright.sync_api import sync_playwright, expect

def setup_mock_session(page, role):
    """Injects a mock user session into the app's state."""
    user_permissions = {
        'tecnico': { 'dashboard': True, 'monitoramentoAereo': True, 'relatorioMonitoramento': True, 'lancamentoBroca': True, 'lancamentoPerda': True, 'lancamentoCigarrinha': True, 'relatorioBroca': True, 'relatorioPerda': True, 'relatorioCigarrinha': True, 'lancamentoCigarrinhaPonto': True, 'relatorioCigarrinhaPonto': True, 'lancamentoCigarrinhaAmostragem': True, 'relatorioCigarrinhaAmostragem': True, 'syncHistory': True },
        'admin': { 'dashboard': True, 'monitoramentoAereo': True, 'relatorioMonitoramento': True, 'planejamentoColheita': True, 'planejamento': True, 'lancamentoBroca': True, 'lancamentoPerda': True, 'lancamentoCigarrinha': True, 'relatorioBroca': True, 'relatorioPerda': True, 'relatorioCigarrinha': True, 'lancamentoCigarrinhaPonto': True, 'relatorioCigarrinhaPonto': True, 'lancamentoCigarrinhaAmostragem': True, 'relatorioCigarrinhaAmostragem': True, 'excluir': True, 'gerenciarUsuarios': True, 'configuracoes': True, 'cadastrarPessoas': True, 'syncHistory': True }
    }

    mock_user = {
        'uid': f'{role}123',
        'email': f'{role}@agrovetor.com',
        'username': role,
        'role': role,
        'companyId': 'test-company-id',
        'permissions': user_permissions[role]
    }

    # All features are globally active for the test
    all_perms = list(user_permissions['admin'].keys())
    mock_company = {
        'id': 'test-company-id',
        'name': 'Test Company',
        'active': True,
        'subscribedModules': all_perms
    }
    mock_global_configs = {p: True for p in all_perms}

    # Use json.dumps to safely serialize Python dicts to JS objects
    user_json = json.dumps(mock_user)
    company_json = json.dumps([mock_company])
    configs_json = json.dumps(mock_global_configs)

    page.evaluate(f'''() => {{
        console.log('Setting up mock session for role: {role}');
        window.App.state.currentUser = {user_json};
        window.App.state.companies = {company_json};
        window.App.state.globalConfigs = {configs_json};
        window.App.ui.showAppScreen();
    }}''')


def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:8000", wait_until="domcontentloaded")
        page.wait_for_function("!!window.App", timeout=10000)

        # --- Test 1: Verify non-admin user cannot see manual install button ---
        print("Running Test 1: Non-admin user permissions...")
        setup_mock_session(page, 'tecnico')

        expect(page.locator("#userMenuUsername")).to_have_text("tecnico", timeout=10000)

        page.get_by_label("Abrir menu").click()
        page.get_by_role("button", name="Monitoramento Aéreo").click()

        expect(page.locator("#map")).to_be_visible()
        page.get_by_title("Adicionar Armadilha no Local Atual").click()

        expect(page.get_by_role("heading", name="Instalar Nova Armadilha")).to_be_visible()
        expect(page.get_by_role("button", name="Selecionar Manualmente")).not_to_be_visible()
        print("Test 1 Passed: Manual install button is not visible for non-admin.")

        page.locator("#trapPlacementModalCancelBtn").click()

        # --- Test 2: Verify admin user flow and OFFLINE SAVE ---
        print("\\nRunning Test 2: Admin user flow and offline save...")
        page.reload()
        page.wait_for_function("!!window.App", timeout=10000)

        setup_mock_session(page, 'admin')
        expect(page.locator("#userMenuUsername")).to_have_text("admin", timeout=10000)

        page.get_by_label("Abrir menu").click()
        page.get_by_role("button", name="Monitoramento Aéreo").click()

        expect(page.locator("#map")).to_be_visible()
        page.get_by_title("Adicionar Armadilha no Local Atual").click()

        expect(page.get_by_role("heading", name="Instalar Nova Armadilha")).to_be_visible()

        manual_button = page.get_by_role("button", name="Selecionar Manualmente")
        expect(manual_button).to_be_visible()
        print("Test 2a Passed: Manual install button is visible for admin.")

        manual_button.click()
        expect(page.get_by_placeholder("Sua Senha de Administrador")).to_be_visible()
        page.get_by_placeholder("Sua Senha de Administrador").fill("123456")
        page.get_by_role("button", name="Confirmar e Criar").click()

        expect(page.get_by_text("Modo de seleção manual ativado.")).to_be_visible()
        print("Test 2b Passed: Admin manual placement flow works.")

        print("Simulating offline mode...")
        context.set_offline(True)

        page.evaluate('''() => {
            window.App.mapModule.installTrap(-21.1, -48.4, null);
        }''')

        expect(page.get_by_text("Armadilha guardada offline. Será enviada quando houver conexão.")).to_be_visible()
        print("Test 2c Passed: Offline save alert is visible.")

        page.screenshot(path="jules-scratch/verification/verification.png")
        print("\\nScreenshot 'verification.png' created successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
        raise
    finally:
        try:
            if not browser.is_closed():
                context.set_offline(False)
        except Exception:
            pass
        browser.close()

with sync_playwright() as p:
    run(p)