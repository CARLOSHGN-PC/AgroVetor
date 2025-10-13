
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:8000")

    # Wait for the splash screen to be hidden
    page.wait_for_selector("#splash-screen.hidden", timeout=60000)

    # Mock user session
    page.evaluate("""() => {
        window.App.state.currentUser = {
            "uid": "mock-uid",
            "email": "test@example.com",
            "role": "admin",
            "permissions": {
                "dashboard": true,
                "monitoramentoAereo": true,
                "relatorioMonitoramento": true,
                "planejamentoColheita": true,
                "planejamento": true,
                "lancamentoBroca": true,
                "lancamentoPerda": true,
                "lancamentoCigarrinha": true,
                "relatorioBroca": true,
                "relatorioPerda": true,
                "relatorioCigarrinha": true,
                "lancamentoCigarrinhaPonto": true,
                "relatorioCigarrinhaPonto": true,
                "lancamentoCigarrinhaAmostragem": true,
                "relatorioCigarrinhaAmostragem": true,
                "excluir": true,
                "gerenciarUsuarios": true,
                "configuracoes": true,
                "cadastrarPessoas": true,
                "syncHistory": true,
                "apontamentoDiarioPlantio": true,
                "relatoriosPlantio": true,
                "frentePlantio": true
            }
        };
        window.App.ui.showAppScreen();
    }""")

    page.click("#btnToggleMenu")
    page.wait_for_timeout(500)
    page.click("text=Lançamentos")
    page.wait_for_timeout(500)
    page.click("text=Apontamento Diário de Plantio")
    page.screenshot(path="jules-scratch/verification/verification.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
