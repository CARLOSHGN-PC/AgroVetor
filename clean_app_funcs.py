import re

with open('docs/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

def remove_function(text, func_name):
    # Matches `func_name: function(...) {` or `func_name: async (...) => {` or `func_name: (...) => {` or `func_name(...) {`
    # This regex is an approximation and might not work for all forms.
    pattern = rf'{func_name}\s*(:\s*function\s*\([^\)]*\)\s*\{{|:\s*async\s*\([^\)]*\)\s*=>\s*\{{|:\s*\([^\)]*\)\s*=>\s*\{{|\([^\)]*\)\s*\{{)'
    match = re.search(pattern, text)
    if not match:
        return text
    start = match.start()
    end_bracket_idx = text.find('{', start)
    if end_bracket_idx == -1:
        return text

    open_brackets = 1
    for i in range(end_bracket_idx + 1, len(text)):
        if text[i] == '{':
            open_brackets += 1
        elif text[i] == '}':
            open_brackets -= 1

        if open_brackets == 0:
            end = i + 1
            while end < len(text) and text[end] in [' ', '\n', '\t', '\r']:
                end += 1
            if end < len(text) and text[end] == ',':
                end += 1
            return text[:start] + text[end:]
    return text

# Functions related to removed modules to remove from App.ui, App.reports, App.events, App.data
funcs_to_remove = [
    'renderDashboard', 'renderDashboardClima', 'renderMonitoramentoAereo', 'renderPlanejamento',
    'renderOSManual', 'renderOSPlanning', 'renderOSDesk', 'renderPlantio', 'renderApontamentoPlantio',
    'renderQualidadePlantio', 'renderRegistroAplicacao', 'renderLancamentoPerda', 'renderLancamentoCigarrinha',
    'renderLancamentoCigarrinhaAmostragem', 'renderLancamentoBroca', 'renderRelatorios', 'renderCadastros',
    'renderGestaoFrota', 'renderControleKM', 'renderSyncHistory', 'renderManageEntries', 'renderHistoryFilterModal',
    'renderRegApp', 'renderRelatorioBroca', 'renderRelatorioColheitaCustom', 'renderRelatorioMonitoramento',
    'renderRelatorioRisco', 'renderRelatorioPerda', 'renderRelatorioCigarrinha', 'renderRelatorioCigarrinhaAmostragem',
    'renderRelatorioQualidadePlantio', 'renderRelatorioPlantio', 'renderRelatorioClima', 'renderRelatorioFrota',
    'renderCadastrarPessoas', 'renderGerenciarLancamentos', 'renderGerenciarUsuarios', 'renderGerenciarAtualizacoes',
    'renderGerenciarEmpresas', 'renderCadastrosAuxiliares', 'renderFrenteDePlantio', 'renderLancamentoClima',
    'renderPlanejamentoColheita'
]

for func in funcs_to_remove:
    app_js = remove_function(app_js, func)

with open('docs/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
