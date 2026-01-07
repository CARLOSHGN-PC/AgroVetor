const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow, formatDate } = require('../utils/pdfGenerator');

const normalizeText = (value) => String(value || '').trim();

const getDateValue = (value) => {
    if (!value) return 0;
    if (value && typeof value.toDate === 'function') value = value.toDate();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value);
    const timestamp = parsed.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortEntriesByFarmDate = (a, b) => {
    const farmA = normalizeText(a.farmName).toLocaleLowerCase('pt-BR');
    const farmB = normalizeText(b.farmName).toLocaleLowerCase('pt-BR');
    const farmCompare = farmA.localeCompare(farmB, 'pt-BR', { sensitivity: 'base' });
    if (farmCompare !== 0) return farmCompare;
    const dateA = getDateValue(a.date);
    const dateB = getDateValue(b.date);
    if (dateA !== dateB) return dateB - dateA;
    const createdA = getDateValue(a.createdAt);
    const createdB = getDateValue(b.createdAt);
    if (createdA !== createdB) return createdB - createdA;
    return normalizeText(a.id).localeCompare(normalizeText(b.id), 'pt-BR', { sensitivity: 'base' });
};

const sortRowsByFarmDate = (rows, farmKey = 'farmNameSort', dateKey = 'dataSort', tieKey = 'tieBreaker') => {
    return rows.sort((a, b) => {
        const farmA = normalizeText(a[farmKey]).toLocaleLowerCase('pt-BR');
        const farmB = normalizeText(b[farmKey]).toLocaleLowerCase('pt-BR');
        const farmCompare = farmA.localeCompare(farmB, 'pt-BR', { sensitivity: 'base' });
        if (farmCompare !== 0) return farmCompare;
        const dateA = getDateValue(a[dateKey]);
        const dateB = getDateValue(b[dateKey]);
        if (dateA !== dateB) return dateB - dateA;
        return normalizeText(a[tieKey]).localeCompare(normalizeText(b[tieKey]), 'pt-BR', { sensitivity: 'base' });
    });
};

const parseNumericValue = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    const normalized = String(value).replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const isCanaCulture = (filters) => normalizeText(filters?.cultura) === 'Cana-de-açúcar';

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

    return data.sort(sortEntriesByFarmDate);
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
                dataSort: entry.date,
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${record.talhao || ''}-${record.variedade || ''}`,
                areaMuda: formatNumber(entry.mudaArea || 0),
                areaPlantio: formatNumber(record.area || 0),
                areaMudaValue: parseNumericValue(entry.mudaArea || 0),
                areaPlantioValue: parseNumericValue(record.area || 0)
            });
        });
    });
    return sortRowsByFarmDate(rows);
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
                os: entry.ordemServico || '',
                dataSort: entry.date,
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${record.talhao || ''}-${record.variedade || ''}`,
                areaTotalValue: parseNumericValue(entry.totalArea || 0),
                areaTalhaoValue: parseNumericValue(record.area || 0)
            });
        });
    });
    return sortRowsByFarmDate(rows);
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
                unidade: insumo.unidade || '',
                dataSort: entry.date,
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${insumo.produto || ''}`,
                areaTotalValue: parseNumericValue(entry.totalArea || 0),
                doseValue: parseNumericValue(insumo.dose || 0),
                totalCalculadoValue: parseNumericValue(totalCalculado)
            });
        });
    });
    return sortRowsByFarmDate(rows);
};

const buildOperacionalRows = (data) => sortRowsByFarmDate(data.map(entry => ({
    fazendaPlantada: formatFazendaLabel(entry),
    data: formatDate(entry.date),
    variedadePlantada: getVariedadeResumo(entry),
    areaTotal: formatNumber(entry.totalArea || 0),
    tipoPlantio: entry.tipoPlantio || '',
    recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || ''),
    talhoes: getTalhoesAtendidos(entry),
    os: entry.ordemServico || '',
    dataSort: entry.date,
    farmNameSort: entry.farmName || '',
    tieBreaker: entry.id || '',
    areaTotalValue: parseNumericValue(entry.totalArea || 0)
})));

const formatOptionalNumber = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isNaN(parsed)) return value;
    return formatNumber(parsed);
};

const buildLegacyGeralRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            const chuvaValue = parseNumericValue(entry.chuva || 0);
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
                obs: entry.obs || '',
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${record.talhao || ''}`,
                areaValue: parseNumericValue(record.area || 0),
                chuvaValue
            });
        });
    });
    return sortRowsByFarmDate(rows);
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
                mudaArea: formatNumber(entry.mudaArea || 0),
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${record.talhao || ''}`,
                areaValue: parseNumericValue(record.area || 0),
                mudaAreaValue: parseNumericValue(entry.mudaArea || 0)
            });
        });
    });
    return sortRowsByFarmDate(rows);
};

const buildLegacyTalhaoRows = (data) => {
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            const chuvaValue = parseNumericValue(entry.chuva || 0);
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
                obs: entry.obs || '',
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${record.talhao || ''}`,
                areaValue: parseNumericValue(record.area || 0),
                chuvaValue
            });
        });
    });
    return sortRowsByFarmDate(rows);
};

