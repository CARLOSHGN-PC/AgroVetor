const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow } = require('../utils/pdfGenerator');

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

        const headers = ['Data', 'Fazenda', 'Prestador', 'Matrícula Líder', 'Variedade', 'Talhão', 'Área (ha)', 'Chuva (mm)', 'Obs'];

        // Group data by farm
        const dataByFarm = {};
        data.forEach(item => {
            item.records.forEach(record => {
                if (!dataByFarm[item.farmName]) {
                    dataByFarm[item.farmName] = [];
                }
                dataByFarm[item.farmName].push({ ...item, ...record });
            });
        });

        let totalAreaGeral = 0;

        // Iterate over farms
        const farmNames = Object.keys(dataByFarm).sort();

        // Calculate global column widths based on ALL data to ensure consistency across pages/groups
        // flattening all data for width calculation
        let allRows = [];
        farmNames.forEach(farmName => {
             const farmRecords = dataByFarm[farmName];
             farmRecords.forEach(record => {
                 allRows.push([
                    record.date,
                    `${record.farmCode} - ${record.farmName}`,
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

        // Draw tables
        for (const farmName of farmNames) {
            const farmRecords = dataByFarm[farmName];
            farmRecords.sort((a,b) => new Date(a.date) - new Date(b.date));

            let farmTotalArea = 0;
            const rows = farmRecords.map(record => {
                farmTotalArea += record.area;
                return [
                    record.date,
                    `${record.farmCode} - ${record.farmName}`,
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

            currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY);

            // Subtotal row
            const subtotalRow = ['', '', '', '', 'SUB TOTAL', '', formatNumber(farmTotalArea), '', ''];
            currentY = await drawSummaryRow(doc, subtotalRow, currentY, columnWidths, title, logoBase64);
            currentY += 10; // Space between farms

            totalAreaGeral += farmTotalArea;
        }

        // Grand Total
        const totalRow = ['', '', '', '', 'TOTAL GERAL', '', formatNumber(totalAreaGeral), '', ''];
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

        const headers = ['Data', 'Fazenda', 'Talhão', 'Variedade', 'Prestador', 'Área (ha)', 'Chuva (mm)', 'Obs'];

        const allRecords = [];
        let totalAreaGeral = 0;

        data.forEach(item => {
            item.records.forEach(record => {
                allRecords.push({ ...item, ...record });
            });
        });

        allRecords.sort((a, b) => {
            const farmNameA = `${a.farmCode} - ${a.farmName}`;
            const farmNameB = `${b.farmCode} - ${b.farmName}`;
            if (farmNameA < farmNameB) return -1;
            if (farmNameA > farmNameB) return 1;
            return new Date(a.date) - new Date(b.date);
        });

        const rows = allRecords.map(record => {
            totalAreaGeral += record.area;
            return [
                record.date,
                `${record.farmCode} - ${record.farmName}`,
                record.talhao,
                record.variedade,
                record.provider,
                formatNumber(record.area),
                record.chuva || '',
                record.obs || ''
            ];
        });

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY);

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
