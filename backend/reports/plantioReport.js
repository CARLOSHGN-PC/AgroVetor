const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow, formatDate } = require('../utils/pdfGenerator');

const getPlantioData = async (db, filters) => {
    if (!filters.companyId) {
        console.error("Attempt to access getPlantioData without companyId.");
        return [];
    }

    let query = db.collection('apontamentosPlantio').where('companyId', '==', filters.companyId);

    if (filters.inicio) {
        query = query.where('date', '>=', filters.inicio);
    }
    if (filters.fim) {
        query = query.where('date', '<=', filters.fim);
    }
    if (filters.frenteId) {
        query = query.where('frenteDePlantioId', '==', filters.frenteId);
    }
    if (filters.cultura) {
        query = query.where('culture', '==', filters.cultura);
    }

    const snapshot = await query.get();
    let data = [];
    snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
    });

    let farmCodesToFilter = null;
    if (filters.tipos) {
        const selectedTypes = filters.tipos.split(',').filter(t => t);
        if (selectedTypes.length > 0) {
            const farmsQuery = db.collection('fazendas').where('companyId', '==', filters.companyId).where('types', 'array-contains-any', selectedTypes);
            const farmsSnapshot = await farmsQuery.get();
            const matchingFarmCodes = [];
            farmsSnapshot.forEach(doc => {
                matchingFarmCodes.push(doc.data().code);
            });
            if (matchingFarmCodes.length > 0) {
                farmCodesToFilter = matchingFarmCodes;
            } else {
                return [];
            }
        }
    }

    if(farmCodesToFilter){
        data = data.filter(d => farmCodesToFilter.includes(d.farmCode));
    }

    return data.sort((a, b) => new Date(a.date) - new Date(b.date));
};

const generatePlantioFazendaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_fazenda.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio por Fazenda';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        // Updated Headers: Fazenda first, Data second
        const headers = ['Fazenda', 'Data', 'Prestador', 'Matrícula Líder', 'Variedade', 'Talhão', 'Área (ha)', 'Chuva (mm)', 'Obs'];

        // Group data by farm
        const dataByFarm = {};
        data.forEach(item => {
            item.records.forEach(record => {
                const key = `${item.farmCode} - ${item.farmName}`;
                if (!dataByFarm[key]) {
                    dataByFarm[key] = [];
                }
                dataByFarm[key].push({ ...item, ...record });
            });
        });

        let totalAreaGeral = 0;

        // Iterate over farms sorted by code
        const farmKeys = Object.keys(dataByFarm).sort((a, b) => {
            const codeA = parseInt(a.split(' - ')[0]) || 0;
            const codeB = parseInt(b.split(' - ')[0]) || 0;
            if (codeA !== codeB) return codeA - codeB;
            return a.localeCompare(b);
        });

        // Calculate global column widths based on ALL data
        let allRows = [];
        farmKeys.forEach(farmKey => {
             const farmRecords = dataByFarm[farmKey];
             farmRecords.forEach(record => {
                 allRows.push([
                    farmKey,
                    formatDate(record.date),
                    record.provider,
                    record.leaderId,
                    record.variedade,
                    record.talhao,
                    formatNumber(record.area),
                    record.chuva || '',
                    record.obs || ''
                 ]);
             });
        });

        const columnWidths = calculateColumnWidths(doc, headers, allRows, doc.page.width, doc.page.margins);

        for (const farmKey of farmKeys) {
            const farmRecords = dataByFarm[farmKey];
            // Sort by Date then Talhao inside farm
            farmRecords.sort((a,b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                if (dateA - dateB !== 0) return dateA - dateB;
                const tA = String(a.talhao||'');
                const tB = String(b.talhao||'');
                return tA.localeCompare(tB, undefined, {numeric: true});
            });

            let farmTotalArea = 0;
            const rows = farmRecords.map(record => {
                farmTotalArea += record.area;
                return [
                    farmKey,
                    formatDate(record.date),
                    record.provider,
                    record.leaderId,
                    record.variedade,
                    record.talhao,
                    formatNumber(record.area),
                    record.chuva || '',
                    record.obs || ''
                ];
            });

            if (currentY > doc.page.height - doc.page.margins.bottom - 40) {
                doc.addPage();
                currentY = await generatePdfHeader(doc, title, logoBase64);
            }

            // Pass global columnWidths to ensure table matches summary row
            currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

            const subtotalRow = ['', '', '', '', '', 'SUB TOTAL', formatNumber(farmTotalArea), '', ''];
            currentY = await drawSummaryRow(doc, subtotalRow, currentY, columnWidths, title, logoBase64);
            currentY += 10;

            totalAreaGeral += farmTotalArea;
        }

        const totalRow = ['', '', '', '', '', 'TOTAL GERAL', formatNumber(totalAreaGeral), '', ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Plantio por Fazenda:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generatePlantioTalhaoPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_talhao.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio por Talhão';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        // Updated Headers: Fazenda first, Data second
        const headers = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Prestador', 'Área (ha)', 'Chuva (mm)', 'Obs'];

        const allRecords = [];
        let totalAreaGeral = 0;

        data.forEach(item => {
            item.records.forEach(record => {
                allRecords.push({ ...item, ...record });
            });
        });

        // Sort: Farm > Date > Talhao
        allRecords.sort((a, b) => {
            const farmCodeA = parseInt(a.farmCode, 10) || 0;
            const farmCodeB = parseInt(b.farmCode, 10) || 0;
            if (farmCodeA !== farmCodeB) return farmCodeA - farmCodeB;

            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA - dateB !== 0) return dateA - dateB;

            const tA = String(a.talhao||'');
            const tB = String(b.talhao||'');
            const tCompare = tA.localeCompare(tB, undefined, {numeric: true});
            return tCompare;
        });

        const rows = allRecords.map(record => {
            totalAreaGeral += record.area;
            return [
                `${record.farmCode} - ${record.farmName}`,
                formatDate(record.date),
                record.talhao,
                record.variedade,
                record.provider,
                formatNumber(record.area),
                record.chuva || '',
                record.obs || ''
            ];
        });

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

        const totalRow = ['', '', '', '', 'Total Geral', formatNumber(totalAreaGeral), '', ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Plantio por Talhão:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    getPlantioData,
    generatePlantioFazendaPdf,
    generatePlantioTalhaoPdf
};
