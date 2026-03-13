const fs = require('fs');
let code = fs.readFileSync('docs/app.js', 'utf8');

const stateTarget = `            import_history: [], // Histórico de imports do painel de Configs
            reconciliation_inbox: [], // Fila de apontamentos que precisam de conciliação manual`;

const newState = `            import_history: [], // Histórico de imports do painel de Configs
            reconciliation_inbox: [], // Fila de apontamentos que precisam de conciliação manual

            // Planejamento O.S. Módulo
            os_planejamento_cabecalho: [],
            os_planejamento_itens: [],`;

if (code.includes(stateTarget)) {
    code = code.replace(stateTarget, newState);
    fs.writeFileSync('docs/app.js', code);
    console.log("App.state patched successfully.");
} else {
    console.error("Target state not found in docs/app.js");
}
