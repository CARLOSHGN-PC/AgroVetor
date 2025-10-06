import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Get the absolute path of the index.html file
        import os
        file_path = os.path.abspath('index.html')

        # 1. Go to the local index.html file
        await page.goto(f'file://{file_path}')

        # Wait for the login form to be visible, which indicates the app is ready for login.
        await expect(page.locator('#loginForm')).to_be_visible(timeout=10000)
        print("Login form is visible.")

        # 2. Log in as Super Admin
        await page.locator('#loginUser').fill('admin@agrovetor.com')
        await page.locator('#loginPass').fill('agro@123')
        await page.locator('#btnLogin').click()

        # Wait for the app screen to be visible
        await expect(page.locator('#appScreen')).to_be_visible(timeout=20000)
        print("Login successful, app screen is visible.")

        # 3. Navigate to "Gerir Utilizadores" and take a screenshot
        await page.locator('#btnToggleMenu').click()
        # Click on 'Administrativo' submenu
        await page.get_by_role("button", name="Administrativo").click()
        # Click on 'Gerir Utilizadores'
        await page.get_by_role("button", name="Gerir Utilizadores").click()

        await expect(page.locator('#superAdminUserCreation')).to_be_visible()
        print("Company selector for user creation is visible.")
        await page.screenshot(path='jules-scratch/verification/01_super_admin_user_creation.png')
        print("Screenshot 1 taken.")

        # 4. Navigate to "Cadastros" and take a screenshot
        await page.locator('#btnToggleMenu').click()
        # Click on 'Administrativo' submenu again
        await page.get_by_role("button", name="Administrativo").click()
        # Click on 'Cadastros'
        await page.get_by_role("button", name="Cadastros").click()

        await expect(page.locator('#superAdminFarmCreation')).to_be_visible()
        print("Company selector for farm creation is visible.")
        await page.screenshot(path='jules-scratch/verification/02_super_admin_farm_creation.png')
        print("Screenshot 2 taken.")

        # 5. Navigate to "Cigarrinha (Amostragem)" and take a screenshot
        await page.locator('#btnToggleMenu').click()
        # Click on 'Lançamentos' submenu
        await page.get_by_role("button", name="Lançamentos").click()
        # Click on 'Monitoramento de Cigarrinha (Amostragem)'
        await page.get_by_role("button", name="Monitoramento de Cigarrinha (Amostragem)").click()

        await expect(page.locator('#adultoPresenteCigarrinhaAmostragem')).to_be_visible()
        print("'Adulto Presente' checkbox is visible.")
        await page.screenshot(path='jules-scratch/verification/03_cigarrinha_amostragem_adulto.png')
        print("Screenshot 3 taken.")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())