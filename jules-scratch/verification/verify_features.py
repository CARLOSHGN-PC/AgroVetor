import re
from playwright.sync_api import sync_playwright, Page, expect

def verify_support_mode_and_update_banner(page: Page):
    """
    This script verifies two features:
    1. The Super Admin "Support Mode" banner when impersonating a company.
    2. The visual appearance of the PWA update notification banner.
    """
    # --- Part 1: Verify Support Mode Banner ---

    # Go to the application
    page.goto("http://localhost:8000/")

    # Log in as super admin
    # Use the credentials provided by the user.
    page.locator("#loginUser").fill("admin@agrovetor.store")
    page.locator("#loginPass").fill("Carlos@12.")
    page.locator("#btnLogin").click()

    # Wait for the main app screen to be visible
    expect(page.locator("#appScreen")).to_be_visible(timeout=10000)

    # Open the Super Admin menu
    page.locator("button.menu-btn", has_text="Super Admin").click()

    # Click on "Gerir Empresas"
    page.locator("button.submenu-btn", has_text="Gerir Empresas").click()

    # Wait for the companies list and find the first "View As" button
    expect(page.locator("#companiesTable")).to_be_visible(timeout=10000)
    view_as_button = page.locator('button[data-action="view-as-company"]').first
    expect(view_as_button).to_be_visible()
    view_as_button.click()

    # Check for the impersonation banner
    impersonation_banner = page.locator("#impersonation-banner")
    expect(impersonation_banner).to_be_visible()
    expect(impersonation_banner).to_have_text(re.compile("Modo Suporte"))

    # Take a screenshot of the support mode banner
    page.screenshot(path="jules-scratch/verification/support_mode_verification.png")

    # --- Part 2: Verify Update Notification Banner ---

    # For verification purposes, we'll manually make the banner visible
    update_notification = page.locator("#update-notification")
    page.evaluate("document.getElementById('update-notification').style.display = 'flex'")

    # Check if the banner is now visible and has the correct text
    expect(update_notification).to_be_visible()
    expect(update_notification).to_contain_text("Uma nova versão está disponível!")

    # Take a screenshot of the update notification
    page.screenshot(path="jules-scratch/verification/update_notification_verification.png")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verify_support_mode_and_update_banner(page)
        browser.close()

if __name__ == "__main__":
    main()