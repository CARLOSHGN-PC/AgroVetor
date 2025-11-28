from playwright.sync_api import sync_playwright
import time

def verify_os_manual_ui_css_integrated():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        # Inject mock data but NOT CSS (relying on docs/index.html)
        page.evaluate("""
            // Mock data
            const mockTalhoes = [
                {id: 1, name: 'Talhao 1', area: 10.5, variedade: 'RB867515'},
                {id: 2, name: 'Talhao 2', area: 5.2, variedade: 'CTC 4'},
                {id: 3, name: 'Talhao 3', area: 15.0, variedade: 'RB966928'},
            ];

            // Clear body and add a simple container
            document.body.innerHTML = '';
            let container = document.createElement('div');
            container.id = 'osPlotsList';
            container.className = 'talhao-selection-list';
            container.style.display = 'block'; // Force visible
            container.style.height = 'auto';
            document.body.appendChild(container);

            // Mock render function logic matching the app.js change
            mockTalhoes.forEach(talhao => {
                const label = document.createElement('label');
                label.className = 'talhao-selection-item';
                label.htmlFor = `os-plot-${talhao.id}`;

                label.innerHTML = `
                    <input type="checkbox" id="os-plot-${talhao.id}" checked>
                    <div class="talhao-name">${talhao.name}</div>
                    <div class="talhao-details">
                        <span><i class="fas fa-ruler-combined"></i>Área: ${talhao.area.toFixed(2)} ha</span>
                        <span><i class="fas fa-seedling"></i>Variedade: ${talhao.variedade}</span>
                    </div>
                `;
                container.appendChild(label);
            });
        """)

        # Check if styles are applied. For example, check if grid display is active on the label
        # or check computed style
        is_grid = page.evaluate("""
            window.getComputedStyle(document.querySelector('.talhao-selection-item')).display === 'grid'
        """)

        if not is_grid:
            print("CSS NOT APPLIED: .talhao-selection-item is not display: grid")
            # Force fail if css is missing
            exit(1)

        # Take screenshot of the component
        element = page.locator("#osPlotsList")
        element.screenshot(path="verification/os_manual_checkbox_ui_integrated.png")

        browser.close()

if __name__ == "__main__":
    verify_os_manual_ui_css_integrated()
