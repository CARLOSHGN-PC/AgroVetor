import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Get the absolute path to the index.html file
    import os
    file_path = os.path.abspath('index.html')

    page.goto(f"file://{file_path}")

    # 1. Login
    # The app's JS initialization is not running consistently from a local file.
    # We'll manually trigger the function to show the login screen to bypass this.
    page.wait_for_function("() => window.App && window.App.ui.showLoginScreen", timeout=10000)
    page.evaluate("() => window.App.ui.showLoginScreen()")

    # Using a known test user. In a real scenario, this would be a dedicated test account.
    page.locator("#loginUser").fill("admin@agrovetor.com")
    page.locator("#loginPass").fill("123456")
    page.locator("#btnLogin").click()

    # Wait for the main app screen to be visible after login
    expect(page.locator("#appScreen")).to_be_visible(timeout=10000)
    print("Login successful.")

    # 2. Navigate to Perobox Entry Form
    page.locator("button", has_text="Lançamentos").click()
    page.locator("button", has_text="Instalação Perobox").click()

    # 3. Verify Perobox Form UI
    # Wait for the section to be visible
    lancamento_perobox_section = page.locator("#lancamentoPerobox")
    expect(lancamento_perobox_section).to_be_visible(timeout=5000)

    # Check for the main title
    expect(lancamento_perobox_section.locator("h2", has_text="Lançamento Perobox")).to_be_visible()
    print("Navigated to Perobox form.")

    # Check for the pending collections section
    expect(lancamento_perobox_section.locator("h3", has_text="Coletas Pendentes (7 dias)")).to_be_visible()

    # Check for the "Adicionar Ponto" button
    add_ponto_btn = lancamento_perobox_section.locator("#addPontoPeroboxBtn")
    expect(add_ponto_btn).to_be_visible()

    # 4. Test Dynamic Point Creation
    add_ponto_btn.click()

    # Verify that a new point card has been added
    pontos_container = lancamento_perobox_section.locator("#pontosPeroboxContainer")
    # Check that there is a card with the text "Ponto 1"
    expect(pontos_container.locator(".amostra-card", has_text="Ponto 1")).to_be_visible()
    print("Successfully added a new collection point.")

    # 5. Take a screenshot of the form
    page.screenshot(path="jules-scratch/verification/perobox_form_verification.png")
    print("Screenshot of the Perobox form taken.")

    # 6. Navigate to Perobox Report Page
    page.locator("button", has_text="Relatórios").click()
    page.locator("button", has_text="Relatório Perobox").click()

    # 7. Verify Report UI
    relatorio_perobox_section = page.locator("#relatorioPerobox")
    expect(relatorio_perobox_section).to_be_visible(timeout=5000)
    expect(relatorio_perobox_section.locator("h2", has_text="Relatório Perobox")).to_be_visible()
    print("Navigated to Perobox report page.")

    # Take screenshot of the report page
    page.screenshot(path="jules-scratch/verification/perobox_report_verification.png")
    print("Screenshot of the Perobox report page taken.")

    # Close browser
    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)