import re
from playwright.sync_api import Page, expect

def test_admin_manual_trap_install_flow_final(page: Page):
    """
    A definitive test to:
    1. Wait for the application to be fully loaded.
    2. Mock a local user profile and use the app's offline login flow.
    3. Verify that the admin password modal appears for manual trap installation.
    """
    # 1. Navigate to the application
    page.goto("http://localhost:8000", wait_until="load")

    # 2. Wait robustly for the application to be ready.
    expect(page.locator("#loginScreen")).to_be_visible(timeout=10000)
    page.wait_for_function("window.App && window.App.auth.loginOffline", timeout=5000)

    # 3. Use the app's own offline login flow by mocking the local user profiles.
    page.evaluate("""() => {
        const admin_permissions = {
            dashboard: true, monitoramentoAereo: true, relatorioMonitoramento: true,
            planejamentoColheita: true, planejamento: true, lancamentoBroca: true,
            lancamentoPerda: true, lancamentoCigarrinha: true, relatorioBroca: true,
            relatorioPerda: true, relatorioCigarrinha: true, lancamentoCigarrinhaPonto: true,
            relatorioCigarrinhaPonto: true, lancamentoCigarrinhaAmostragem: true,
            relatorioCigarrinhaAmostragem: true, excluir: true, gerenciarUsuarios: true,
            configuracoes: true, cadastrarPessoas: true, syncHistory: true
        };

        const mockAdminProfile = {
            uid: 'mock_admin_uid',
            email: 'admin@test.com',
            username: 'Admin User',
            role: 'admin',
            companyId: 'mock_company_id',
            permissions: admin_permissions
        };

        // Overwrite the function that gets local profiles to return our mock admin
        window.App.actions.getLocalUserProfiles = () => [mockAdminProfile];

        // Mock other necessary state
        window.App.state.companies = [{
            id: 'mock_company_id', name: 'Mock Company', active: true,
            subscribedModules: Object.keys(admin_permissions)
        }];
        window.App.state.globalConfigs = Object.keys(admin_permissions).reduce((acc, key) => {
            acc[key] = true; return acc;
        }, {});

        // Trigger the offline login using the mocked profile
        window.App.auth.loginOffline('mock_admin_uid');
    }""")

    # 4. Wait for the main app screen (dashboard) to be visible, confirming successful login.
    expect(page.locator("#dashboard")).to_be_visible(timeout=10000)

    # 5. Navigate to the map tab
    map_button = page.get_by_role("button", name="Monitoramento Aéreo")
    expect(map_button).to_be_visible()
    map_button.click()

    # 6. Click the "Add Trap" button
    add_trap_button = page.locator("#btnAddTrap")
    expect(add_trap_button).to_be_visible()
    add_trap_button.click()

    # 7. Click the "Manual Placement" button
    manual_placement_button = page.locator("#trapPlacementModalManualBtn")
    expect(manual_placement_button).to_be_visible()
    manual_placement_button.click()

    # 8. Assert that the admin password confirmation modal is now visible
    admin_modal = page.locator("#adminPasswordConfirmModal")
    expect(admin_modal).to_be_visible()
    expect(admin_modal.get_by_text("Confirmar Ação de Administrador")).to_be_visible()

    # 9. Take the final screenshot for visual verification
    page.screenshot(path="jules-scratch/verification/admin_trap_install_verification.png")