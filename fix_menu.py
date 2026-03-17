import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# I already replaced menuConfig, let's verify
print("menuConfig snippet:")
print(app_js[app_js.find('menuConfig:'):app_js.find('menuConfig:')+300])
