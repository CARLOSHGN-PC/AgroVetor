import re

def clean_index():
    with open('docs/index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # We need to remove all sections EXCEPT configuracoesEmpresa and estimativaSafra
    sections_to_keep = ['configuracoesEmpresa', 'estimativaSafra']

    # We will use BeautifulSoup to remove sections
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')

    for section in soup.find_all('section'):
        if section.get('id') not in sections_to_keep:
            section.decompose()

    # Now clean the menu
    nav = soup.find('nav', class_='menu')
    if nav:
        for btn in nav.find_all('button', class_='menu-btn'):
            if btn.has_attr('onclick'):
                onclick = btn['onclick']
                if 'configuracoesEmpresa' not in onclick and 'estimativaSafra' not in onclick and 'logout' not in onclick:
                    btn.decompose()

        for sub in nav.find_all('div', class_='submenu-content'):
            sub.decompose()

    with open('docs/index.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))

clean_index()

# Now for app.js
with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# I will replace menuConfig properly using regex.
# menuConfig: [ ... ], target: 'dashboard' ... ]
# Let's find the start of menuConfig and the end of it
start_idx = app_js.find('menuConfig:')
if start_idx != -1:
    # Find the matching closing bracket for menuConfig array
    end_idx = start_idx + len('menuConfig:')
    open_brackets = 0
    found_first_bracket = False
    for i in range(end_idx, len(app_js)):
        if app_js[i] == '[':
            open_brackets += 1
            found_first_bracket = True
        elif app_js[i] == ']':
            open_brackets -= 1

        if found_first_bracket and open_brackets == 0:
            end_idx = i + 1
            break

    new_menu = """menuConfig: [
                { label: 'Configurações da Empresa', icon: 'fas fa-building', target: 'configuracoesEmpresa', permission: 'configuracoesEmpresa' },
                { label: 'Estimativa Safra', icon: 'fas fa-seedling', target: 'estimativaSafra', permission: 'estimativaSafra' }
            ]"""

    app_js = app_js[:start_idx] + new_menu + app_js[end_idx:]

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
