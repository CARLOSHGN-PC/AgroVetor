import asyncio
from playwright.async_api import async_playwright
import sys

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Capture console logs
        page.on('console', lambda msg: print(f'CONSOLE: {msg.text}'))
        # Capture page errors
        page.on('pageerror', lambda err: print(f'PAGE ERROR: {err}'))

        try:
            print("Navigating to the application...")
            await page.goto('http://localhost:8000', timeout=60000)

            print("Waiting for splash screen to be hidden...")
            await page.wait_for_selector('#splash-screen.hidden', timeout=10000)
            print("Splash screen is hidden.")

            print("Waiting for login screen to be visible...")
            await page.wait_for_selector('#loginScreen', state='visible', timeout=10000)
            print("Login screen is visible.")

            print("Attempting to log in...")
            await page.fill('#loginUser', 'test@gmail.com')
            await page.fill('#loginPass', '123456')
            await page.click('#btnLogin')
            print("Login button clicked.")

            print("Waiting for app screen to be visible...")
            await page.wait_for_selector('#appScreen', state='visible', timeout=20000)
            print("App screen is visible.")

            print("Waiting for a key element in the dashboard...")
            await page.wait_for_selector('#dashboard-selector', state='visible', timeout=20000)

            print("SUCCESS: Application loaded and dashboard is visible after login.")

        except Exception as e:
            print(f"AN ERROR OCCURRED: {e}", file=sys.stderr)
            sys.exit(1)
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
