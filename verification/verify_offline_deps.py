from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mocking offline context by failing requests if necessary or just checking caching logic
        # For this verification, we just want to ensure the app loads without console errors
        # related to missing dependencies which would trigger the infinite loop logic.

        context = browser.new_context()
        page = context.new_page()

        # Capture console errors
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("Navigating to app...")
        # Assuming the server is running on port 8000
        try:
            page.goto("http://localhost:8000")

            # Wait for App to be initialized
            page.wait_for_function("window.App && window.App.state")

            print("App loaded. Checking for 'turf'...")
            # Check if Turf is available globally (it should be via script tag)
            is_turf_loaded = page.evaluate("typeof turf !== 'undefined'")
            print(f"Turf loaded: {is_turf_loaded}")

            # Simulate the function call that was causing the crash
            print("Testing findTalhaoFromLocation resilience...")

            # Mock state for the test
            page.evaluate("""
                window.App.state.geoJsonData = { features: [] };
                // Call the function with a dummy position
                window.App.mapModule.findTalhaoFromLocation({lng: -48.0, lat: -21.0});
            """)

            print("Function called. Checking for crash/loops...")
            # If we are here, it didn't crash the browser thread.

            # Check if the modal was closed (success path for empty features or defensive catch)
            # The function calls hideTrapPlacementModal() in the catch block or failure path
            # We can check if the modal has 'show' class.

            modal_visible = page.evaluate("""
                document.getElementById('trapPlacementModal').classList.contains('show')
            """)
            print(f"Trap modal visible (should be False or handle failure gracefully): {modal_visible}")

            page.screenshot(path="verification/verification.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()

        if console_errors:
            print("Console Errors found:")
            for err in console_errors:
                print(f"- {err}")

if __name__ == "__main__":
    run()
