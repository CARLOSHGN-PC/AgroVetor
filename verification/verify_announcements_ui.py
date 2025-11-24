
from playwright.sync_api import sync_playwright
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Navigate to the app
    page.goto("http://localhost:8000")

    # Wait for app initialization
    page.wait_for_function("window.App && window.App.state")

    # Mock data and inject announcement to force the modal to appear
    page.evaluate("""() => {
        // 1. Mock User
        window.App.state.currentUser = {
            uid: 'test_user_welcome',
            email: 'user@test.com',
            role: 'user',
            companyId: 'test_company',
            hasSeenWelcomeTour: false, // Ensure welcome tour can trigger
            lastSeenVersion: '0.0.0'
        };

        // 2. Mock System Announcement Data
        // We hook into the query/getDocs function or just manually trigger the logic if possible.
        // Since we can't easily mock the inner workings of `getDocs` from outside without complex interception,
        // we will manually invoke the method that shows the modal to verify the UI.

        // Mock the elements reference if needed, but they should be live.

        // Manually trigger Welcome Modal
        const welcomeModal = window.App.elements.announcements.welcomeModal;
        welcomeModal.overlay.classList.add('show');
    }""")

    # Wait for modal animation
    page.wait_for_timeout(1000)

    # Take screenshot of Welcome Modal
    page.screenshot(path="verification/welcome_modal.png")
    print("Screenshot taken: verification/welcome_modal.png")

    # Close welcome modal and trigger Update Modal
    page.evaluate("""() => {
        const welcomeModal = window.App.elements.announcements.welcomeModal;
        welcomeModal.overlay.classList.remove('show');

        const updateModal = window.App.elements.announcements.updateModal;
        updateModal.title.textContent = "Novidades da Versão 2.0";
        updateModal.body.innerHTML = "<p>Teste de atualização com <strong>HTML</strong>.</p>";
        updateModal.versionDisplay.textContent = "Versão 2.0.0";
        updateModal.overlay.classList.add('show');
    }""")

    page.wait_for_timeout(1000)
    page.screenshot(path="verification/update_modal.png")
    print("Screenshot taken: verification/update_modal.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
