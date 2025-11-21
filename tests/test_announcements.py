import pytest
from playwright.sync_api import Page, expect
import time

def test_announcements_flow(page: Page):
    page.goto("http://localhost:8000")

    # Wait for App to be initialized
    page.wait_for_function("window.App && window.App.state")

    # Mock Backend Data Calls to avoid hitting production DB
    page.evaluate("""() => {
        // Mock Firestore operations
        window.App.data.setDocument = async (collection, docId, data, options) => {
            console.log(`Mock setDocument: ${collection}/${docId}`, data);
            if (collection === 'global_configs' && docId === 'main') {
                window.App.state.globalConfigs = { ...window.App.state.globalConfigs, ...data };
            }
            return Promise.resolve();
        };

        window.App.data.addDocument = async (collection, data) => {
            console.log(`Mock addDocument: ${collection}`, data);
            if (collection === 'system_announcements') {
                // Mock fetching the latest announcement by storing it in a temporary test location
                window.__latestAnnouncement = data;
            }
            return Promise.resolve({ id: 'mock_id_' + Date.now() });
        };

        window.App.data.updateDocument = async (collection, docId, data) => {
             console.log(`Mock updateDocument: ${collection}/${docId}`, data);
             if (collection === 'users') {
                 // Update local user state to reflect changes
                 Object.assign(window.App.state.currentUser, data);
             }
             return Promise.resolve();
        };

        // Mock Query for Updates
        // We override checkAndShowUpdates to use our local mock variable instead of Firestore query
        const originalCheck = window.App.announcements.checkAndShowUpdates;
        window.App.announcements.checkAndShowUpdates = async () => {
            const user = window.App.state.currentUser;
            const latest = window.__latestAnnouncement;

            if (latest && Number(latest.version) > Number(user.lastSeenVersion || 0)) {
                const modal = window.App.elements.announcements.updateModal;
                modal.title.textContent = latest.title;
                modal.content.textContent = latest.description;
                modal.overlay.dataset.version = latest.version;
                modal.overlay.classList.add('show');
            }
        };
    }""")

    # --- 1. LOGIN AS SUPER ADMIN (BYPASS UI) ---
    page.evaluate("""() => {
        window.App.state.currentUser = {
            uid: 'super_admin_test',
            email: 'admin@test.com',
            role: 'super-admin',
            companyId: 'test_company',
            permissions: { superAdmin: true }
        };
        window.App.ui.showAppScreen();
        window.App.ui.renderMenu(); // Re-render menu with super-admin permissions
    }""")

    # Wait for dashboard/menu to render
    page.wait_for_selector("#menu")

    # --- 2. SUPER ADMIN: SET WELCOME MESSAGE ---
    # Navigate to "Gerenciar Empresas" (where we put the new UI)
    # Since we are bypassing login, we might need to manually show the tab
    page.evaluate("window.App.ui.showTab('gerenciarEmpresas')")

    welcome_msg = "Bem-vindo ao AgroVetor Teste Mockado!"
    page.fill("#welcomeMessageInput", welcome_msg)
    page.click("#btnSaveWelcomeMessage")

    # Verify state was updated via our mock
    saved_msg = page.evaluate("window.App.state.globalConfigs.welcomeMessage")
    assert saved_msg == welcome_msg

    # --- 3. SUPER ADMIN: PUBLISH UPDATE ---
    update_title = "Update Mock v100"
    update_desc = "Teste de update com mock."
    update_version = "100"

    page.fill("#announcementTitle", update_title)
    page.fill("#announcementVersion", update_version)
    page.fill("#announcementDescription", update_desc)
    page.click("#btnPublishAnnouncement")

    # Handle Confirmation Modal
    page.click("#confirmationModalConfirmBtn")

    # Verify our mock storage has the update
    latest_version_in_mock = page.evaluate("window.__latestAnnouncement.version")
    assert latest_version_in_mock == 100

    # --- 4. TEST USER: NEW USER (WELCOME) ---
    # Switch user context to a new user
    page.evaluate("""() => {
        window.App.state.currentUser = {
            uid: 'new_user_test',
            role: 'user',
            hasSeenWelcomeTour: false,
            lastSeenVersion: 0
        };
        // Close any open modals first
        document.querySelectorAll('.modal-overlay.show').forEach(el => el.classList.remove('show'));
    }""")

    # Trigger Sequence
    page.evaluate("window.App.announcements.checkSequence()")

    # Check Welcome Modal
    welcome_modal = page.locator("#welcomeModal")
    expect(welcome_modal).to_be_visible()
    expect(page.locator("#welcomeModalContent")).to_contain_text(welcome_msg)

    # Close Welcome Modal
    page.click("#btnCloseWelcomeModal")
    expect(welcome_modal).not_to_be_visible()

    # Verify flag updated
    user_seen = page.evaluate("window.App.state.currentUser.hasSeenWelcomeTour")
    assert user_seen is True

    # Note: checkSequence calls checkAndShowUpdates after welcome is closed.
    # Since we published v100 and user has v0, Update modal should appear immediately.
    update_modal = page.locator("#updateModal")
    expect(update_modal).to_be_visible()
    expect(page.locator("#updateModalTitle")).to_contain_text(update_title)

    # Close Update Modal
    page.click("#btnCloseUpdateModal")
    expect(update_modal).not_to_be_visible()

    # Verify version updated
    user_version = page.evaluate("window.App.state.currentUser.lastSeenVersion")
    assert user_version == 100
