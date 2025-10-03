import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # 1. Go to the application's index.html
        import os
        await page.goto(f"file://{os.getcwd()}/index.html")

        # 2. Wait for the main app screen to be attached to the DOM.
        # This is a more reliable way to know the initial load is done.
        await page.wait_for_selector("#appScreen", state='attached', timeout=15000)

        # 3. Force the UI into the desired state using JavaScript
        await page.evaluate("""() => {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appScreen').style.display = 'flex';
            document.querySelectorAll('.tab-content.active').forEach(tab => tab.classList.remove('active'));
            const peroboxTab = document.getElementById('instalacaoPerobox');
            if (peroboxTab) {
                peroboxTab.classList.add('active');
                peroboxTab.hidden = false;
            }
        }""")

        # 4. Verify that the Perobox form is now visible
        perobox_section = page.locator("#instalacaoPerobox")
        await expect(perobox_section).to_be_visible(timeout=5000)
        await expect(perobox_section.locator("h2")).to_have_text("Instalação/Coleta Perobox")

        # 5. Take a screenshot for visual verification
        await page.screenshot(path="jules-scratch/verification/perobox_form_verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())