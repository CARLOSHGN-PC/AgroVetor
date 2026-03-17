import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# I need to completely remove the code for the other modules, as the user requested:
# "apague o codigo inteiro tanto do app.js e no index.html"

# This means I should try to remove elements, events, and functions that refer to the other modules.
# Or, I can use an AST parser to remove properties from App.elements, App.ui, etc.
# Python doesn't have a built-in JS AST parser. I will use a simple regex to replace document.getElementById with a proxy that catches errors, but the user explicitly requested to "apagar o codigo inteiro".

# Since it is a massive 11k line file, let's write a simple Node.js script to use an AST parser (like esprima or babel) to delete properties. Or simpler: I will just delete the elements from `App.elements = { ... }` using a python script with parenthesis matching.

def remove_object_property(text, prop_name):
    # finds `prop_name: {`
    match = re.search(rf'{prop_name}\s*:\s*\{{', text)
    if not match:
        return text
    start = match.start()
    open_brackets = 0
    in_brackets = False
    for i in range(match.end() - 1, len(text)):
        if text[i] == '{':
            open_brackets += 1
            in_brackets = True
        elif text[i] == '}':
            open_brackets -= 1

        if in_brackets and open_brackets == 0:
            # We found the end of the object.
            # We want to remove from `start` to `i + 1`. We also need to remove a trailing comma if any.
            end = i + 1
            while end < len(text) and text[end] in [' ', '\n', '\t', '\r']:
                end += 1
            if end < len(text) and text[end] == ',':
                end += 1
            return text[:start] + text[end:]
    return text

# Modules to remove from App.elements
modules = [
    'dashboard', 'dashboardClima', 'monitoramentoAereo', 'planejamento', 'osManual', 'osPlanning',
    'osDesk', 'plantio', 'apontamentoPlantio', 'qualidadePlantio', 'registroAplicacao',
    'lancamentoPerda', 'lancamentoCigarrinha', 'lancamentoCigarrinhaAmostragem', 'lancamentoBroca',
    'relatorios', 'cadastros', 'gestaoFrota', 'controleKM', 'syncHistory', 'manageEntries', 'historyFilterModal',
    'regApp', 'relatorioBroca', 'relatorioColheitaCustom', 'relatorioMonitoramento', 'relatorioRisco', 'relatorioPerda',
    'relatorioCigarrinha', 'relatorioCigarrinhaAmostragem', 'relatorioQualidadePlantio', 'relatorioPlantio', 'relatorioClima', 'relatorioFrota',
    'cadastrarPessoas', 'gerenciarLancamentos', 'gerenciarUsuarios', 'gerenciarAtualizacoes', 'gerenciarEmpresas', 'cadastrosAuxiliares', 'frenteDePlantio', 'lancamentoClima', 'planejamentoColheita'
]

# We need to remove them from App.elements
for mod in modules:
    app_js = remove_object_property(app_js, mod)

# We can also do the same for App.events, App.ui, etc.
# But it's risky if they are referenced elsewhere.
# Actually, the user asked to "apagar o codigo inteiro".

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
