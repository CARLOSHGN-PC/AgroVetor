import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

new_menu_config = """menuConfig: [
                { label: 'Configurações da Empresa', icon: 'fas fa-building', target: 'configuracoesEmpresa', permission: 'configuracoesEmpresa' },
                { label: 'Estimativa Safra', icon: 'fas fa-seedling', target: 'estimativaSafra', permission: 'estimativaSafra' }
            ],"""

app_js = re.sub(r"menuConfig:\s*\[.*?\](?![\s\S]*menuConfig:),?", new_menu_config, app_js, flags=re.DOTALL)

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
