from playwright.sync_api import sync_playwright, expect
import time
import re

def verify_fleet_ui():
    with sync_playwright() as p:
        # Set a large viewport to ensure menu is visible (desktop mode)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        try:
            # 1. Navigate to the app
            page.goto("http://localhost:8000")

            # 2. Wait for App to be initialized
            page.wait_for_function("window.App && window.App.state")

            # 3. Mock User Session with Fleet permissions
            page.evaluate("""
                window.App.state.currentUser = {
                    uid: 'test-uid',
                    email: 'test@example.com',
                    role: 'admin',
                    companyId: 'test-company',
                    active: true,
                    permissions: {
                        gestaoFrota: true,
                        controleKM: true
                    }
                };
                window.App.state.globalConfigs = {
                    gestaoFrota: true,
                    controleKM: true
                };
                window.App.state.companies = [{
                    id: 'test-company',
                    name: 'Test Company',
                    subscribedModules: ['gestaoFrota', 'controleKM']
                }];
                // Force menu render
                window.App.ui.renderMenu();
                window.App.ui.showAppScreen();
            """)

            # 4. Check for 'Frota' menu item
            # Use a more specific selector if possible, or wait for visibility
            fleet_menu_btn = page.locator("button.menu-btn:has-text('Frota')")

            # Explicitly wait for it to be visible
            # expect(fleet_menu_btn).to_be_visible() # Might be hidden in off-canvas

            # Open menu
            page.click("#btnToggleMenu")
            # Wait for menu to slide in (check for 'open' class on nav)
            expect(page.locator("nav.menu")).to_have_class(re.compile(r"open"))

            # Now click Frota
            fleet_menu_btn.click()

            # 5. Check for Submenus
            km_control_btn = page.locator("button.submenu-btn:has-text('Controle de KM')")
            fleet_mgmt_btn = page.locator("button.submenu-btn:has-text('Gestão de Frota')")
            expect(km_control_btn).to_be_visible()
            expect(fleet_mgmt_btn).to_be_visible()

            # 6. Verify 'Gestão de Frota' section
            fleet_mgmt_btn.click()
            expect(page.locator("#gestaoFrota")).to_be_visible()
            # Use strict=False or index to avoid multiple element error, but simpler to target the first one or specific text
            expect(page.locator("#gestaoFrota h2").first).to_contain_text("Gestão de Frota")

            # Take screenshot of Fleet Management
            page.screenshot(path="jules-scratch/fleet_management.png")

            # 7. Verify 'Controle de KM' section
            # Re-open menu
            page.click("#btnToggleMenu")

            # Let's see if we are still in submenu.
            if km_control_btn.is_visible():
                km_control_btn.click()
            else:
                # Navigate again
                fleet_menu_btn.click()
                km_control_btn.click()

            expect(page.locator("#controleKM")).to_be_visible()
            # Fix strict mode violation by targeting the first h2 inside the section
            expect(page.locator("#controleKM h2").first).to_contain_text("Controle de KM")

            # Take screenshot of KM Control
            page.screenshot(path="jules-scratch/km_control.png")

            print("Verification Successful!")

        except Exception as e:
            print(f"Verification Failed: {e}")
            page.screenshot(path="jules-scratch/error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_fleet_ui()
