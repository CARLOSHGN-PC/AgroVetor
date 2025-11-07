from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:8000")
        page.wait_for_selector("#splash-screen.hidden", state="attached")
        page.fill("#loginUser", "test@gmail.com")
        page.fill("#loginPass", "123456")
        page.click("button[type='submit']")
        page.wait_for_selector("#dashboard", state="visible")

        # Click the "Monitoramento Aéreo" menu
        page.click("text=Monitoramento Aéreo")

        # Click the "Pontos para OS" submenu item
        page.click("text=Pontos para OS")

        page.wait_for_selector("#listaPontosPlanejados", state="visible")
        page.screenshot(path="verification.png")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
