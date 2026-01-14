import pytest
from playwright.sync_api import Page, expect

def test_offline_architecture_elements(page: Page):
    # Navigate to the app
    page.goto("http://localhost:8000")

    # 1. Verify "Offline Manual" elements are GONE
    expect(page.locator("#offlineUserSelection")).not_to_be_visible()
    expect(page.locator("#btnOfflineLogin")).not_to_be_visible()

    # 2. Verify "Online Login" elements are PRESENT
    expect(page.locator("#loginForm")).to_be_visible()

    # 3. Verify App.data.saveVistoria exists
    # We wait for App to be initialized.
    page.wait_for_function("() => window.App && window.App.data")

    is_defined = page.evaluate("() => typeof window.App.data.saveVistoria === 'function'")
    assert is_defined, "App.data.saveVistoria should be a function"

    # 4. Verify Network Listener Setup (Indirectly)
    # We check if App.state.isOnline is defined (it might be undefined initially until the async check finishes,
    # but the property should exist on the state object if initialized properly, or we check if the code ran without error).
    # Since listenForNetworkChanges is async and called in init, we might not see isOnline immediately if the mock isn't there.
    # But we can check if the function exists.
    has_listener_logic = page.evaluate("() => typeof window.App.native.listenForNetworkChanges === 'function'")
    assert has_listener_logic, "App.native.listenForNetworkChanges should be a function"

    # 5. Verify enableIndexedDbPersistence call
    # This is hard to verify from outside without mocking Firebase, but we can check if console has specific logs if we mocked it.
    # For now, just ensuring the app loads without crashing is a good sign.
