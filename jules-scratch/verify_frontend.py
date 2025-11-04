import asyncio
from playwright.async_api import async_playwright
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # Start the server
            server_process = await asyncio.create_subprocess_shell(
                'python3 -m http.server 8000 --directory docs &',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            print("Started server")

            # Wait for the server to be ready
            await asyncio.sleep(5)

            await page.goto("http://localhost:8000")

            # Wait for the splash screen to disappear
            await page.wait_for_selector('#splash-screen.hidden', timeout=30000)

            # Take a screenshot
            await page.screenshot(path="jules-scratch/screenshot.png")
            print("Took screenshot")

        finally:
            # Stop the server
            await asyncio.create_subprocess_shell('pkill -f http.server')
            print("Stopped server")
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
