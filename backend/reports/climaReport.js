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

        // Fetch farms to ensure correct format CODE - NAME
        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', filters.companyId).get();
        const fazendasMap = {};
        fazendasSnapshot.forEach(doc => {
            const d = doc.data();
            fazendasMap[d.name.toUpperCase()] = d.code;
        });

        data.forEach(r => {
            if (r.fazendaNome && !r.fazendaNome.includes(' - ')) {
                const code = fazendasMap[r.fazendaNome.toUpperCase()] || '';
                if (code) {
                    r.fazendaNome = `${code} - ${r.fazendaNome}`;
                }
            }
        });

        // Sort: Farm Code > Date > Talhao
        data.sort((a, b) => {
            const fA = String(a.fazendaNome||'');
            const fB = String(b.fazendaNome||'');
            const fCodeA = parseInt(fA.split(' - ')[0]) || 0;
            const fCodeB = parseInt(fB.split(' - ')[0]) || 0;

            if (fCodeA !== fCodeB) return fCodeA - fCodeB;

            const dateA = new Date(a.data);
            const dateB = new Date(b.data);
            if (dateA - dateB !== 0) return dateA - dateB;

            const tA = String(a.talhaoNome||'');
            const tB = String(b.talhaoNome||'');
            return tA.localeCompare(tB, undefined, {numeric: true});
        });

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        // Updated Headers: Fazenda, Data
        const headers = ['Fazenda', 'Data', 'Talhão', 'Temp. Máx (°C)', 'Temp. Mín (°C)', 'Umidade (%)', 'Pluviosidade (mm)', 'Vento (km/h)', 'Obs'];

        let totalTempMax = 0;
        let totalTempMin = 0;
        let totalUmidade = 0;
        let totalVento = 0;
        let count = 0;

        // Logic for "Sum of Daily Averages" for Rainfall
        // Group by Date, calc avg for that date, then sum averages
        const dailyAverages = {};

        const rows = data.map(item => {
            const rain = item.pluviosidade || 0;
            totalTempMax += item.tempMax || 0;
            totalTempMin += item.tempMin || 0;
            totalUmidade += item.umidade || 0;
            totalVento += item.vento || 0;
            count++;

            // Group rainfall by date
            const dateKey = item.data;
            if (!dailyAverages[dateKey]) dailyAverages[dateKey] = { sum: 0, count: 0 };
            dailyAverages[dateKey].sum += rain;
            dailyAverages[dateKey].count++;

            return [
                item.fazendaNome,
                formatDate(item.data),
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

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

        // Calculate "Sum of Daily Averages" for Rainfall
        let totalAccumulatedRainfall = 0;
        Object.values(dailyAverages).forEach(day => {
            if (day.count > 0) {
                totalAccumulatedRainfall += (day.sum / day.count);
            }
        });

        const summaryRow = [
            'MÉDIAS/TOTAIS', '', '',
            formatNumber(totalTempMax / count),
            formatNumber(totalTempMin / count),
            formatNumber(totalUmidade / count),
            Math.round(totalAccumulatedRainfall).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."), // Custom formatting for rainfall
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
