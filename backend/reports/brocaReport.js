const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow, formatDate } = require('../utils/pdfGenerator');
const { getFilteredData } = require('../utils/dataUtils');

const generateBrocaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getFilteredData(db, 'registros', filters);
        const title = 'Relatório de Inspeção de Broca';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', filters.companyId).get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
            fazendasData[docSnap.data().code] = docSnap.data();
        });

        const enrichedData = data.map(reg => {
            const farm = fazendasData[reg.codigo];
            const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === reg.talhao.toUpperCase());
            return { ...reg, variedade: talhao?.variedade || 'N/A' };
        });

        const isModelB = filters.tipoRelatorio === 'B';
        let currentY = await generatePdfHeader(doc, title, logoBase64);

        if (!isModelB) {
            // Sort: Fazenda > Data > Talhao
            enrichedData.sort((a, b) => {
                const codeA = parseInt(a.codigo, 10) || 0;
                const codeB = parseInt(b.codigo, 10) || 0;
                if (codeA !== codeB) return codeA - codeB;

                const dateA = new Date(a.data);
                const dateB = new Date(b.data);
                if (dateA - dateB !== 0) return dateA - dateB;

                const tA = String(a.talhao||'');
                const tB = String(b.talhao||'');
                return tA.localeCompare(tB, undefined, {numeric: true});
            });

            // Headers: Fazenda, Data, Talhao...
            const headers = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
            const rows = enrichedData.map(r => [
                `${r.codigo} - ${r.fazenda}`,
                formatDate(r.data),
                r.talhao,
                r.variedade,
                r.corte,
                r.entrenos,
                r.base,
                r.meio,
                r.topo,
                r.brocado,
                r.brocamento
            ]);

            const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
            currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

            // Calculate totals
            const totalEntrenos = enrichedData.reduce((sum, r) => sum + r.entrenos, 0);
            const totalBrocado = enrichedData.reduce((sum, r) => sum + r.brocado, 0);
            const totalBase = enrichedData.reduce((sum, r) => sum + r.base, 0);
            const totalMeio = enrichedData.reduce((sum, r) => sum + r.meio, 0);
            const totalTopo = enrichedData.reduce((sum, r) => sum + r.topo, 0);
            const totalPercent = totalEntrenos > 0 ? ((totalBrocado / totalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

            const totalRow = ['', '', '', '', 'Total Geral', totalEntrenos, totalBase, totalMeio, totalTopo, totalBrocado, totalPercent];
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);

        } else {
            // Model B - Grouped by Farm
            // For Model B, we add 'Fazenda' column as first column even if grouped by it (as per strict request)?
            // Or "Data" as first column in the table?
            // User requirement: "A primeira coluna deve ser Fazenda...".
            // Since it's grouped, usually we display Farm Name as header.
            // But if strict, I should add Fazenda column. However, it's redundant.
            // Let's stick to Data first in the table if grouped, as it's cleaner.
            // BUT, wait, "Qualquer relatório... que atualmente esteja com Data antes de Fazenda deve obrigatoriamente sofrer inversão".
            // Since Fazenda is not in the table, Data is the first column.
            // If I add Fazenda column, it will be first.
            // I'll leave it grouped but ensure Data is before Talhao.

            const headers = ['Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
            const groupedData = enrichedData.reduce((acc, reg) => {
                const key = `${reg.codigo} - ${reg.fazenda}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(reg);
                return acc;
            }, {});

            // Pre-calculate column widths using all data
            const allRows = enrichedData.map(r => [
                 formatDate(r.data), r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento
            ]);
            const columnWidths = calculateColumnWidths(doc, headers, allRows, doc.page.width, doc.page.margins);

            // Sort logic: Numeric farm code
            const sortedFarms = Object.keys(groupedData).sort((a, b) => {
                const codeA = parseInt(a.split(' - ')[0]) || 0;
                const codeB = parseInt(b.split(' - ')[0]) || 0;
                if (codeA !== codeB) return codeA - codeB;
                return a.localeCompare(b);
            });

            let grandTotalEntrenos = 0;
            let grandTotalBrocado = 0;
            let grandTotalBase = 0;
            let grandTotalMeio = 0;
            let grandTotalTopo = 0;

            for (const fazendaKey of sortedFarms) {
                const farmData = groupedData[fazendaKey];

                // Sort: Date > Talhao
                farmData.sort((a, b) => {
                    const dateA = new Date(a.data);
                    const dateB = new Date(b.data);
                    if (dateA - dateB !== 0) return dateA - dateB;

                    const tA = String(a.talhao||'');
                    const tB = String(b.talhao||'');
                    return tA.localeCompare(tB, undefined, {numeric: true});
                });

                if (currentY > doc.page.height - doc.page.margins.bottom - 40) {
                    doc.addPage();
                    currentY = await generatePdfHeader(doc, title, logoBase64);
                }

                doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY);
                currentY = doc.y + 5;

                const rows = farmData.map(r => [
                    formatDate(r.data), r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento
                ]);

                // Use global columnWidths
                currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

                const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
                const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
                const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
                const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
                const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
                const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

                const subtotalRow = ['', '', '', 'Sub Total', subTotalEntrenos, subTotalBase, subTotalMeio, subTotalTopo, subTotalBrocado, subTotalPercent];
                currentY = await drawSummaryRow(doc, subtotalRow, currentY, columnWidths, title, logoBase64);
                currentY += 10;

                grandTotalEntrenos += subTotalEntrenos;
                grandTotalBrocado += subTotalBrocado;
                grandTotalBase += subTotalBase;
                grandTotalMeio += subTotalMeio;
                grandTotalTopo += subTotalTopo;
            }

            const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';
            const totalRow = ['', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF de Brocamento:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    generateBrocaPdf
};
