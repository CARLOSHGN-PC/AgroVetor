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
const CANA_FARM_NAME_MAX_LENGTH = 28;

const normalizeWordForShortening = (word) => {
    if (!word) return '';
    return String(word)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
};

const shortenCanaFarmName = (originalName, maxLength = CANA_FARM_NAME_MAX_LENGTH) => {
    if (!originalName) return '';
    const rawName = String(originalName || '').trim();
    if (!rawName) return '';
    const limit = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : CANA_FARM_NAME_MAX_LENGTH;
    const divider = ' - ';
    const dividerIndex = rawName.indexOf(divider);
    const prefix = dividerIndex >= 0 ? rawName.slice(0, dividerIndex).trim() : '';
    const rest = dividerIndex >= 0 ? rawName.slice(dividerIndex + divider.length).trim() : rawName;

    const abbreviations = {
        FAZENDA: 'FAZ.',
        SANTA: 'STA',
        SANTO: 'STO',
        SAO: 'S.',
        COMERCIO: 'COM.',
        INDUSTRIA: 'IND.',
        AGRICOLA: 'AGR.'
    };

    const restWords = rest.split(/\s+/).filter(Boolean);
    const abbreviatedWords = restWords.map(word => {
        const normalized = normalizeWordForShortening(word);
        return abbreviations[normalized] || word;
    });

    const buildFullName = (restValue) => {
        if (prefix && restValue) return `${prefix} - ${restValue}`.trim();
        if (prefix) return prefix;
        return restValue;
    };

    let restAbbreviated = abbreviatedWords.join(' ').replace(/\s+/g, ' ').trim();
    let fullName = buildFullName(restAbbreviated);

    if (fullName.length > limit) {
        const fillerWords = new Set(['DE', 'DA', 'DO']);
        const filteredWords = abbreviatedWords.filter(word => !fillerWords.has(normalizeWordForShortening(word)));
        restAbbreviated = filteredWords.join(' ').replace(/\s+/g, ' ').trim();
        fullName = buildFullName(restAbbreviated);
    }

    if (fullName.length <= limit) return fullName;

    const sliceLength = Math.max(0, limit - 3);
    return `${fullName.slice(0, sliceLength).trimEnd()}...`;
};

const getCompanyName = async (db, companyId) => {
    if (!companyId) return '';
    try {
        const companyDoc = await db.collection('companies').doc(companyId).get();
        if (!companyDoc.exists) return '';
        const data = companyDoc.data() || {};
        return data.name || data.companyName || '';
    } catch (error) {
        console.warn('Não foi possível obter o nome da empresa:', error.message);
        return '';
    }
};

const formatDateTime = (date) => {
    if (!(date instanceof Date)) return '';
    const formatted = date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    return formatted.replace(',', '');
};

const getTipoPlantioAbreviado = (tipoPlantio) => {
    const normalized = normalizeText(tipoPlantio).toLowerCase();
    if (!normalized) return '-';
    if (normalized.includes('mec')) return 'Mec';
    if (normalized.includes('man')) return 'Man';
    return '-';
};

const getTipoPlantioDisplay = (tipoPlantio, isCana) => {
    if (isCana) return getTipoPlantioAbreviado(tipoPlantio);
    return tipoPlantio || '';
};

const createCanaHeaderRenderer = async (doc, title, logoBase64, filters, db) => {
    const companyName = await getCompanyName(db, filters.companyId);
    const generatedAt = new Date();
    const periodo = `${formatDate(filters.inicio) || '-'} a ${formatDate(filters.fim) || '-'}`;
    let pageNumber = 0;

    return async () => {
        pageNumber += 1;
        return drawCanaPlantioHeader(doc, {
            title,
            logoBase64,
            companyName,
            generatedAt,
            periodo,
            pageNumber
        });
    };
};

