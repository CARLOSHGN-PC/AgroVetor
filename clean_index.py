from bs4 import BeautifulSoup

def clean_index():
    with open('docs/index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    # Remove all sections that are not configuracoesEmpresa or estimativaSafra
    keep_ids = ['configuracoesEmpresa', 'estimativaSafra']
    for section in soup.find_all('section'):
        if section.get('id') not in keep_ids:
            section.decompose()

    # Clean the menu
    nav = soup.find('nav', class_='menu')
    if nav:
        menu_content = nav.find('div', class_='menu-content')
        if menu_content:
            for btn in menu_content.find_all('button', class_='menu-btn'):
                onclick = btn.get('onclick', '')
                if 'configuracoesEmpresa' not in onclick and 'estimativaSafra' not in onclick and 'logout' not in onclick:
                    btn.decompose()

        # Remove submenus entirely, as we don't have submenus for these two
        for submenu in nav.find_all('div', class_='submenu-content'):
            submenu.decompose()

    with open('docs/index.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))

clean_index()
