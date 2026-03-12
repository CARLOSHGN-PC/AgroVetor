const fs = require('fs');
let code = fs.readFileSync('docs/index.html', 'utf8');

const anchor = `<script src="./app.js"></script>`;
const scriptHtml = `<script src="./js/modules/PlanejamentoOsModule.js"></script>\n    <script src="./app.js"></script>`;

if (code.includes(anchor)) {
    code = code.replace(anchor, scriptHtml);
    fs.writeFileSync('docs/index.html', code);
    console.log("HTML script patched successfully.");
} else {
    console.error("Target anchor not found in docs/index.html");
}
