from playwright.sync_api import sync_playwright
import time

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating...")
        page.goto("http://localhost:8000")

        print("Waiting for App...")
        try:
            page.wait_for_function("window.App", timeout=20000)
        except:
            print("Timeout waiting for App. Proceeding anyway to inspect state.")

        # 1. Show Update Modal
        print("Showing Update Modal...")
        page.evaluate("""() => {
            const announcement = {
                version: '2.5.0',
                title: 'Versão 2.5.0',
                content: ['Melhoria 1', 'Melhoria 2']
            };
            if (window.App && window.App.ui) {
                window.App.ui.showUpdateModal(announcement);
            } else {
                console.error("App.ui not found");
                // Fallback: manually toggle class
                const el = document.getElementById('updateModal');
                if(el) el.classList.add('show');
                // Fill content manually if App.ui didn't run
                document.getElementById('updateModalTitle').textContent = announcement.title;
            }
        }""")

        # Force styles just in case animations are slow
        page.add_style_tag(content="#updateModal.show { display: flex !important; opacity: 1 !important; }")

        time.sleep(2) # Give it a moment to render
        page.screenshot(path="verification/update_modal.png")
        print("Screenshot saved: verification/update_modal.png")

        # 2. Hide Update Modal and Show Welcome Modal
        print("Switching to Welcome Modal...")
        page.evaluate("""() => {
            document.getElementById('updateModal').classList.remove('show');
            document.getElementById('welcomeTourModal').classList.add('show');
        }""")

        page.add_style_tag(content="#welcomeTourModal.show { display: flex !important; opacity: 1 !important; }")

        time.sleep(2)
        page.screenshot(path="verification/welcome_modal.png")
        print("Screenshot saved: verification/welcome_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
