import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # 1. Navigate to the app
            await page.goto("http://localhost:8000", wait_until="domcontentloaded")
            await page.wait_for_function("window.App")

            # 2. Mock modules and user session BEFORE initialization
            await page.evaluate("""() => {
                window.App.native.init = () => console.log('Mocked App.native.init()');
                const user = {
                    uid: 'test-uid',
                    email: 'test@test.com',
                    username: 'testuser',
                    role: 'admin',
                    companyId: 'test-company',
                    active: true,
                    permissions: { dashboard: true, monitoramentoAereo: true, syncHistory: true }
                };
                window.App.state.currentUser = user;
                window.App.actions.saveUserProfileLocally(user);
            }""")

            # 3. Manually initialize the app
            await page.evaluate("window.App.init()")
            await page.evaluate("window.App.ui.showAppScreen()")

            # 4. Simulate being offline and create a trap record directly
            await context.set_offline(True)
            await page.evaluate("window.App.ui.showAlert('Simulating offline mode.', 'info')")

            # Directly call the function that creates the offline entry ONCE
            await page.evaluate("""() => {
                const feature = { properties: { "NM_IMOVEL": "TEST FARM", "CD_TALHAO": "T1" } };
                window.App.mapModule.installTrap(-21.5, -48.5, feature);
            }""")

            await page.wait_for_timeout(1000)

            # 5. Simulate going back online and trigger sync
            await context.set_offline(False)
            await page.evaluate("window.App.ui.showAlert('Simulating online mode.', 'info')")

            await page.evaluate("""async () => {
                window.firestoreSaves = [];
                window.App.data.addDocument = async (collection, data) => {
                     console.log('Mocked addDocument called with:', collection, data);
                     window.firestoreSaves.push({ collection, data });
                     return Promise.resolve({ id: 'fake-doc-id' });
                };
                await window.App.actions.syncOfflineWrites();
            }""")

            await page.wait_for_timeout(2000)

            # 6. Verify the number of saves to prevent duplicates
            save_count = await page.evaluate("window.firestoreSaves.length")

            # 7. Add a clear success or failure message to the page body for the screenshot
            if save_count == 1:
                success_message = "VERIFICATION SUCCESS: Offline sync attempted exactly once."
                print(success_message)
                await page.evaluate(f"document.body.innerHTML += '<div style=\"padding: 20px; color: green; background: lightgreen; border: 2px solid green; font-size:24px;position:absolute;top:10px;left:10px;z-index:9999;\">{success_message}</div>'")
            else:
                error_message = f"VERIFICATION FAILED: Expected 1 save, but got {save_count}. Duplication bug persists."
                print(error_message)
                await page.evaluate(f"document.body.innerHTML += '<div style=\"padding: 20px; color:red; background: lightpink; border: 2px solid red; font-size:24px;position:absolute;top:10px;left:10px;z-index:9999;\">{error_message}</div>'")
                raise Exception(error_message)

            # 8. Take screenshot
            await page.screenshot(path="jules-scratch/verification/verification.png")
            print("Verification script completed.")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())