const sumRows = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

const getPlantioFazendaColumns = (isCana) => {
    if (isCana) {
        return [
            { id: 'fazenda', title: 'Fazenda' },
            { id: 'data', title: 'Data' },
            { id: 'prestador', title: 'Prestador' },
            { id: 'leaderId', title: 'Líder' },
            { id: 'variedade', title: 'Variedade', align: 'center' },
            { id: 'talhao', title: 'Talhão', align: 'center' },
            { id: 'origemFazenda', title: 'Fazenda Origem' },
            { id: 'origemTalhao', title: 'Talhão Origem', align: 'center' },
            { id: 'area', title: 'Área (ha)' },
            { id: 'mudaArea', title: 'Muda (ha)' }
        ];
    }

    return [
        { id: 'fazenda', title: 'Fazenda' },
        { id: 'data', title: 'Data' },
        { id: 'prestador', title: 'Prestador' },
        { id: 'leaderId', title: 'Líder' },
        { id: 'variedade', title: 'Variedade', align: 'center' },
        { id: 'talhao', title: 'Talhão', align: 'center' },
        { id: 'area', title: 'Área (ha)' }
    ];
};

const drawResumoComparativoTable = async (doc, headers, rows, title, logoBase64, startY) => {
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;
    const tableWidth = pageWidth - margins.left - margins.right;
    const rowHeight = 18;
    const textPadding = 5;
    const centeredColumns = new Set([1, 2, 4, 5]);

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

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        currentY = await drawResumoComparativoTable(doc, headers, rows, title, logoBase64, currentY);

        const totalMuda = sumRows(rowsData, 'areaMudaValue');
        const totalPlantio = sumRows(rowsData, 'areaPlantioValue');
        const totalRow = ['', '', '', '', '', '', 'TOTAL GERAL', formatNumber(totalMuda), formatNumber(totalPlantio)];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
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
        const columnAlignments = [];
        columnAlignments[2] = 'center';
        columnAlignments[4] = 'center';
        columnAlignments[7] = 'center';
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);

        const totalAreaTotal = sumRows(rowsData, 'areaTotalValue');
        const totalAreaTalhao = sumRows(rowsData, 'areaTalhaoValue');
        const totalRow = ['', '', 'TOTAL GERAL', formatNumber(totalAreaTotal), '', formatNumber(totalAreaTalhao), '', '', '', '', ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
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
        const columnAlignments = [];
        columnAlignments[2] = 'center';
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);

        const totalArea = sumRows(rowsData, 'areaTotalValue');
        const totalDose = sumRows(rowsData, 'doseValue');
        const totalCalculado = sumRows(rowsData, 'totalCalculadoValue');
        const totalRow = ['', '', 'TOTAL GERAL', formatNumber(totalArea), '', formatNumber(totalDose), formatNumber(totalCalculado), ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
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
        const rowsData = buildOperacionalRows(data);
        const rows = rowsData.map(r => [
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
        const columnAlignments = [];
        columnAlignments[2] = 'center';
        columnAlignments[6] = 'center';
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);

        const totalArea = sumRows(rowsData, 'areaTotalValue');
        const totalRow = ['', '', 'TOTAL GERAL', formatNumber(totalArea), '', '', '', ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
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
        const columnAlignments = [];
        columnAlignments[4] = 'center';
        columnAlignments[5] = 'center';
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);

        const totalArea = sumRows(rowsData, 'areaValue');
        const totalChuva = sumRows(rowsData, 'chuvaValue');
        const totalRow = ['', '', '', '', '', 'TOTAL GERAL', formatNumber(totalArea), formatNumber(totalChuva), ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
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
        const isCana = isCanaCulture(filters);

        if (rowsData.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);
        const columns = getPlantioFazendaColumns(isCana);
        const headers = columns.map(col => col.title);
        const rows = rowsData.map(row => columns.map(col => row[col.id]));
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        const columnAlignments = [];
        columns.forEach((col, index) => {
            if (col.align) columnAlignments[index] = col.align;
        });

        const grouped = rowsData.reduce((acc, row) => {
            const key = row.fazenda || '';
            if (!acc[key]) acc[key] = { farmNameSort: row.farmNameSort, rows: [] };
            acc[key].rows.push(row);
            return acc;
        }, {});

        const sortedFarms = Object.entries(grouped)
            .sort(([, a], [, b]) => normalizeText(a.farmNameSort).localeCompare(normalizeText(b.farmNameSort), 'pt-BR', { sensitivity: 'base' }));

        const fazendaColumnIndex = columns.findIndex(col => col.id === 'fazenda');
        const areaColumnIndex = columns.findIndex(col => col.id === 'area');
        const mudaAreaColumnIndex = columns.findIndex(col => col.id === 'mudaArea');
        const rowsWithSubtotals = [];
        let grandTotalArea = 0;
        let grandTotalMuda = 0;

        for (const [farmLabel, farmGroup] of sortedFarms) {
            farmGroup.rows.sort((a, b) => getDateValue(b.dataSort) - getDateValue(a.dataSort));
            farmGroup.rows.forEach(row => {
                rowsWithSubtotals.push(columns.map(col => row[col.id]));
            });

            const subtotalArea = sumRows(farmGroup.rows, 'areaValue');
            const subtotalMuda = sumRows(farmGroup.rows, 'mudaAreaValue');
            const subtotalRow = new Array(headers.length).fill('');
            if (fazendaColumnIndex !== -1) {
                subtotalRow[fazendaColumnIndex] = `SUBTOTAL – ${farmLabel}`;
            }
            if (areaColumnIndex !== -1) {
                subtotalRow[areaColumnIndex] = formatNumber(subtotalArea);
            }
            if (isCana && mudaAreaColumnIndex !== -1) {
                subtotalRow[mudaAreaColumnIndex] = formatNumber(subtotalMuda);
            }
            rowsWithSubtotals.push(subtotalRow);

            grandTotalArea += subtotalArea;
            grandTotalMuda += subtotalMuda;
        }

        currentY = await drawTable(doc, headers, rowsWithSubtotals, title, logoBase64, currentY, columnWidths, columnAlignments);

        const totalRow = new Array(headers.length).fill('');
        if (fazendaColumnIndex !== -1) {
            totalRow[fazendaColumnIndex] = 'TOTAL GERAL';
        }
        if (areaColumnIndex !== -1) {
            totalRow[areaColumnIndex] = formatNumber(grandTotalArea);
        }
        if (isCana && mudaAreaColumnIndex !== -1) {
            totalRow[mudaAreaColumnIndex] = formatNumber(grandTotalMuda);
        }
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);

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
        const columnAlignments = [];
        columnAlignments[2] = 'center';
        columnAlignments[3] = 'center';
        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);

        const totalArea = sumRows(rowsData, 'areaValue');
        const totalChuva = sumRows(rowsData, 'chuvaValue');
        const totalRow = ['', '', '', '', 'TOTAL GERAL', formatNumber(totalArea), formatNumber(totalChuva), ''];
        await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
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
    getPlantioFazendaColumns,
    generatePlantioResumoPdf,
    generatePlantioTalhaoPdf,
    generatePlantioInsumosPdf,
    generatePlantioOperacionalPdf,
    generatePlantioGeralPdf,
    generatePlantioFazendaPdf,
    generatePlantioTalhaoLegacyPdf
};
