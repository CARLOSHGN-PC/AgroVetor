from playwright.sync_api import sync_playwright
import time

def verify_os_manual_select_all_btn():
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

            // Add the button container
            let btnContainer = document.createElement('div');
            btnContainer.style.paddingLeft = '5px';
            btnContainer.style.marginBottom = '10px';
            btnContainer.innerHTML = `
                <button id="btnToggleSelectAll" class="btn-secondary" style="width: 100%; justify-content: center; background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border);">
                    <i class="fas fa-check-double"></i> Selecionar Todos
                </button>
            `;
            document.body.appendChild(btnContainer);

            // Add the list container
            let container = document.createElement('div');
            container.id = 'osPlotsList';
            container.className = 'talhao-selection-list';
            container.style.display = 'block'; // Force visible
            container.style.height = 'auto';
            document.body.appendChild(container);

            // Render items
            mockTalhoes.forEach(talhao => {
                const label = document.createElement('label');
                label.className = 'talhao-selection-item';
                label.htmlFor = `os-plot-${talhao.id}`;

                label.innerHTML = `
                    <input type="checkbox" id="os-plot-${talhao.id}">
                    <div class="talhao-name">${talhao.name}</div>
                    <div class="talhao-details">
                        <span><i class="fas fa-ruler-combined"></i>Área: ${talhao.area.toFixed(2)} ha</span>
                        <span><i class="fas fa-seedling"></i>Variedade: ${talhao.variedade}</span>
                    </div>
                `;
                container.appendChild(label);
            });
        """)

        # Take screenshot of the component
        page.screenshot(path="verification/os_manual_select_all_btn.png")

        browser.close()

if __name__ == "__main__":
    verify_os_manual_select_all_btn()
