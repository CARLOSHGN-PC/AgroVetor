from bs4 import BeautifulSoup

def process_file():
    with open('docs/index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    # Remove the `nav.menu` contents that don't match the IDs
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

process_file()
