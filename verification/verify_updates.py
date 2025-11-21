from playwright.sync_api import sync_playwright
import time

def verify_update_manager():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set viewport big enough to see the menu
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        # Navigate to the app
        page.goto("http://localhost:8000/docs/index.html")

        # Wait for App to be defined
        page.wait_for_function("window.App && window.App.ui")

        # Mock the necessary state to bypass login and simulate Super Admin
        page.evaluate("""
            // Mock user and state
            window.App.state.currentUser = {
                uid: 'test-super-admin',
                email: 'superadmin@test.com',
                role: 'super-admin',
                permissions: {},
                active: true
            };
            window.App.state.companies = [
                { id: 'comp1', name: 'Empresa Teste 1', active: true },
                { id: 'comp2', name: 'Empresa Teste 2', active: true }
            ];

            // Force UI into "Logged In" state
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appScreen').style.display = 'flex';

            // Render the menu explicitly
            App.ui.renderMenu();
        """)

        # Open the menu explicitly to ensure visibility
        page.click("#btnToggleMenu")
        time.sleep(0.5) # Wait for animation

        # Wait for the menu to be visible (checking if child buttons exist)
        page.wait_for_selector("#menu button.menu-btn")

        # Click on "Super Admin" to expand submenu
        super_admin_btn = page.locator('button.menu-btn', has_text='Super Admin')
        super_admin_btn.click()

        # Wait for submenu expansion animation
        time.sleep(1)

        # Click on "Gerenciar Atualizações"
        update_btn = page.locator('button.submenu-btn', has_text='Gerenciar Atualizações')
        update_btn.click()

        # Wait for the "Gerenciar Atualizações" section to become active
        page.wait_for_selector("#gerenciarAtualizacoes.active")

        # Screenshot of the Management Screen
        page.screenshot(path="verification/update_management_screen.png")

        # --- Verify Modal Styling ---

        # Open "What's New" Modal (Update Modal)
        page.evaluate("""
            App.ui.showUpdateModal({
                version: '2.0.0',
                title: 'Design Moderno e Mais Rápido',
                content: ['Novo layout visual.', 'Melhoria de performance.', 'Correção de bugs.']
            });
        """)

        # Wait for modal animation
        time.sleep(1)
        page.screenshot(path="verification/update_modal_style.png")

        # Close Update Modal
        page.evaluate("document.getElementById('updateModal').classList.remove('show')")
        time.sleep(0.5)

        # Open Welcome Tour Modal
        page.evaluate("document.getElementById('welcomeTourModal').classList.add('show')")

        time.sleep(1)
        page.screenshot(path="verification/welcome_tour_style.png")

        browser.close()

if __name__ == "__main__":
    verify_update_manager()
