from playwright.sync_api import sync_playwright, expect

def verify_frontend():
    with sync_playwright() as p:
        # 1. Start the browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 2. Navigate to the app
        print("Navigating to http://localhost:8000...")
        page.goto("http://localhost:8000")

        # 3. Wait for App initialization (increase timeout just in case)
        try:
            page.wait_for_function("window.App && window.App.state", timeout=15000)
            print("App initialized.")
        except Exception as e:
            print(f"App initialization failed: {e}")
            # Take screenshot of failure state
            page.screenshot(path="verification/failure_init.png")
            browser.close()
            return

        # 4. Inject state to SHOW the Update Modal
        print("Injecting state for Update Modal...")
        page.evaluate("""() => {
            const testAnnouncement = {
                version: '2.5.0',
                title: 'Novidades da Versão 2.5',
                content: ['Melhoria de Performance', 'Novo Relatório de Clima', 'Correções de Bugs']
            };
            // Manually trigger the modal function
            window.App.ui.showUpdateModal(testAnnouncement);
        }""")

        # 5. Take Screenshot of Update Modal
        print("Taking screenshot of Update Modal...")
        # Wait for modal animation/display
        page.wait_for_selector("#updateModal.show", state="visible", timeout=5000)
        page.screenshot(path="verification/update_modal.png")
        print("Saved verification/update_modal.png")

        # 6. Close the modal
        page.evaluate("document.getElementById('updateModal').classList.remove('show')")

        # 7. Inject state to SHOW the Welcome Tour Modal
        print("Injecting state for Welcome Tour...")
        page.evaluate("""() => {
            // Force show the welcome modal
            document.getElementById('welcomeTourModal').classList.add('show');
        }""")

        # 8. Take Screenshot of Welcome Modal
        print("Taking screenshot of Welcome Modal...")
        page.wait_for_selector("#welcomeTourModal.show", state="visible", timeout=5000)
        page.screenshot(path="verification/welcome_modal.png")
        print("Saved verification/welcome_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
