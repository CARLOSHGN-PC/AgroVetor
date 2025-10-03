import re
import json
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to the local server
    page.goto("http://localhost:8000/index.html")

    # --- Mock Offline Login ---
    # Wait for the splash screen to disappear
    expect(page.locator("#splash-screen")).to_have_class("hidden", timeout=10000)

    # Wait for the App object to be available on the window
    page.wait_for_function("window.App && window.App.state && window.App.ui")
    print("App object is available.")

    # Define mock user and company data
    mock_user_profile = {
        "uid": "mock-admin-uid",
        "email": "admin@agrovetor.com",
        "username": "admin",
        "role": "admin",
        "companyId": "super-admin-test-company-id",
        "active": True,
        "permissions": {
            "dashboard": True, "monitoramentoAereo": True, "relatorioMonitoramento": True,
            "planejamentoColheita": True, "planejamento": True, "lancamentoBroca": True,
            "lancamentoPerda": True, "lancamentoCigarrinha": True, "relatorioBroca": True,
            "relatorioPerda": True, "relatorioCigarrinha": True, "lancamentoCigarrinhaPonto": True,
            "relatorioCigarrinhaPonto": True, "lancamentoCigarrinhaAmostragem": True,
            "relatorioCigarrinhaAmostragem": True, "lancamentoPerobox": True,
            "relatorioPerobox": True, "excluir": True, "gerenciarUsuarios": True,
            "configuracoes": True, "cadastrarPessoas": True, "syncHistory": True
        }
    }

    mock_company = {
        "id": "super-admin-test-company-id",
        "name": "Super Admin Test Co.",
        "active": True,
        "subscribedModules": list(mock_user_profile["permissions"].keys()) # All permissions are subscribed
    }

    # Use page.evaluate to set the state directly in the browser context
    page.evaluate("""(args) => {
        window.App.state.currentUser = args.user;
        window.App.state.companies = [args.company];
        // Set global configs to true to ensure all features are visible
        Object.keys(window.App.config.roles.admin).forEach(k => window.App.state.globalConfigs[k] = true);
        window.App.ui.showAppScreen();
    }""", {"user": mock_user_profile, "company": mock_company})


    # Wait for the main app screen to be visible
    expect(page.locator("#appScreen")).to_be_visible(timeout=10000)
    print("Login successful, app screen is visible.")

    # --- Open the main menu ---
    menu_toggle_button = page.locator("#btnToggleMenu")
    expect(menu_toggle_button).to_be_visible()
    menu_toggle_button.click()
    print("Main menu opened.")

    # --- Navigate to Perobox Entry Form ---
    lancamentos_button = page.get_by_role("button", name="Lançamentos")
    expect(lancamentos_button).to_be_visible(timeout=5000)
    lancamentos_button.click()

    perobox_button = page.get_by_role("button", name="Instalação Perobox")
    expect(perobox_button).to_be_visible(timeout=5000)
    perobox_button.click()

    # Wait for the Perobox form to be visible and take a screenshot
    expect(page.locator("#lancamentoPerobox.tab-content.active")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/perobox_form.png")
    print("Perobox form screenshot taken.")

    # --- Re-open menu for next navigation ---
    menu_toggle_button.click()
    print("Main menu opened again.")

    # --- Navigate to Perobox Report ---
    page.get_by_role("button", name="Relatórios").click()
    page.get_by_role("button", name="Relatório Perobox").click()

    # Wait for the Perobox report section to be visible and take a screenshot
    expect(page.locator("#relatorioPerobox.tab-content.active")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/perobox_report.png")
    print("Perobox report screenshot taken.")

    # --- Re-open menu for final navigation ---
    menu_toggle_button.click()
    print("Main menu opened a third time.")

    # --- Navigate to Sync History ---
    page.get_by_role("button", name="Administrativo").click()
    page.get_by_role("button", name="Histórico de Sincronização").click()

    # Wait for the Sync History section to be visible and take a screenshot
    expect(page.locator("#syncHistory.tab-content.active")).to_be_visible()
    page.screenshot(path="jules-scratch/verification/sync_history.png")
    print("Sync history screenshot taken.")

    print("Verification script completed successfully.")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)