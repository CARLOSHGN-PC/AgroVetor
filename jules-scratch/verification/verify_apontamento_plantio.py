
from playwright.sync_api import sync_playwright, Page, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    try:
        context = browser.new_context()
        page = context.new_page()

        # Inject the mocked data before the page loads
        page.add_init_script("""
            window.addEventListener('DOMContentLoaded', () => {
                // Hide login, show app
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('appScreen').style.display = 'flex';

                // Set a user with all permissions
                window.App.state.currentUser = {
                    'uid': 'test-uid', 'email': 'test@test.com', 'role': 'admin',
                    'permissions': window.App.config.roles.admin
                };

                // Mock data for dropdowns
                window.App.state.fazendas = [{
                    'id': 'fazenda-1', 'code': 'F01', 'name': 'Fazenda Teste',
                    'talhoes': [
                        {'id': 'talhao-1', 'name': 'T01', 'area': 100},
                        {'id': 'talhao-2', 'name': 'T02', 'area': 150}
                    ]
                }];
                window.App.state.frentesDePlantio = [
                    {'id': 'frente-1', 'name': 'Frente 01', 'provider': 'Fornecedor A'}
                ];
                window.App.state.personnel = [
                    {'id': 'person-1', 'matricula': '123', 'name': 'João da Silva'}
                ]

                // Re-render UI with mocked data
                window.App.ui.renderMenu();
                window.App.ui.populateFazendaSelects();
                window.App.ui.populateFrenteDePlantioSelect();
            });
        """)

        page.goto("http://localhost:8000")
        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(2)


        # Navigate to the correct page
        page.get_by_role("button", name="Abrir menu").click()
        page.get_by_role("button", name="Lançamentos").click()
        page.get_by_role("button", name="Apontamento de Plantio").click()

        # Wait for the form to be visible
        expect(page.get_by_role("heading", name="Apontamento Diário de Plantio")).to_be_visible()

        # Fill out the main form fields
        page.get_by_label("Frente de Plantio:").select_option(label="Frente 01")

        # Check that provider is filled automatically
        expect(page.get_by_label("Prestador:")).to_have_value("Fornecedor A")

        page.get_by_label("Matrícula do Líder:").fill("123")
        # Check that leader name is found
        expect(page.get_by_text("João da Silva")).to_be_visible()

        page.get_by_label("Nome da Fazenda:").select_option(label="F01 - Fazenda Teste")
        page.get_by_label("Data da Operação:").fill("2025-10-26")
        page.get_by_label("Chuva (mm):").fill("15")

        # Add a planting record
        page.get_by_role("button", name="Adicionar Lançamento").click()

        # Interact with the newly added record card (it's the first and only one)
        record_card = page.locator(".amostra-card").first

        # The talhao select should be populated because of the farm selection change handler
        talhao_select = record_card.get_by_label("Talhão:")
        expect(talhao_select).to_contain_text("T01")
        talhao_select.select_option(label="T01")

        # The info div will not be updated due to the firestore call, so we don't assert its content.
        # But we can check that it exists.
        expect(record_card.locator(".info-display")).to_be_visible()

        record_card.get_by_label("Variedade Plantada:").fill("Nova Variedade")
        record_card.get_by_label("Área Plantada (ha):").fill("10")

        page.get_by_label("Observações:").fill("Esta é uma observação de teste.")

        # Final screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
