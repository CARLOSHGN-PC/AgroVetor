from bs4 import BeautifulSoup

def process_file():
    with open('docs/index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    sections_to_keep = ['configuracoesEmpresa', 'estimativaSafra']

    for section in soup.find_all('section'):
        if section.name == 'section' and section.attrs is not None:
            section_id = section.attrs.get('id')
            if section_id not in sections_to_keep:
                section.decompose()

    # Also clean up menu to only have those two items (if possible, but maybe leave menu alone or clean it too)
    menu = soup.find('nav', class_='menu')
    if menu:
        for btn in menu.find_all('button', class_='menu-btn'):
            if btn.name == 'button' and btn.attrs is not None and 'onclick' in btn.attrs:
                onclick = btn.attrs['onclick']
                if 'configuracoesEmpresa' not in onclick and 'estimativaSafra' not in onclick and 'logout' not in onclick:
                    if 'toggleSubmenu' not in onclick:
                        btn.decompose()
        # Clean submenus
        for submenu in menu.find_all('div', class_='submenu-content'):
            for btn in submenu.find_all('button', class_='submenu-btn'):
                if btn.name == 'button' and btn.attrs is not None and 'onclick' in btn.attrs:
                    onclick = btn.attrs['onclick']
                    if 'configuracoesEmpresa' not in onclick and 'estimativaSafra' not in onclick:
                        btn.decompose()

    with open('docs/index.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))

process_file()
