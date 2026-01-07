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

    // Filter by Fazenda ID if provided
    if (filters.fazendaId) {
        const farmDoc = await db.collection('fazendas').doc(filters.fazendaId).get();
        if (farmDoc.exists) {
            const farmCode = farmDoc.data().code;
            data = data.filter(d => d.farmCode === farmCode);
        } else {
            return [];
        }
    }

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

const formatFazendaLabel = (entry) => `${entry.farmCode} - ${entry.farmName}`;

const getVariedadeResumo = (entry) => {
    const variedades = new Set((entry.records || []).map(r => r.variedade).filter(Boolean));
    if (variedades.size === 0) return '';
    if (variedades.size === 1) return Array.from(variedades)[0];
    return 'Diversas';
};

const getTalhoesAtendidos = (entry) => (entry.records || []).map(r => r.talhao).filter(Boolean).join(', ');

const formatOrigemMuda = (entry) => {
    const parts = [];
    if (entry.origemMuda) parts.push(entry.origemMuda);
    if (entry.mudaFazendaNome) parts.push(entry.mudaFazendaNome);
    if (entry.mudaTalhao) parts.push(entry.mudaTalhao);
    return parts.join(' / ');
};

const buildResumoRows = (data) => data.map(entry => ({
    data: formatDate(entry.date),
    cultura: entry.culture || '',
    tipoPlantio: entry.tipoPlantio || '',
    areaTotal: formatNumber(entry.totalArea || 0),
    os: entry.ordemServico || '',
    fazenda: formatFazendaLabel(entry),
    variedade: getVariedadeResumo(entry),
    recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || '')
}));

const buildTalhaoRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            rows.push({
                talhao: record.talhao || '',
                area: formatNumber(record.area || 0),
                variedade: record.variedade || '',
                origem: formatOrigemMuda(entry),
                data: formatDate(entry.date)
            });
        });
    });
    return rows;
};

const buildInsumosRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.insumos || []).forEach(insumo => {
            rows.push({
                produto: insumo.produto || '',
                dose: formatNumber(insumo.dose || 0),
                areaTotal: formatNumber(insumo.areaTotal || entry.totalArea || 0),
                totalGasto: formatNumber(insumo.totalGasto || 0),
                data: formatDate(entry.date),
                fazenda: formatFazendaLabel(entry)
            });
        });
    });
    return rows;
};

const buildOperacionalRows = (data) => data.map(entry => ({
    tipoPlantio: entry.tipoPlantio || '',
    recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || ''),
    talhoes: getTalhoesAtendidos(entry),
    areaTotal: formatNumber(entry.totalArea || 0),
    data: formatDate(entry.date),
    os: entry.ordemServico || ''
}));

const generatePlantioResumoPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_resumo.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio - Resumo';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = ['Data', 'Cultura', 'Tipo', 'Área Total', 'O.S', 'Fazenda', 'Variedade', 'Frota/Pessoas'];
        const rows = buildResumoRows(data).map(r => [
            r.data,
            r.cultura,
            r.tipoPlantio,
            r.areaTotal,
            r.os,
            r.fazenda,
            r.variedade,
            r.recurso
        ]);

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Resumo Plantio:", error);
        res.status(500).send('Erro ao gerar relatório.');
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
        const title = 'Relatório de Plantio - Detalhamento por Talhão';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = ['Talhão', 'Área', 'Variedade', 'Origem da Muda', 'Data'];
        const rows = buildTalhaoRows(data).map(r => [r.talhao, r.area, r.variedade, r.origem, r.data]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Talhão Plantio:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

const generatePlantioInsumosPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_insumos.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const rowsData = buildInsumosRows(data);
        const title = 'Relatório de Plantio - Consumo de Insumos';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = ['Produto', 'Dose', 'Área Total', 'Total Consumido', 'Data', 'Fazenda'];
        const rows = rowsData.map(r => [r.produto, r.dose, r.areaTotal, r.totalGasto, r.data, r.fazenda]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Insumos Plantio:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

const generatePlantioOperacionalPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_operacional.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio - Operacional';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = ['Tipo de Plantio', 'Frota/Pessoas', 'Talhões', 'Área Total', 'Data', 'O.S'];
        const rows = buildOperacionalRows(data).map(r => [r.tipoPlantio, r.recurso, r.talhoes, r.areaTotal, r.data, r.os]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Operacional Plantio:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

module.exports = {
    getPlantioData,
    buildResumoRows,
    buildTalhaoRows,
    buildInsumosRows,
    buildOperacionalRows,
    generatePlantioResumoPdf,
    generatePlantioTalhaoPdf,
    generatePlantioInsumosPdf,
    generatePlantioOperacionalPdf
};
