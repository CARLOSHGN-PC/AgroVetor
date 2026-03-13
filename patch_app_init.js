const fs = require('fs');
let code = fs.readFileSync('docs/app.js', 'utf8');

const targetInit = `        if (id === 'ordemServicoManual') {
                    App.osManual.init();
                }`;

const newInit = `        if (id === 'ordemServicoManual') {
                    App.osManual.init();
                }
                if (id === 'planejamentoOs') {
                    if (!App.planOs) {
                        App.planOs = new PlanejamentoOsModule(App);
                    }
                    App.planOs.init();
                }`;

if (code.includes(targetInit)) {
    code = code.replace(targetInit, newInit);
    fs.writeFileSync('docs/app.js', code);
    console.log("App.ui.showTab patched successfully.");
} else {
    console.error("Target init not found in docs/app.js");
}
