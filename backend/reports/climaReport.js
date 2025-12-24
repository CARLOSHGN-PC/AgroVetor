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

// Helper function to format numbers as integers with dot separators (e.g. 1.000)
const formatInteger = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    // Round to nearest integer to avoid commas/decimals
    const rounded = Math.round(value);
    // Format with dots for thousands
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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

        // Fetch farms to ensure correct format CODE - NAME and enrich missing data
        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', filters.companyId).get();
        const fazendasMap = {}; // Name -> Code (Legacy lookup)
        const farmIdMap = {};   // ID -> { code, name, talhoes }

        fazendasSnapshot.forEach(doc => {
            const d = doc.data();
            const farmData = { code: d.code, name: d.name, talhoes: {} };
            if (d.talhoes && Array.isArray(d.talhoes)) {
                d.talhoes.forEach(t => farmData.talhoes[t.id] = t.name);
            }
            farmIdMap[doc.id] = farmData;
            fazendasMap[d.name.toUpperCase()] = d.code;
        });

        data.forEach(r => {
            // 1. Enrich from ID if Name is missing (Fix for imported data)
            if (!r.fazendaNome && r.fazendaId && farmIdMap[r.fazendaId]) {
                const farm = farmIdMap[r.fazendaId];
                r.fazendaNome = farm.name;

                // Also try to enrich talhaoNome
                if (!r.talhaoNome && r.talhaoId && farm.talhoes[r.talhaoId]) {
                    r.talhaoNome = farm.talhoes[r.talhaoId];
                }
            }

            // 2. Format Name as "Code - Name"
            if (r.fazendaNome && !r.fazendaNome.includes(' - ')) {
                let code = fazendasMap[r.fazendaNome.toUpperCase()];

                // Prefer looking up code via ID if available
                if (!code && r.fazendaId && farmIdMap[r.fazendaId]) {
                    code = farmIdMap[r.fazendaId].code;
                }

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

        // Logic for Pluviosidade Acumulada: Sum of Monthly Averages
        const pluviosidadeMonthlyStats = {};

        const rows = data.map(item => {
            totalTempMax += item.tempMax || 0;
            totalTempMin += item.tempMin || 0;
            totalUmidade += item.umidade || 0;
            totalVento += item.vento || 0;
            count++;

            // Accumulate monthly stats for Pluviosidade
            if (typeof item.pluviosidade === 'number') {
                const monthKey = item.data.substring(0, 7); // "YYYY-MM"
                if (!pluviosidadeMonthlyStats[monthKey]) pluviosidadeMonthlyStats[monthKey] = { sum: 0, count: 0 };
                pluviosidadeMonthlyStats[monthKey].sum += item.pluviosidade;
                pluviosidadeMonthlyStats[monthKey].count++;
            }

            return [
                item.fazendaNome,
                formatDate(item.data),
                item.talhaoNome,
                formatInteger(item.tempMax),
                formatInteger(item.tempMin),
                formatInteger(item.umidade),
                formatInteger(item.pluviosidade),
                formatInteger(item.vento),
                item.obs || ''
            ];
        });

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

        // Calculate Accumulated Rainfall (Sum of Monthly Averages)
        let accumulatedRainfall = 0;
        Object.values(pluviosidadeMonthlyStats).forEach(stat => {
            if (stat.count > 0) {
                accumulatedRainfall += (stat.sum / stat.count);
            }
        });

        const summaryRow = [
            'MÉDIAS/TOTAIS', '', '',
            formatInteger(totalTempMax / count),
            formatInteger(totalTempMin / count),
            formatInteger(totalUmidade / count),
            formatInteger(accumulatedRainfall), // Using the new logic
            formatInteger(totalVento / count),
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
