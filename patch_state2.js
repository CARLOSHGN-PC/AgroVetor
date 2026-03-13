const fs = require('fs');
let code = fs.readFileSync('docs/app.js', 'utf8');

const stateTarget = `            ordens_servico: [],`;

const newState = `            ordens_servico: [],
            os_planejamento_cabecalho: [],
            os_planejamento_itens: [],`;

if (code.includes(stateTarget)) {
    code = code.replace(stateTarget, newState);
    fs.writeFileSync('docs/app.js', code);
    console.log("App.state patched successfully.");
} else {
    console.error("Target state not found in docs/app.js");
}
