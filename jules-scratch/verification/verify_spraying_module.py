import os
from playwright.sync_api import sync_playwright, expect
import time

def run_verification(playwright):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
    index_html_path = os.path.join(project_root, 'index.html')
    file_url = f'file://{index_html_path}'

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto(file_url, wait_until='domcontentloaded')

        # Wait for either the login screen or the main app screen to become visible
        # This is a robust way to handle the initial authentication check.
        page.locator("#loginBox, #appScreen").first.wait_for(state="visible", timeout=15000)

        login_box = page.locator("#loginBox")

        # If the login box is visible, perform the login steps.
        if login_box.is_visible():
            print("Login box is visible. Performing login.")
            login_box.get_by_label("Email").fill("admin@agrovetor.com")
            login_box.get_by_label("Senha").fill("123456")
            login_box.get_by_role("button", name="LOGIN").click()
        else:
            print("App screen is already visible. Skipping login.")

        # Now, we can be sure the app screen is visible
        expect(page.locator("#appScreen")).to_be_visible(timeout=10000)
        print("Login successful, app screen is visible.")

        # 3. Navigate to Gestão de Pulverização
        page.get_by_label("Abrir menu").click()
        time.sleep(0.5)
        page.get_by_role("button", name="Gestão de Pulverização").click()
        time.sleep(0.5)
        page.get_by_role("button", name="Ordem de Serviço").click()

        # 4. Verify the new screen is visible and take a screenshot
        spraying_module_container = page.locator("#gestaoPulverizacao")
        expect(spraying_module_container).to_be_visible(timeout=5000)
        print("Spraying management module is visible.")

        expect(page.get_by_label("Piloto Responsável:")).to_be_visible()
        expect(page.locator("#os-list")).to_be_visible()
        expect(page.locator("#pulverizacao-map-container")).to_be_visible()

        screenshot_path = os.path.join(current_dir, "spraying_module.png")
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # 5. Navigate to the new Report page
        page.get_by_label("Abrir menu").click()
        time.sleep(0.5)
        page.get_by_role("button", name="Relatórios").click()
        time.sleep(0.5)
        page.get_by_role("button", name="Rel. de Pulverização").click()

        report_section = page.locator("#relatorioPulverizacao")
        expect(report_section).to_be_visible(timeout=5000)
        print("Spraying report page is visible.")

        expect(page.get_by_label("Ordem de Serviço Analisada:")).to_be_visible()
        screenshot_report_path = os.path.join(current_dir, "spraying_report_page.png")
        page.screenshot(path=screenshot_report_path)
        print(f"Screenshot of report page saved to {screenshot_report_path}")

        # 6. Navigate to the Dashboard to check the card
        page.get_by_label("Abrir menu").click()
        time.sleep(0.5)
        page.get_by_role("button", name="Dashboard").click()

        dashboard_card = page.locator("#card-aerea")
        expect(dashboard_card).to_be_visible(timeout=5000)
        expect(dashboard_card.locator("h3")).to_have_text("Pulverização")
        print("Dashboard card is visible and has the correct title.")

        screenshot_dashboard_path = os.path.join(current_dir, "dashboard_card.png")
        page.screenshot(path=screenshot_dashboard_path)
        print(f"Screenshot of dashboard saved to {screenshot_dashboard_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path=os.path.join(current_dir, "verification_error.png"))
    finally:
        context.close()
        browser.close()

with sync_playwright() as p:
    run_verification(p)
