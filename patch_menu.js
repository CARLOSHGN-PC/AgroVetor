const fs = require('fs');
let code = fs.readFileSync('docs/app.js', 'utf8');

const targetMenuConfig = `                    submenu: [
                        { label: 'Criar O.S. Manual', icon: 'fas fa-edit', target: 'ordemServicoManual', permission: 'ordemServico' },
                        { label: 'O.S. Escritório', icon: 'fas fa-list', target: 'ordemServicoEscritorio', permission: 'ordemServico' },
                    ]`;

const newMenuConfig = `                    submenu: [
                        { label: 'Planejamento O.S.', icon: 'fas fa-project-diagram', target: 'planejamentoOs', permission: 'ordemServico' },
                        { label: 'Criar O.S. Manual', icon: 'fas fa-edit', target: 'ordemServicoManual', permission: 'ordemServico' },
                        { label: 'O.S. Escritório', icon: 'fas fa-list', target: 'ordemServicoEscritorio', permission: 'ordemServico' },
                    ]`;

if (code.includes(targetMenuConfig)) {
    code = code.replace(targetMenuConfig, newMenuConfig);
    fs.writeFileSync('docs/app.js', code);
    console.log("Menu patched successfully.");
} else {
    console.error("Target menu config not found in docs/app.js");
}
