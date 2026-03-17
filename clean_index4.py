import re

with open('docs/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's find exactly the ones to keep and the ones to remove
def remove_tags(tag_name, keep_ids, html):
    pattern = re.compile(r'<' + tag_name + r'[^>]*id="([^"]+)"[^>]*>(.*?)</' + tag_name + r'>', re.DOTALL | re.IGNORECASE)
    return pattern.sub(lambda m: m.group(0) if m.group(1) in keep_ids else "", html)

html = remove_tags("section", ['configuracoesEmpresa', 'estimativaSafra'], html)

with open('docs/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
