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

const buildResumoRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            rows.push({
                origemFazenda: entry.mudaFazendaNome || '',
                origemTalhao: entry.mudaTalhao || '',
                origemVariedade: record.variedade || '',
                plantioFazenda: formatFazendaLabel(entry),
                plantioTalhao: record.talhao || '',
                plantioVariedade: record.variedade || '',
                data: formatDate(entry.date),
                areaMuda: formatNumber(entry.mudaArea || 0),
                areaPlantio: formatNumber(record.area || 0)
            });
        });
    });
    return rows;
};

const buildTalhaoRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            rows.push({
                fazendaPlantada: formatFazendaLabel(entry),
                data: formatDate(entry.date),
                variedadePlantada: record.variedade || '',
                areaTotal: formatNumber(entry.totalArea || 0),
                talhao: record.talhao || '',
                areaTalhao: formatNumber(record.area || 0),
                origemMudaFazenda: entry.mudaFazendaNome || '',
                variedadeOrigem: record.variedade || '',
                tipoPlantio: entry.tipoPlantio || '',
                recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || ''),
                os: entry.ordemServico || ''
            });
        });
    });
    return rows;
};

const buildInsumosRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.insumos || []).forEach(insumo => {
            const totalCalculado = (entry.totalArea || 0) * (insumo.dose || 0);
            rows.push({
                fazendaPlantada: formatFazendaLabel(entry),
                data: formatDate(entry.date),
                variedadePlantada: getVariedadeResumo(entry),
                areaTotal: formatNumber(entry.totalArea || 0),
                produto: insumo.produto || '',
                dose: formatNumber(insumo.dose || 0),
                totalCalculado: formatNumber(totalCalculado),
                unidade: insumo.unidade || ''
            });
        });
    });
    return rows;
};

const buildOperacionalRows = (data) => data.map(entry => ({
    fazendaPlantada: formatFazendaLabel(entry),
    data: formatDate(entry.date),
    variedadePlantada: getVariedadeResumo(entry),
    areaTotal: formatNumber(entry.totalArea || 0),
    tipoPlantio: entry.tipoPlantio || '',
    recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || ''),
    talhoes: getTalhoesAtendidos(entry),
    os: entry.ordemServico || ''
}));

const formatOptionalNumber = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isNaN(parsed)) return value;
    return formatNumber(parsed);
};

const sortByFarmDateTalhao = (a, b) => {
    const codeA = parseInt(a.farmCode, 10) || 0;
    const codeB = parseInt(b.farmCode, 10) || 0;
    if (codeA !== codeB) return codeA - codeB;
    const dateA = new Date(a.dataSort);
    const dateB = new Date(b.dataSort);
    if (dateA - dateB !== 0) return dateA - dateB;
    const talhaoA = String(a.talhao || '');
    const talhaoB = String(b.talhao || '');
    return talhaoA.localeCompare(talhaoB, undefined, { numeric: true });
};

const buildLegacyGeralRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            rows.push({
                farmCode: entry.farmCode || '',
                fazenda: formatFazendaLabel(entry),
                data: formatDate(entry.date),
                dataSort: entry.date,
                prestador: entry.provider || '',
                leaderId: entry.leaderId || '',
                variedade: record.variedade || '',
                talhao: record.talhao || '',
                area: formatNumber(record.area || 0),
                chuva: formatOptionalNumber(entry.chuva),
                obs: entry.obs || ''
            });
        });
    });
    return rows;
};

const buildLegacyFazendaRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            rows.push({
                farmCode: entry.farmCode || '',
                fazenda: formatFazendaLabel(entry),
                data: formatDate(entry.date),
                dataSort: entry.date,
                prestador: entry.provider || '',
                leaderId: entry.leaderId || '',
                variedade: record.variedade || '',
                talhao: record.talhao || '',
                origemFazenda: entry.mudaFazendaNome || '',
                origemTalhao: entry.mudaTalhao || '',
                area: formatNumber(record.area || 0),
                mudaArea: formatNumber(entry.mudaArea || 0)
            });
        });
    });
    return rows.sort(sortByFarmDateTalhao);
};

const buildLegacyTalhaoRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            rows.push({
                farmCode: entry.farmCode || '',
                fazenda: formatFazendaLabel(entry),
                data: formatDate(entry.date),
                dataSort: entry.date,
                talhao: record.talhao || '',
                variedade: record.variedade || '',
                prestador: entry.provider || '',
                area: formatNumber(record.area || 0),
                chuva: formatOptionalNumber(entry.chuva),
                obs: entry.obs || ''
            });
        });
    });
    return rows.sort(sortByFarmDateTalhao);
};

const drawResumoComparativoTable = async (doc, headers, rows, title, logoBase64, startY) => {
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;
    const tableWidth = pageWidth - margins.left - margins.right;
    const rowHeight = 18;
    const textPadding = 5;
    const centeredColumns = new Set([0, 1, 2, 3, 4, 5]);

    const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
    const numericColumns = headers.map((_, index) => {
        return rows.every(row => {
            const cell = row[index];
            if (cell === '' || cell === null || cell === undefined) return true;
            const cellText = String(cell).trim();
            return /^[0-9,.]+([%])?$/.test(cellText);
        });
    });

    const drawGroupedHeader = (y) => {
        const startX = margins.left;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.rect(startX, y, tableWidth, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
        doc.fillColor('black');

        const origemWidth = columnWidths.slice(0, 3).reduce((sum, w) => sum + w, 0);
        const plantioWidth = columnWidths.slice(3, 6).reduce((sum, w) => sum + w, 0);

        doc.text('Origem da muda', startX, y + (rowHeight - doc.currentLineHeight()) / 2, {
            width: origemWidth,
            align: 'center',
            lineBreak: false
        });
        doc.text('Plantio', startX + origemWidth, y + (rowHeight - doc.currentLineHeight()) / 2, {
            width: plantioWidth,
            align: 'center',
            lineBreak: false
        });

        const cutSize = 4;
        doc.moveTo(startX, y + rowHeight - 2).lineTo(startX + origemWidth - cutSize, y + rowHeight - 2).strokeColor('#000').stroke();
        doc.moveTo(startX + origemWidth + cutSize, y + rowHeight - 2).lineTo(startX + origemWidth + plantioWidth, y + rowHeight - 2).strokeColor('#000').stroke();

        return y + rowHeight;
    };

    const drawRow = (rowData, y, isHeader = false) => {
        const startX = margins.left;
        if (isHeader) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(startX, y, tableWidth, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
            doc.fillColor('black');
        } else {
            doc.font('Helvetica').fontSize(8);
            doc.fillColor('black');
        }

        let currentX = startX;
        rowData.forEach((cell, i) => {
            const colWidth = columnWidths[i];
            const maxTextWidth = colWidth - (textPadding * 2);
            let cellText = String(cell);

            let fontSize = 8;
            doc.fontSize(fontSize);
            while (doc.widthOfString(cellText) > maxTextWidth && fontSize > 5) {
                fontSize -= 0.5;
                doc.fontSize(fontSize);
            }

            const align = isHeader ? 'center' : (centeredColumns.has(i) || numericColumns[i] ? 'center' : 'left');
            doc.text(cellText, currentX + textPadding, y + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align,
                lineBreak: false
            });

            currentX += colWidth;
        });

        return y + rowHeight;
    };

    let currentY = drawGroupedHeader(startY);
    currentY = drawRow(headers, currentY, true);

    for (const row of rows) {
        if (currentY > doc.page.height - margins.bottom - rowHeight) {
            doc.addPage();
            currentY = await generatePdfHeader(doc, title, logoBase64);
            currentY = drawGroupedHeader(currentY);
            currentY = drawRow(headers, currentY, true);
        }
        currentY = drawRow(row, currentY, false);
    }

    return currentY;
};

const generatePlantioResumoPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_resumo.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio - Modelo A (Resumo Comparativo)';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        const rowsData = buildResumoRows(data);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = ['Fazenda', 'Talhão', 'Variedade', 'Fazenda', 'Talhão', 'Variedade', 'Data', 'Área de muda', 'Área de plantio'];
        const rows = rowsData.map(r => [
            r.origemFazenda,
            r.origemTalhao,
            r.origemVariedade,
            r.plantioFazenda,
            r.plantioTalhao,
            r.plantioVariedade,
            r.data,
            r.areaMuda,
            r.areaPlantio
        ]);

        currentY = await drawResumoComparativoTable(doc, headers, rows, title, logoBase64, currentY);
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
        const title = 'Relatório de Plantio - Modelo B (Detalhamento por Talhão)';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        const rowsData = buildTalhaoRows(data);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = [
            'Fazenda plantada',
            'Data',
            'Variedade plantada',
            'Área total',
            'Talhão',
            'Área do talhão',
            'Origem da muda (fazenda)',
            'Variedade origem',
            'Tipo de plantio',
            'Frota (mecanizado) ou Pessoas (manual)',
            'O.S'
        ];
        const rows = rowsData.map(r => [
            r.fazendaPlantada,
            r.data,
            r.variedadePlantada,
            r.areaTotal,
            r.talhao,
            r.areaTalhao,
            r.origemMudaFazenda,
            r.variedadeOrigem,
            r.tipoPlantio,
            r.recurso,
            r.os
        ]);
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
        const title = 'Relatório de Plantio - Modelo C (Consumo de Insumos)';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = [
            'Fazenda plantada',
            'Data',
            'Variedade plantada',
            'Área total',
            'Produto / Insumo',
            'Dose',
            'Total calculado',
            'Unidade'
        ];
        const rows = rowsData.map(r => [
            r.fazendaPlantada,
            r.data,
            r.variedadePlantada,
            r.areaTotal,
            r.produto,
            r.dose,
            r.totalCalculado,
            r.unidade
        ]);
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
        const title = 'Relatório de Plantio - Modelo D (Operacional)';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = [
            'Fazenda plantada',
            'Data',
            'Variedade plantada',
            'Área total',
            'Tipo de plantio',
            'Frota (mecanizado) ou Pessoas (manual)',
            'Talhões',
            'O.S'
        ];
        const rows = buildOperacionalRows(data).map(r => [
            r.fazendaPlantada,
            r.data,
            r.variedadePlantada,
            r.areaTotal,
            r.tipoPlantio,
            r.recurso,
            r.talhoes,
            r.os
        ]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Operacional Plantio:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

const generatePlantioGeralPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_geral.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio - Geral';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        const rowsData = buildLegacyGeralRows(data);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = [
            'Fazenda',
            'Data',
            'Prestador',
            'Matrícula Líder',
            'Variedade',
            'Talhão',
            'Área (ha)',
            'Chuva (mm)',
            'Obs'
        ];
        const rows = rowsData.map(r => [
            r.fazenda,
            r.data,
            r.prestador,
            r.leaderId,
            r.variedade,
            r.talhao,
            r.area,
            r.chuva,
            r.obs
        ]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Geral Plantio:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

const generatePlantioFazendaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_fazenda.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio - Por Fazenda';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        const rowsData = buildLegacyFazendaRows(data);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = [
            'Fazenda',
            'Data',
            'Prestador',
            'Líder',
            'Variedade',
            'Talhão',
            'Fazenda Origem',
            'Talhão Origem',
            'Área (ha)',
            'Muda (ha)'
        ];
        const rows = rowsData.map(r => [
            r.fazenda,
            r.data,
            r.prestador,
            r.leaderId,
            r.variedade,
            r.talhao,
            r.origemFazenda,
            r.origemTalhao,
            r.area,
            r.mudaArea
        ]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Plantio por Fazenda:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

const generatePlantioTalhaoLegacyPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_talhao.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getPlantioData(db, filters);
        const title = 'Relatório de Plantio - Por Talhão';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        const rowsData = buildLegacyTalhaoRows(data);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const headers = [
            'Fazenda',
            'Data',
            'Talhão',
            'Variedade',
            'Prestador',
            'Área (ha)',
            'Chuva (mm)',
            'Obs'
        ];
        const rows = rowsData.map(r => [
            r.fazenda,
            r.data,
            r.talhao,
            r.variedade,
            r.prestador,
            r.area,
            r.chuva,
            r.obs
        ]);
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF Plantio por Talhão:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

module.exports = {
    getPlantioData,
    buildResumoRows,
    buildTalhaoRows,
    buildInsumosRows,
    buildOperacionalRows,
    buildLegacyGeralRows,
    buildLegacyFazendaRows,
    buildLegacyTalhaoRows,
    generatePlantioResumoPdf,
    generatePlantioTalhaoPdf,
    generatePlantioInsumosPdf,
    generatePlantioOperacionalPdf,
    generatePlantioGeralPdf,
    generatePlantioFazendaPdf,
    generatePlantioTalhaoLegacyPdf
};
