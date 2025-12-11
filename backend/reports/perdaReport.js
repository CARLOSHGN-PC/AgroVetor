const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow } = require('../utils/pdfGenerator');
const { getFilteredData } = require('../utils/dataUtils');

const generatePerdaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_perda.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getFilteredData(db, 'perdas', filters);
        const isDetailed = filters.tipoRelatorio === 'B';
        const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        if (!isDetailed) {
            const headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
            const rows = data.map(p => [
                p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.total)
            ]);

            const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
            currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY);

            const grandTotal = data.reduce((sum, p) => sum + p.total, 0);
            const totalRow = ['', '', '', '', '', 'Total Geral', formatNumber(grandTotal)];
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);

        } else {
            const headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaco', 'Pedaco', 'Total'];

            // Pre-calculate column widths
            const allRows = data.map(p => [
                p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador,
                formatNumber(p.canaInteira), formatNumber(p.tolete), formatNumber(p.toco),
                formatNumber(p.ponta), formatNumber(p.estilhaco), formatNumber(p.pedaco), formatNumber(p.total)
            ]);
            const columnWidths = calculateColumnWidths(doc, headers, allRows, doc.page.width, doc.page.margins);

            const groupedData = data.reduce((acc, p) => {
                const key = `${p.codigo} - ${p.fazenda}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(p);
                return acc;
            }, {});

            const sortedFarms = Object.keys(groupedData).sort();

            let grandTotals = { canaInteira: 0, tolete: 0, toco: 0, ponta: 0, estilhaco: 0, pedaco: 0, total: 0 };

            for (const fazendaKey of sortedFarms) {
                const farmData = groupedData[fazendaKey];

                if (currentY > doc.page.height - doc.page.margins.bottom - 40) {
                    doc.addPage();
                    currentY = await generatePdfHeader(doc, title, logoBase64);
                }

                doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY);
                currentY = doc.y + 5;

                const rows = farmData.map(p => [
                    p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador,
                    formatNumber(p.canaInteira), formatNumber(p.tolete), formatNumber(p.toco),
                    formatNumber(p.ponta), formatNumber(p.estilhaco), formatNumber(p.pedaco), formatNumber(p.total)
                ]);

                currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY);

                const subTotals = farmData.reduce((acc, p) => {
                    acc.canaInteira += p.canaInteira; acc.tolete += p.tolete; acc.toco += p.toco;
                    acc.ponta += p.ponta; acc.estilhaco += p.estilhaco; acc.pedaco += p.pedaco; acc.total += p.total;
                    return acc;
                }, { canaInteira: 0, tolete: 0, toco: 0, ponta: 0, estilhaco: 0, pedaco: 0, total: 0 });

                Object.keys(subTotals).forEach(key => grandTotals[key] += subTotals[key]);

                const subtotalRow = ['', '', '', '', '', 'Sub Total',
                    formatNumber(subTotals.canaInteira), formatNumber(subTotals.tolete), formatNumber(subTotals.toco),
                    formatNumber(subTotals.ponta), formatNumber(subTotals.estilhaco), formatNumber(subTotals.pedaco), formatNumber(subTotals.total)
                ];
                currentY = await drawSummaryRow(doc, subtotalRow, currentY, columnWidths, title, logoBase64);
                currentY += 10;
            }

            const totalRow = ['', '', '', '', '', 'Total Geral',
                formatNumber(grandTotals.canaInteira), formatNumber(grandTotals.tolete), formatNumber(grandTotals.toco),
                formatNumber(grandTotals.ponta), formatNumber(grandTotals.estilhaco), formatNumber(grandTotals.pedaco), formatNumber(grandTotals.total)
            ];
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF de Perda:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    generatePerdaPdf
};
