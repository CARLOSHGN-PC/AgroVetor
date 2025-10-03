import json
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to the local server
    page.goto("http://localhost:40583/index.html")

    # Wait for the splash screen to disappear
    expect(page.locator("#splash-screen")).to_have_class("hidden", timeout=10000)

    # --- Bypass Login using Offline Mode ---
    # Create a mock user profile for the super admin
    admin_permissions = {
        "dashboard": True, "monitoramentoAereo": True, "relatorioMonitoramento": True,
        "planejamentoColheita": True, "planejamento": True, "lancamentoBroca": True,
        "lancamentoPerda": True, "lancamentoCigarrinha": True, "relatorioBroca": True,
        "relatorioPerda": True, "relatorioCigarrinha": True, "lancamentoCigarrinhaPonto": True,
        "relatorioCigarrinhaPonto": True, "lancamentoCigarrinhaAmostragem": True,
        "relatorioCigarrinhaAmostragem": True, "lancamentoPerobox": True, "relatorioPerobox": True,
        "excluir": True, "gerenciarUsuarios": True, "configuracoes": True,
        "cadastrarPessoas": True, "syncHistory": True, "superAdmin": True
    }

    mock_user_profile = {
        "uid": "super-admin-test-uid",
        "email": "admin@agrovetor.com",
        "username": "admin (test)",
        "role": "super-admin",
        "active": True,
        "companyId": None, # Super admin has no default company
        "permissions": admin_permissions
    }

    # Wait for the application's main 'App' object to be initialized
    page.wait_for_function("!!window.App && !!window.App.auth")

    # Inject the profile into localStorage and call the offline login function
    page.evaluate(f"""
        localStorage.setItem('localUserProfiles', JSON.stringify([{json.dumps(mock_user_profile)}]));
        window.App.auth.loginOffline('super-admin-test-uid');
    """)

    # Wait for the main app screen to be visible
    expect(page.locator("#appScreen")).to_be_visible(timeout=15000)

    # --- Navigate to Perobox Entry Form ---
    page.get_by_role("button", name="Lançamentos").click()
    page.get_by_role("button", name="Instalação Perobox").click()

    # Wait for the Perobox form to be visible and take a screenshot
    expect(page.locator("#lancamentoPerobox.tab-content.active")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/perobox_form.png")

    # --- Navigate to Perobox Report ---
    page.get_by_role("button", name="Relatórios").click()
    page.get_by_role("button", name="Relatório Perobox").click()

    # Wait for the Perobox report section to be visible and take a screenshot
    expect(page.locator("#relatorioPerobox.tab-content.active")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/perobox_report.png")

    # --- Navigate to Sync History ---
    page.get_by_role("button", name="Administrativo").click()
    page.get_by_role("button", name="Histórico de Sincronização").click()

    # Wait for the Sync History section to be visible and take a screenshot
    expect(page.locator("#syncHistory.tab-content.active")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/sync_history.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)