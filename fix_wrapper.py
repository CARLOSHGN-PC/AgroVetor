import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# The wrapper has to be defined BEFORE it is used. It is defined at the top. But it is outside the document.addEventListener('DOMContentLoaded', ...) AND outside ES6 module system correctly if not exported. Oh wait, it's defined at the very top. So it's fine. Wait, `app.js` has ES6 imports right after it. Imports must be at the top of the file!

imports = re.findall(r'^import\s+.*?;$', app_js, re.MULTILINE)
app_js_clean = re.sub(r'^import\s+.*?;$\n', '', app_js, flags=re.MULTILINE)

new_app_js = '\n'.join(imports) + '\n\n' + app_js_clean

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.write(new_app_js)