const drawCanaPlantioHeader = (doc, { title, logoBase64, companyName, generatedAt, periodo, pageNumber }) => {
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;
    const availableWidth = pageWidth - margins.left - margins.right;
    const headerTop = 15;
    const lineHeight = 12;
    const logoWidth = logoBase64 ? 40 : 0;
    const logoPadding = logoBase64 ? 10 : 0;
    const logoColumnWidth = logoWidth + logoPadding;
    const textAreaX = margins.left + logoColumnWidth;
    const textAreaWidth = availableWidth - logoColumnWidth;
    const blockWidth = textAreaWidth / 3;

    if (logoBase64) {
        try {
            if ((typeof logoBase64 === 'string' && logoBase64.startsWith('data:image')) || Buffer.isBuffer(logoBase64)) {
                doc.image(logoBase64, margins.left, headerTop, { width: 40 });
            }
        } catch (e) {
            console.warn('Failed to render logo image:', e.message);
        }
    }

    const leftX = textAreaX;
    const centerX = textAreaX + blockWidth;
    const rightX = textAreaX + (blockWidth * 2);

    doc.font('Helvetica-Bold').fontSize(8)
        .text(companyName || '', leftX, headerTop, { width: blockWidth, align: 'left' });
    doc.font('Helvetica').fontSize(8)
        .text(title, leftX, headerTop + lineHeight, { width: blockWidth, align: 'left' });
    doc.font('Helvetica').fontSize(8)
        .text('Cultura: Cana-de-açúcar', leftX, headerTop + (lineHeight * 2), { width: blockWidth, align: 'left' });

    doc.font('Helvetica-Bold').fontSize(8)
        .text(title, centerX, headerTop + lineHeight, { width: blockWidth, align: 'center' });

    doc.font('Helvetica').fontSize(8)
        .text(`Data/Hora: ${formatDateTime(generatedAt)}`, rightX, headerTop, { width: blockWidth, align: 'right' });
    doc.font('Helvetica').fontSize(8)
        .text(`Período: ${periodo}`, rightX, headerTop + lineHeight, { width: blockWidth, align: 'right' });
    doc.font('Helvetica').fontSize(8)
        .text(`Página: ${pageNumber}`, rightX, headerTop + (lineHeight * 2), { width: blockWidth, align: 'right' });

    doc.moveDown(2);
    doc.y = headerTop + (lineHeight * 3) + 10;
    return doc.y;
};

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

const getTalhoesList = (entry) => {
    const talhoes = [];
    if (Array.isArray(entry.records)) {
        entry.records.forEach(record => {
            if (record && record.talhao !== undefined && record.talhao !== null) {
                const normalized = String(record.talhao).trim();
                if (normalized) talhoes.push(normalized);
            }
        });
    }

    if (talhoes.length === 0 && entry.talhoes) {
        if (Array.isArray(entry.talhoes)) {
            entry.talhoes.forEach(talhao => {
                const normalized = String(talhao || '').trim();
                if (normalized) talhoes.push(normalized);
            });
        } else if (typeof entry.talhoes === 'string') {
            entry.talhoes.split(',').forEach(talhao => {
                const normalized = String(talhao || '').trim();
                if (normalized) talhoes.push(normalized);
            });
        }
    }

    return talhoes;
};

