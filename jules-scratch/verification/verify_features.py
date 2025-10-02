import asyncio
import os
import subprocess
import time
from playwright.async_api import async_playwright, expect

async def main():
    # --- Start a local server ---
    port = 8000
    server_process = subprocess.Popen(
        ['python', '-m', 'http.server', str(port)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, preexec_fn=os.setsid
    )
    time.sleep(2)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(f'http://localhost:{port}/index.html')

            # Wait for the main App object to be initialized on the window
            await page.wait_for_function("() => typeof window.App !== 'undefined'", timeout=15000)
            print("App object is ready.")

            # --- 1. Bypass Login and Mock User State ---
            await page.evaluate('''() => {
                App.state.currentUser = {
                    uid: 'test-user-id',
                    email: 'test@example.com',
                    username: 'Test User',
                    role: 'admin',
                    companyId: 'test-company-id',
                    permissions: App.config.roles.admin
                };
                App.state.companies = [{ id: 'test-company-id', name: 'Test Company', subscribedModules: Object.keys(App.config.roles.admin) }];
                App.state.globalConfigs = {
                    ...App.config.roles.admin,
                    superAdmin: true
                };
                App.ui.showAppScreen();
            }''')

            await expect(page.locator("#appScreen")).to_be_visible(timeout=15000)
            print("Login bypassed and app screen is visible.")

            # --- 2. Create Test Data (Farm and Plot) ---
            await page.evaluate('''() => {
                const farm = {
                    id: 'farm-9901',
                    code: '9901',
                    name: 'FAZENDA VERIFICACAO',
                    companyId: 'test-company-id',
                    talhoes: [{
                        id: 'talhao-01',
                        name: 'TALHAO-VER-01',
                        area: 15,
                        tch: 90,
                        producao: 1350,
                        variedade: 'TEST-VAR'
                    }]
                };
                App.state.fazendas.push(farm);
                App.ui.populateFazendaSelects();
            }''')
            print("Test data created.")

            # --- 3. Create a Sync Queue Entry ---
            await page.locator("#btnToggleMenu").click()
            await page.get_by_role("button", name="Lançamentos").click()
            await page.get_by_role("button", name="Lançamento Broca").click()

            await page.locator("#codigo").select_option(label="9901 - FAZENDA VERIFICACAO")
            await page.locator("#talhao").fill("TALHAO-VER-01")
            await page.locator("#entrenos").fill("200")
            await page.locator("#brocaBase").fill("10")
            await page.locator("#brocaMeio").fill("5")
            await page.locator("#brocaTopo").fill("1")

            await page.locator("#btnSalvarBrocamento").click()
            await page.locator("#confirmationModalConfirmBtn").click()
            await expect(page.locator("#alertContainer.show.success")).to_be_visible()
            print("Sync queue entry created.")

            # --- 4. Verify Item in Sync Queue ---
            await page.locator("#btnToggleMenu").click()
            await page.get_by_role("button", name="Administrativo").click()
            await page.get_by_role("button", name="Fila de Sincronização").click()

            await expect(page.locator("#fila-sincronizacao")).to_be_visible()

            queue_item = page.locator(".plano-card", has_text="Lançamento Broca")
            await expect(queue_item).to_contain_text("FAZENDA VERIFICACAO")
            await expect(queue_item).to_contain_text("TALHAO-VER-01")
            await expect(queue_item).to_contain_text("Pendente")

            await page.screenshot(path="jules-scratch/verification/verification.png")
            print("Sync queue verified.")

            # --- 5. Verify Editing ---
            await queue_item.get_by_role("button", name="Editar").click()

            await expect(page.locator("#lancamentoBroca")).to_be_visible()
            await expect(page.locator("#entrenos")).to_have_value("200")
            await expect(page.locator("#brocaBase")).to_have_value("10")

            await page.screenshot(path="jules-scratch/verification/verification_edit_view.png")
            print("Editing view verified.")

            await browser.close()

    finally:
        os.killpg(os.getpgid(server_process.pid), 9)
        print("Server stopped.")

if __name__ == "__main__":
    asyncio.run(main())