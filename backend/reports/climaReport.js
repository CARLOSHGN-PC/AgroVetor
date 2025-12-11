const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow, formatDate } = require('../utils/pdfGenerator');

const getClimaData = async (db, filters) => {
    if (!filters.companyId) {
        console.error("Attempt to access getClimaData without companyId.");
        return [];
    }

    let query = db.collection('clima').where('companyId', '==', filters.companyId);

    if (filters.inicio) {
        query = query.where('data', '>=', filters.inicio);
    }
    if (filters.fim) {
        query = query.where('data', '<=', filters.fim);
    }

    const snapshot = await query.get();
    let data = [];
    snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
    });

    if (filters.fazendaId) {
        data = data.filter(d => d.fazendaId === filters.fazendaId);
    }

    // Sort: Farm > Talhao > Date
    data.sort((a, b) => {
        const fA = String(a.fazendaNome||'');
        const fB = String(b.fazendaNome||'');
        // Try to extract code if present "123 - Name"
        const fCodeA = parseInt(fA.split(' - ')[0]) || 0;
        const fCodeB = parseInt(fB.split(' - ')[0]) || 0;
        if (fCodeA !== fCodeB) return fCodeA - fCodeB;
        if (fA !== fB) return fA.localeCompare(fB);

        const tA = String(a.talhaoNome||'');
        const tB = String(b.talhaoNome||'');
        const tCompare = tA.localeCompare(tB, undefined, {numeric: true});
        if (tCompare !== 0) return tCompare;

        return new Date(a.data) - new Date(b.data);
    });

    return data;
};

const generateClimaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_climatologico.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getClimaData(db, filters);
        const title = 'Relatório Climatológico';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const headers = ['Data', 'Fazenda', 'Talhão', 'Temp. Máx (°C)', 'Temp. Mín (°C)', 'Umidade (%)', 'Pluviosidade (mm)', 'Vento (km/h)', 'Obs'];

        let totalPluviosidade = 0;
        let totalTempMax = 0;
        let totalTempMin = 0;
        let totalUmidade = 0;
        let totalVento = 0;
        let count = 0;

        const rows = data.map(item => {
            totalPluviosidade += item.pluviosidade || 0;
            totalTempMax += item.tempMax || 0;
            totalTempMin += item.tempMin || 0;
            totalUmidade += item.umidade || 0;
            totalVento += item.vento || 0;
            count++;

            return [
                formatDate(item.data),
                item.fazendaNome,
                item.talhaoNome,
                formatNumber(item.tempMax),
                formatNumber(item.tempMin),
                formatNumber(item.umidade),
                formatNumber(item.pluviosidade),
                formatNumber(item.vento),
                item.obs || ''
            ];
        });

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY);

        const summaryRow = [
            'MÉDIAS/TOTAIS', '', '',
            formatNumber(totalTempMax / count),
            formatNumber(totalTempMin / count),
            formatNumber(totalUmidade / count),
            formatNumber(totalPluviosidade),
            formatNumber(totalVento / count),
            ''
        ];

        await drawSummaryRow(doc, summaryRow, currentY, columnWidths, title, logoBase64);

        // Chart attachments logic
        if (filters.charts && filters.charts.length > '[]'.length) {
            try {
                const charts = JSON.parse(filters.charts);
                if (Array.isArray(charts) && charts.length > 0) {
                    doc.addPage({ layout: 'landscape', margin: 30 });
                    let chartY = await generatePdfHeader(doc, 'Anexo - Gráficos Climatológicos', logoBase64);

                    const chartWidth = 450;
                    const chartHeight = 200;
                    const marginX = (doc.page.width - chartWidth) / 2;
                    const spaceBetween = 20;

                    for (let i = 0; i < charts.length; i++) {
                        const chartImage = charts[i];
                        if (i > 0 && i % 2 === 0) {
                            doc.addPage({ layout: 'landscape', margin: 30 });
                            chartY = await generatePdfHeader(doc, 'Anexo - Gráficos Climatológicos', logoBase64);
                        }

                        const yPos = (i % 2 === 0) ? chartY : chartY + chartHeight + spaceBetween;

                        if (yPos + chartHeight > doc.page.height - doc.page.margins.bottom) {
                            doc.addPage({ layout: 'landscape', margin: 30 });
                            chartY = await generatePdfHeader(doc, 'Anexo - Gráficos Climatológicos', logoBase64);
                            doc.image(chartImage, marginX, chartY, { fit: [chartWidth, chartHeight], align: 'center' });
                        } else {
                            doc.image(chartImage, marginX, yPos, { fit: [chartWidth, chartHeight], align: 'center' });
                        }
                    }
                }
            } catch (e) {
                console.error("Erro ao processar gráficos:", e);
            }
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Climatológico:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    getClimaData,
    generateClimaPdf
};
