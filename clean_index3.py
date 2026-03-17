import re

with open('docs/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# I want to delete the sections that were matched in the previous step and not yet deleted.
# Using regex to find all <section id="..."> and if not in keep_ids, remove them
keep_ids = ['configuracoesEmpresa', 'estimativaSafra']
sections_regex = re.compile(r'<section [^>]*id="([^"]+)"[^>]*>.*?</section>', re.DOTALL | re.IGNORECASE)

def repl(match):
    if match.group(1) in keep_ids:
        return match.group(0)
    return ""

html = sections_regex.sub(repl, html)

with open('docs/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
