from playwright.sync_api import sync_playwright
import time

def verify_os_manual_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        # Inject mock data and CSS to make list visible without full app logic
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

            // Add styles manually since we wiped body/head
            const style = document.createElement('style');
            style.textContent = `
                body { background-color: #f5f5f5; padding: 20px; font-family: sans-serif; }
                .talhao-selection-list {
                    max-height: 400px;
                    overflow-y: auto;
                    border: 1px solid #e0e0e0;
                    border-radius: 12px;
                    padding: 10px;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
                    gap: 10px;
                    background-color: #f5f5f5;
                }
                .talhao-selection-item {
                    position: relative;
                    display: grid;
                    grid-template-columns: auto 1fr;
                    grid-template-rows: auto 1fr;
                    grid-template-areas: "check name" "check details";
                    gap: 4px 12px;
                    padding: 12px;
                    border-radius: 12px;
                    background-color: #ffffff;
                    border: 1px solid #e0e0e0;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    cursor: pointer;
                }
                .talhao-selection-item input[type="checkbox"] {
                    grid-area: check;
                    align-self: start;
                    margin-top: 4px;
                    transform: scale(1.2);
                }
                .talhao-name {
                    grid-area: name;
                    font-weight: 600;
                    color: #1b5e20;
                }
                .talhao-details {
                    grid-area: details;
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    font-size: 13px;
                    color: #555;
                }
            `;
            document.head.appendChild(style);
        """)

        # Take screenshot of the component
        element = page.locator("#osPlotsList")
        element.screenshot(path="verification/os_manual_checkbox_ui.png")

        browser.close()

if __name__ == "__main__":
    verify_os_manual_ui()