const buildResumoRows = (data, options = {}) => {
    const { isCana = false } = options;
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            const origemFazenda = entry.mudaFazendaNome || '';
            const plantioFazenda = formatFazendaLabel(entry);
            const mudaAreaRaw = record.areaMudaHa ?? record.areaMuda ?? entry.mudaArea ?? 0;
            rows.push({
                origemFazenda: isCana ? shortenCanaFarmName(origemFazenda) : origemFazenda,
                origemTalhao: entry.mudaTalhao || '',
                origemVariedade: record.variedade || '',
                plantioFazenda: isCana ? shortenCanaFarmName(plantioFazenda) : plantioFazenda,
                plantioTalhao: record.talhao || '',
                plantioVariedade: record.variedade || '',
                tipoPlantio: getTipoPlantioDisplay(entry.tipoPlantio, isCana),
                data: formatDate(entry.date),
                dataSort: entry.date,
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${record.talhao || ''}-${record.variedade || ''}`,
                areaMuda: formatNumber(mudaAreaRaw),
                areaPlantio: formatNumber(record.area || 0),
                areaMudaValue: parseNumericValue(mudaAreaRaw),
                areaPlantioValue: parseNumericValue(record.area || 0)
            });
        });
    });
    return sortRowsByFarmDate(rows);
};

const getCanaResumoHeaders = () => ([
    'Faz Orig.',
    'Talh Orig.',
    'Var Orig.',
    'Faz Plant.',
    'Talh Plant.',
    'Var Plant.',
    'Tp Plant.',
    'Data',
    'Área Mda (ha)',
    'Área Plt (ha)'
]);

const getCanaResumoRow = (row) => ([
    row.origemFazenda,
    row.origemTalhao,
    row.origemVariedade,
    row.plantioFazenda,
    row.plantioTalhao,
    row.plantioVariedade,
    row.tipoPlantio,
    row.data,
    row.areaMuda,
    row.areaPlantio
]);

const getCanaResumoColumnAlignments = () => {
    const columnAlignments = [];
    columnAlignments[0] = 'left';
    columnAlignments[1] = 'center';
    columnAlignments[2] = 'center';
    columnAlignments[3] = 'left';
    columnAlignments[4] = 'center';
    columnAlignments[5] = 'center';
    columnAlignments[6] = 'center';
    columnAlignments[7] = 'center';
    columnAlignments[8] = 'right';
    columnAlignments[9] = 'right';
    return columnAlignments;
};

const buildCanaResumoTotalRow = (label, totalMuda, totalPlantio) => ([
    label,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    formatNumber(totalMuda),
    formatNumber(totalPlantio)
]);

const groupResumoRowsByPlantioFarm = (rows) => {
    const sortedRows = sortRowsByFarmDate([...rows], 'plantioFazenda', 'dataSort', 'tieBreaker');
    const sections = [];
    let currentFarmKey = null;
    let currentFarmLabel = '';
    let currentRows = [];

    sortedRows.forEach(row => {
        const farmLabel = row.plantioFazenda || '';
        const farmKey = normalizeText(farmLabel).toLocaleLowerCase('pt-BR');
        if (currentFarmKey === null) {
            currentFarmKey = farmKey;
            currentFarmLabel = farmLabel;
        }

        if (farmKey !== currentFarmKey) {
            sections.push({ farmName: currentFarmLabel, rows: currentRows });
            currentFarmKey = farmKey;
            currentFarmLabel = farmLabel;
            currentRows = [];
        }

        currentRows.push(row);
    });

    if (currentFarmKey !== null) {
        sections.push({ farmName: currentFarmLabel, rows: currentRows });
    }

    return sections;
};

const buildTalhaoRows = (data, options = {}) => {
    const { isCana = false } = options;
    const rows = [];
    data.forEach(entry => {
        (entry.records || []).forEach(record => {
            const fazendaPlantada = formatFazendaLabel(entry);
            rows.push({
                fazendaPlantada,
                data: formatDate(entry.date),
                variedadePlantada: record.variedade || '',
                areaTotal: formatNumber(entry.totalArea || 0),
                talhao: record.talhao || '',
                areaTalhao: formatNumber(record.area || 0),
                origemMudaFazenda: isCana ? shortenCanaFarmName(entry.mudaFazendaNome || '') : (entry.mudaFazendaNome || ''),
                variedadeOrigem: record.variedade || '',
                tipoPlantio: getTipoPlantioDisplay(entry.tipoPlantio, isCana),
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

const buildInsumosRows = (data, options = {}) => {
    const { isCana = false } = options;
    const rows = [];
    data.forEach(entry => {
        (entry.insumos || []).forEach(insumo => {
            const totalCalculado = (entry.totalArea || 0) * (insumo.dose || 0);
            const fazendaPlantada = formatFazendaLabel(entry);
            rows.push({
                fazendaPlantada: isCana ? shortenCanaFarmName(fazendaPlantada) : fazendaPlantada,
                talhao: getTalhoesAtendidos(entry),
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

const buildOperacionalRows = (data, options = {}) => {
    const { isCana = false } = options;
    if (!isCana) {
        return sortRowsByFarmDate(data.map(entry => ({
            fazendaPlantada: formatFazendaLabel(entry),
            data: formatDate(entry.date),
            variedadePlantada: getVariedadeResumo(entry),
            areaTotal: formatNumber(entry.totalArea || 0),
            tipoPlantio: getTipoPlantioDisplay(entry.tipoPlantio, isCana),
            recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || ''),
            talhao: getTalhoesAtendidos(entry),
            os: entry.ordemServico || '',
            dataSort: entry.date,
            farmNameSort: entry.farmName || '',
            tieBreaker: entry.id || '',
            areaTotalValue: parseNumericValue(entry.totalArea || 0)
        })));
    }

    const rows = [];

    data.forEach(entry => {
        const talhoesList = getTalhoesList(entry);
        const talhoes = talhoesList.length > 0 ? talhoesList : [''];
        const fazendaPlantada = formatFazendaLabel(entry);

        talhoes.forEach((talhao, index) => {
            rows.push({
                fazendaPlantada: shortenCanaFarmName(fazendaPlantada),
                data: formatDate(entry.date),
                variedadePlantada: getVariedadeResumo(entry),
                areaTotal: formatNumber(entry.totalArea || 0),
                tipoPlantio: getTipoPlantioDisplay(entry.tipoPlantio, isCana),
                recurso: entry.tipoPlantio === 'Manual' ? (entry.quantidadePessoas || '') : (entry.frotaLabel || ''),
                talhao,
                os: entry.ordemServico || '',
                dataSort: entry.date,
                farmNameSort: entry.farmName || '',
                tieBreaker: `${entry.id || ''}-${talhao}-${index}`,
                areaTotalValue: parseNumericValue(entry.totalArea || 0)
            });
        });
    });

    return sortRowsByFarmDate(rows);
};

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

const drawResumoComparativoTable = async (doc, headers, rows, title, logoBase64, startY, options = {}) => {
    const { columnAlignments = [], headerRenderer = null, ellipsis = false } = options;
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

            const align = isHeader ? 'center' : (columnAlignments[i] || (centeredColumns.has(i) || numericColumns[i] ? 'center' : 'left'));
            doc.text(cellText, currentX + textPadding, y + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align,
                lineBreak: false,
                ellipsis
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
            currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
            currentY = drawGroupedHeader(currentY);
            currentY = drawRow(headers, currentY, true);
        }
        currentY = drawRow(row, currentY, false);
    }

    return currentY;
};

const drawResumoComparativoGroupedTable = async (doc, headers, sections, title, logoBase64, startY, options = {}) => {
    const { columnAlignments = [], headerRenderer = null, columnWidths = null, showGroupTitle = true } = options;
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;
    const tableWidth = pageWidth - margins.left - margins.right;
    const rowHeight = 18;
    const textPadding = 5;
    const centeredColumns = new Set([1, 2, 4, 5]);

    const allRows = sections.flatMap(section => {
        const mappedRows = section.rows.map(getCanaResumoRow);
        if (section.subtotalRow) mappedRows.push(section.subtotalRow);
        return mappedRows;
    });
    const resolvedColumnWidths = columnWidths || calculateColumnWidths(doc, headers, allRows, doc.page.width, doc.page.margins);
    const numericColumns = headers.map((_, index) => {
        return allRows.every(row => {
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

        const origemWidth = resolvedColumnWidths.slice(0, 3).reduce((sum, w) => sum + w, 0);
        const plantioWidth = resolvedColumnWidths.slice(3, 6).reduce((sum, w) => sum + w, 0);

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

    const drawRow = (rowData, y, { isHeader = false, isSummary = false, isGroupTitle = false } = {}) => {
        const startX = margins.left;
        if (isHeader || isSummary) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(startX, y, tableWidth, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
            doc.fillColor('black');
        } else if (isGroupTitle) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.fillColor('black');
        } else {
            doc.font('Helvetica').fontSize(8);
            doc.fillColor('black');
        }

        if (isGroupTitle) {
            const label = rowData[0] || '';
            doc.text(label, startX + textPadding, y + (rowHeight - doc.currentLineHeight()) / 2, {
                width: tableWidth - (textPadding * 2),
                align: 'left',
                lineBreak: false
            });
            return y + rowHeight;
        }

        let currentX = startX;
        rowData.forEach((cell, i) => {
            const colWidth = resolvedColumnWidths[i];
            const maxTextWidth = colWidth - (textPadding * 2);
            const cellText = String(cell);

            let align;
            if (isHeader) {
                align = 'center';
            } else if (isSummary) {
                const isNumber = (typeof cell === 'number' || (typeof cell === 'string' && /^[0-9,.]+([%])?$/.test(cell.trim())));
                align = isNumber ? 'right' : 'left';
            } else {
                align = columnAlignments[i] || (centeredColumns.has(i) || numericColumns[i] ? 'center' : 'left');
            }

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
    currentY = drawRow(headers, currentY, { isHeader: true });

    for (const section of sections) {
        if (currentY > doc.page.height - margins.bottom - rowHeight) {
            doc.addPage();
            currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
            currentY = drawGroupedHeader(currentY);
            currentY = drawRow(headers, currentY, { isHeader: true });
        }
        const farmLabel = section.farmName || '-';
        if (showGroupTitle) {
            currentY = drawRow([`Fazenda: ${farmLabel}`], currentY, { isGroupTitle: true });
        }

        for (const row of section.rows) {
            if (currentY > doc.page.height - margins.bottom - rowHeight) {
                doc.addPage();
                currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
                currentY = drawGroupedHeader(currentY);
                currentY = drawRow(headers, currentY, { isHeader: true });
                if (showGroupTitle) {
                    currentY = drawRow([`Fazenda: ${farmLabel}`], currentY, { isGroupTitle: true });
                }
            }
            currentY = drawRow(getCanaResumoRow(row), currentY);
        }

        if (section.subtotalRow) {
            if (currentY > doc.page.height - margins.bottom - rowHeight) {
                doc.addPage();
                currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
                currentY = drawGroupedHeader(currentY);
                currentY = drawRow(headers, currentY, { isHeader: true });
                if (showGroupTitle) {
                    currentY = drawRow([`Fazenda: ${farmLabel}`], currentY, { isGroupTitle: true });
                }
            }
            currentY = drawRow(section.subtotalRow, currentY, { isSummary: true });
        }
    }

    return currentY;
};

const drawCanaTable = async (doc, headers, rows, title, logoBase64, startY, columnWidths, columnAlignments, headerRenderer) => {
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;
    const rowHeight = 18;
    const textPadding = 5;
    let currentY = startY;

    const drawRowContent = (rowData, y, isHeader = false, isSummary = false) => {
        const startX = margins.left;

        if (isHeader) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(startX, y, pageWidth - margins.left - margins.right, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
            doc.fillColor('black');
        } else if (isSummary) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(startX, y, pageWidth - margins.left - margins.right, rowHeight).fillAndStroke('#f0f0f0', '#f0f0f0');
            doc.fillColor('black');
        } else {
            doc.font('Helvetica').fontSize(8);
            doc.fillColor('black');
        }

        let currentX = startX;

        rowData.forEach((cell, i) => {
            if (i >= columnWidths.length) return;
            const colWidth = columnWidths[i];
            const maxTextWidth = colWidth - (textPadding * 2);
            const cellText = String(cell);

            const align = (columnAlignments && columnAlignments[i]) ? columnAlignments[i] : 'left';
            doc.text(cellText, currentX + textPadding, y + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align,
                lineBreak: false,
                ellipsis: true
            });

            currentX += colWidth;
        });

        return y + rowHeight;
    };

    currentY = drawRowContent(headers, currentY, true);

    for (const row of rows) {
        if (currentY > doc.page.height - margins.bottom - rowHeight) {
            doc.addPage();
            currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
            currentY = drawRowContent(headers, currentY, true);
        }
        const isSubtotalRow = row.some(cell => typeof cell === 'string' && cell.trim().toUpperCase() === 'SUBTOTAL');
        currentY = drawRowContent(row, currentY, isSubtotalRow);
    }

    return currentY;
};

const drawCanaSummaryRow = async (doc, rowData, currentY, columnWidths, title, logoBase64, headerRenderer) => {
    const margins = doc.page.margins;
    const rowHeight = 18;
    const textPadding = 5;

    if (currentY > doc.page.height - margins.bottom - rowHeight) {
        doc.addPage();
        currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
    }

    const startX = margins.left;
    doc.font('Helvetica-Bold').fontSize(8);
    doc.rect(startX, currentY, doc.page.width - margins.left - margins.right, rowHeight).fillAndStroke('#f0f0f0', '#f0f0f0');
    doc.fillColor('black');

    let currentX = startX;

    for (let i = 0; i < rowData.length; i++) {
        if (i >= columnWidths.length) break;

        const cell = rowData[i];
        const cellText = String(cell);
        const isNumber = (typeof cell === 'number' || (typeof cell === 'string' && /^[0-9,.]+([%])?$/.test(cell.trim())));

        let drawX = currentX;
        let drawWidth = columnWidths[i];
        let align = isNumber ? 'right' : 'left';

        if (cellText && !isNumber) {
            let mergeStartIndex = i;
            let extraWidth = 0;

            for (let j = i - 1; j >= 0; j--) {
                if (!rowData[j] || rowData[j] === '') {
                    extraWidth += columnWidths[j];
                    mergeStartIndex = j;
                } else {
                    break;
                }
            }

            if (extraWidth > 0) {
                let tempX = startX;
                for (let k = 0; k < mergeStartIndex; k++) tempX += columnWidths[k];

                drawX = tempX;
                drawWidth = extraWidth + columnWidths[i];
                align = 'right';
            }
        }

        if (cellText) {
            const maxTextWidth = drawWidth - (textPadding * 2);
            doc.text(cellText, drawX + textPadding, currentY + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align,
                lineBreak: false,
                ellipsis: true
            });
        }

        currentX += columnWidths[i];
    }

    return currentY + rowHeight;
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
        const isCana = isCanaCulture(filters);
        const rowsData = buildResumoRows(data, { isCana });
        const headerRenderer = isCana ? await createCanaHeaderRenderer(doc, title, logoBase64, filters, db) : null;

        if (rowsData.length === 0) {
            if (headerRenderer) {
                await headerRenderer();
            } else {
                await generatePdfHeader(doc, title, logoBase64);
            }
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
        const headers = isCana
            ? getCanaResumoHeaders()
            : ['Fazenda', 'Talhão', 'Variedade', 'Fazenda', 'Talhão', 'Variedade', 'Data', 'Área de muda', 'Área de plantio'];
        const rows = rowsData.map(r => (isCana ? getCanaResumoRow(r) : [
            r.origemFazenda,
            r.origemTalhao,
            r.origemVariedade,
            r.plantioFazenda,
            r.plantioTalhao,
            r.plantioVariedade,
            r.data,
            r.areaMuda,
            r.areaPlantio
        ]));

        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        const columnAlignments = [];
        const canaColumnAlignments = getCanaResumoColumnAlignments();
        if (isCana) columnAlignments.push(...canaColumnAlignments);

        currentY = await drawResumoComparativoTable(doc, headers, rows, title, logoBase64, currentY, {
            columnAlignments,
            headerRenderer,
            ellipsis: isCana
        });

        const totalMuda = sumRows(rowsData, 'areaMudaValue');
        const totalPlantio = sumRows(rowsData, 'areaPlantioValue');
        const totalRow = isCana
            ? buildCanaResumoTotalRow('TOTAL GERAL', totalMuda, totalPlantio)
            : ['', '', '', '', '', '', 'TOTAL GERAL', formatNumber(totalMuda), formatNumber(totalPlantio)];
        if (headerRenderer) {
            await drawCanaSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64, headerRenderer);
        } else {
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
        }
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
        const isCana = isCanaCulture(filters);
        const rowsData = buildTalhaoRows(data, { isCana });
        const headerRenderer = isCana ? await createCanaHeaderRenderer(doc, title, logoBase64, filters, db) : null;

        if (rowsData.length === 0) {
            if (headerRenderer) {
                await headerRenderer();
            } else {
                await generatePdfHeader(doc, title, logoBase64);
            }
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
        const headers = isCana ? [
            'Faz.',
            'Talh.',
            'Área Talh. (ha)',
            'Var. Plant.',
            'Data',
            'Área Tot. (ha)',
            'Origem Muda',
            'Var. Orig.',
            'Tp Plant.',
            'Recurso',
            'O.S.'
        ] : [
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
        const sanitizeCanaCell = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        const canaHeaders = isCana ? headers.map(sanitizeCanaCell) : headers;
        const rows = rowsData.map(r => (isCana ? [
            shortenCanaFarmName(r.fazendaPlantada),
            r.talhao,
            r.areaTalhao,
            r.variedadePlantada,
            r.data,
            r.areaTotal,
            shortenCanaFarmName(r.origemMudaFazenda),
            r.variedadeOrigem,
            r.tipoPlantio,
            r.recurso,
            r.os
        ].map(sanitizeCanaCell) : [
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
        ]));
        const renderedHeaders = isCana ? canaHeaders : headers;
        const columnWidths = calculateColumnWidths(doc, renderedHeaders, rows, doc.page.width, doc.page.margins);
        const columnAlignments = [];
        if (isCana) {
            columnAlignments[0] = 'left';
            columnAlignments[1] = 'center';
            columnAlignments[2] = 'right';
            columnAlignments[3] = 'center';
            columnAlignments[4] = 'center';
            columnAlignments[5] = 'right';
            columnAlignments[6] = 'left';
            columnAlignments[7] = 'center';
            columnAlignments[8] = 'center';
            columnAlignments[9] = 'left';
            columnAlignments[10] = 'center';
        } else {
            columnAlignments[2] = 'center';
            columnAlignments[4] = 'center';
            columnAlignments[7] = 'center';
        }

        if (headerRenderer) {
            currentY = await drawCanaTable(doc, renderedHeaders, rows, title, logoBase64, currentY, columnWidths, columnAlignments, headerRenderer);
        } else {
            currentY = await drawTable(doc, renderedHeaders, rows, title, logoBase64, currentY, columnWidths, columnAlignments);
        }

        const totalAreaTotal = sumRows(rowsData, 'areaTotalValue');
        const totalAreaTalhao = sumRows(rowsData, 'areaTalhaoValue');
        const totalRow = isCana
            ? ['TOTAL GERAL', '', formatNumber(totalAreaTalhao), '', '', formatNumber(totalAreaTotal), '', '', '', '', '']
            : ['', '', 'TOTAL GERAL', formatNumber(totalAreaTotal), '', formatNumber(totalAreaTalhao), '', '', '', '', ''];
        if (headerRenderer) {
            await drawCanaSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64, headerRenderer);
        } else {
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
        }
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
        const isCana = isCanaCulture(filters);
        const data = await getPlantioData(db, filters);
        const rowsData = buildInsumosRows(data, { isCana });
        const title = 'Relatório de Plantio - Modelo C (Consumo de Insumos)';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        const headerRenderer = isCana ? await createCanaHeaderRenderer(doc, title, logoBase64, filters, db) : null;

        if (rowsData.length === 0) {
            if (headerRenderer) {
                await headerRenderer();
            } else {
                await generatePdfHeader(doc, title, logoBase64);
            }
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);
        const hasTalhao = isCana && rowsData.some(row => normalizeText(row.talhao));
        const headers = isCana ? [
            'Faz.',
            ...(hasTalhao ? ['Talh.'] : []),
            'Var. Plant.',
            'Data',
            'Área Tot. (ha)',
            'Produto / Insumo',
            'Dose',
            'Total Calc.',
            'Unid.'
        ] : [
            'Fazenda plantada',
            'Data',
            'Variedade plantada',
            'Área total',
            'Produto / Insumo',
            'Dose',
            'Total calculado',
            'Unidade'
        ];
        const rows = rowsData.map(r => (isCana ? [
            r.fazendaPlantada,
            ...(hasTalhao ? [r.talhao] : []),
            r.variedadePlantada,
            r.data,
            r.areaTotal,
            r.produto,
            r.dose,
            r.totalCalculado,
            r.unidade
        ] : [
            r.fazendaPlantada,
            r.data,
            r.variedadePlantada,
            r.areaTotal,
            r.produto,
            r.dose,
            r.totalCalculado,
            r.unidade
        ]));
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
        const columnAlignments = [];
        if (isCana) {
            let index = 0;
            columnAlignments[index++] = 'left';
            if (hasTalhao) {
                columnAlignments[index++] = 'center';
            }
            columnAlignments[index++] = 'center';
            columnAlignments[index++] = 'center';
            columnAlignments[index++] = 'right';
            columnAlignments[index++] = 'left';
            columnAlignments[index++] = 'right';
            columnAlignments[index++] = 'right';
            columnAlignments[index++] = 'left';
        } else {
            columnAlignments[2] = 'center';
        }

        if (headerRenderer) {
            currentY = await drawCanaTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments, headerRenderer);
        } else {
            currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);
        }

        const totalArea = sumRows(rowsData, 'areaTotalValue');
        const totalDose = sumRows(rowsData, 'doseValue');
        const totalCalculado = sumRows(rowsData, 'totalCalculadoValue');
        const totalRow = isCana
            ? hasTalhao
                ? ['TOTAL GERAL', '', '', '', formatNumber(totalArea), '', formatNumber(totalDose), formatNumber(totalCalculado), '']
                : ['TOTAL GERAL', '', '', formatNumber(totalArea), '', formatNumber(totalDose), formatNumber(totalCalculado), '']
            : ['', '', 'TOTAL GERAL', formatNumber(totalArea), '', formatNumber(totalDose), formatNumber(totalCalculado), ''];
        if (headerRenderer) {
            await drawCanaSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64, headerRenderer);
        } else {
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
        }
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
        const isCana = isCanaCulture(filters);
        const headerRenderer = isCana ? await createCanaHeaderRenderer(doc, title, logoBase64, filters, db) : null;

        const rowsData = isCana ? buildResumoRows(data, { isCana }) : buildOperacionalRows(data, { isCana });

        if (rowsData.length === 0) {
            if (headerRenderer) {
                await headerRenderer();
            } else {
                await generatePdfHeader(doc, title, logoBase64);
            }
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = headerRenderer ? await headerRenderer() : await generatePdfHeader(doc, title, logoBase64);

        if (isCana) {
            const headers = getCanaResumoHeaders();
            const columnAlignments = getCanaResumoColumnAlignments();
            const sections = groupResumoRowsByPlantioFarm(rowsData).map(section => {
                const subtotalMuda = sumRows(section.rows, 'areaMudaValue');
                const subtotalPlantio = sumRows(section.rows, 'areaPlantioValue');
                return {
                    farmName: section.farmName,
                    rows: section.rows,
                    subtotalRow: buildCanaResumoTotalRow('SUBTOTAL', subtotalMuda, subtotalPlantio)
                };
            });
            const widthRows = sections.flatMap(section => {
                const mapped = section.rows.map(getCanaResumoRow);
                if (section.subtotalRow) mapped.push(section.subtotalRow);
                return mapped;
            });
            const columnWidths = calculateColumnWidths(doc, headers, widthRows, doc.page.width, doc.page.margins);

            currentY = await drawResumoComparativoGroupedTable(doc, headers, sections, title, logoBase64, currentY, {
                columnAlignments,
                headerRenderer,
                columnWidths,
                showGroupTitle: false
            });

            const totalMuda = sumRows(rowsData, 'areaMudaValue');
            const totalPlantio = sumRows(rowsData, 'areaPlantioValue');
            const totalRow = buildCanaResumoTotalRow('TOTAL GERAL', totalMuda, totalPlantio);
            await drawCanaSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64, headerRenderer);
        } else {
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
            const rows = rowsData.map(r => ([
                r.fazendaPlantada,
                r.data,
                r.variedadePlantada,
                r.areaTotal,
                r.tipoPlantio,
                r.recurso,
                r.talhao,
                r.os
            ]));
            const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);
            const columnAlignments = [];
            columnAlignments[2] = 'center';
            columnAlignments[6] = 'center';
            currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths, columnAlignments);

            const totalArea = sumRows(rowsData, 'areaTotalValue');
            const totalRow = ['', '', 'TOTAL GERAL', formatNumber(totalArea), '', '', '', ''];
            await drawSummaryRow(doc, totalRow, currentY, columnWidths, title, logoBase64);
        }
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
                subtotalRow[fazendaColumnIndex] = 'SUBTOTAL';
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
