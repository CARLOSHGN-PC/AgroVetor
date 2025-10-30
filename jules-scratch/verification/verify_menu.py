import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("http://localhost:8000")

        # Login
        await page.fill("#loginUser", "test@gmail.com")
        await page.fill("#loginPass", "123456")
        await page.click("#btnLogin")

        # Wait for the main app screen to be visible
        await expect(page.locator("#appScreen")).to_be_visible(timeout=30000)

        # Open the main menu
        await page.click("#btnToggleMenu")
        await expect(page.locator("nav.menu.open")).to_be_visible()

        # Click on the 'Módulos' menu to open the submenu
        await page.click("button.menu-btn:has-text('Módulos')")
        await expect(page.locator(".submenu-content.active")).to_be_visible()

        # Take a screenshot of the open menu
        await page.screenshot(path="jules-scratch/verification/menu_verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
