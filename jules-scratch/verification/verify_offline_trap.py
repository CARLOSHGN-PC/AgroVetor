import json
from playwright.sync_api import sync_playwright, expect, Page

def run_verification(page: Page):
    """
    This script verifies that the trap installation now works offline.
    """
    # 1. Go to the app hosted by the simple server
    page.goto("http://localhost:8000")

    # 2. Mock a complete user session to bypass login and Firebase dependencies.
    # A more robust mock is needed to ensure the UI initializes correctly.
    mock_user = {
        "uid": "test-user-id-123",
        "email": "test.user@example.com",
        "username": "Offline Tester",
        "companyId": "test-company-id-456",
        "role": "admin",
        "permissions": {"monitoramentoAereo": True, "dashboard": True} # Grant necessary permissions
    }

    mock_company = {
        "id": "test-company-id-456",
        "name": "Test Company",
        "subscribedModules": ["monitoramentoAereo", "dashboard"] # Grant access to modules
    }

    mock_global_configs = {
        "monitoramentoAereo": True, # Ensure the feature is globally active
        "dashboard": True
    }

    # Inject the necessary state into the App object
    page.evaluate(f"window.App.state.currentUser = {json.dumps(mock_user)}")
    page.evaluate(f"window.App.state.companies = [{json.dumps(mock_company)}]")
    page.evaluate(f"window.App.state.globalConfigs = {json.dumps(mock_global_configs)}")

    # Show the main app screen and explicitly navigate to the correct tab
    page.evaluate("window.App.ui.showAppScreen()")
    page.evaluate("window.App.ui.showTab('monitoramentoAereo')")

    # Wait for the map container to be visible, which is the key element for this module
    expect(page.locator("#map")).to_be_visible(timeout=10000)

    # 3. Simulate being offline for the rest of the test
    page.context.set_offline(True)

    # Show a temporary alert to confirm offline mode is on for the screenshot
    page.evaluate("window.App.ui.showAlert('Network is now OFFLINE for this test.', 'warning', 6000)")
    expect(page.locator("#alertContainer")).to_have_text("Network is now OFFLINE for this test.")

    # 4. Directly call the `installTrap` function with mock data.
    # This bypasses complex UI interactions (like map clicks) and directly tests
    # the core logic that was changed: saving an installation offline.
    mock_feature = {
        "properties": {
            "NM_FAZENDA": "Fazenda Teste Offline",
            "CD_TALHAO": "T-99-OFFLINE"
        }
    }

    # Execute the function within the page's context
    page.evaluate(f"""
        window.App.mapModule.installTrap(
            -21.123,
            -48.456,
            {json.dumps(mock_feature)}
        )
    """)

    # 5. Assert that the correct "saved offline" message appears.
    # This is the most critical part of the verification.
    alert_locator = page.locator("#alertContainer")
    expect(alert_locator).to_have_text("Armadilha guardada offline em T-99-OFFLINE. Será sincronizada quando houver conexão.")
    expect(alert_locator).to_have_class("show info")

    # 6. Take a screenshot for visual confirmation of the final state.
    page.screenshot(path="jules-scratch/verification/offline_trap_verification.png")
    print("Verification script completed and screenshot taken.")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
        except Exception as e:
            print(f"An error occurred during verification: {e}")
            # Take a screenshot on error to help debug
            page.screenshot(path="jules-scratch/verification/error_screenshot.png")
            # Re-raise the exception to make the script fail
            raise
        finally:
            browser.close()

if __name__ == "__main__":
    main()