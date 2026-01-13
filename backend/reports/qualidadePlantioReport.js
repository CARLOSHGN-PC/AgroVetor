const xlsx = require('xlsx');
const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, formatDate } = require('../utils/pdfGenerator');

const normalizeQualidadeDate = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value && typeof value.toDate === 'function') {
        return value.toDate().toISOString().split('T')[0];
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

const getQualidadePlantioData = async (db, filters) => {
    if (!filters.companyId) return [];
    const snapshot = await db.collection('qualidadePlantio')
        .where('companyId', '==', filters.companyId)
        .get();
    const data = [];
    snapshot.forEach(docSnap => data.push({ id: docSnap.id, ...docSnap.data() }));
    return data;
};

const flattenQualidadeEntries = (entries) => {
    const flattened = [];
    entries.forEach(entry => {
        if (entry.subamostras && Array.isArray(entry.subamostras)) {
            const { subamostras, ...base } = entry;
            subamostras.forEach(sub => {
                const indicadores = sub.indicadores || [];
                indicadores.forEach(indicador => {
                    flattened.push({
                        ...base,
                        subamostraNumero: sub.numero || null,
                        indicadorCodigo: indicador.codigo,
                        indicadorNome: indicador.nome,
                        valor: indicador.valor,
                        amostragem: indicador.amostragem,
                        qtdGemasTotal: indicador.qtdGemasTotal,
                        valorCalculado: indicador.valorCalculado,
                        consumo: indicador.consumo || null,
                        broca: indicador.broca || null,
                    });
                });
            });
        } else if (entry.indicadorCodigo) {
            flattened.push(entry);
        }
    });
    return flattened;
};

const filterQualidadeEntries = (entries, filters) => {
    return entries.filter(entry => {
        const entryDate = normalizeQualidadeDate(entry.data);
        if (filters.inicio && (!entryDate || entryDate < filters.inicio)) return false;
        if (filters.fim && (!entryDate || entryDate > filters.fim)) return false;
        if (filters.fazendaId && entry.fazendaId !== filters.fazendaId) return false;
        if (filters.talhaoId && entry.talhaoId !== filters.talhaoId) return false;
        if (filters.tipoPlantio && entry.tipoPlantio !== filters.tipoPlantio) return false;
        if (filters.indicador && entry.indicadorCodigo !== filters.indicador) return false;
        if (filters.tipoInspecao && entry.tipoInspecao !== filters.tipoInspecao) return false;
        if (filters.tipoPrestador && entry.tipoPrestadorPlantando !== filters.tipoPrestador) return false;
        if (filters.prestadorTirou && entry.consumo?.prestadorTirouMudaId !== filters.prestadorTirou) return false;
        if (filters.fazendaOrigem && entry.consumo?.fazendaOrigemMudaId !== filters.fazendaOrigem) return false;
        if (filters.frentePlantioId && entry.frentePlantioId !== filters.frentePlantioId) return false;
        return true;
    });
};

const getQualidadeMetric = (entry) => {
    if (!entry) return null;
    const indicadorCodigo = entry.indicadorCodigo;
    if (indicadorCodigo === '1.3.4' || indicadorCodigo === '2.3.4') {
        return entry.valorCalculado ?? entry.qtdGemasTotal;
    }
    if (indicadorCodigo === '1.3.1' || indicadorCodigo === '2.3.6') {
        return entry.consumo?.consumoMudaT ?? entry.valor;
    }
    if (indicadorCodigo === 'BROCA') {
        return entry.broca?.percentualBroca ?? entry.valor;
    }
    return entry.valor;
};

const buildResumoRows = (entries) => {
    const grouped = new Map();
    entries.forEach(entry => {
        const key = [
            entry.fazendaNome || '',
            entry.talhaoNome || '',
            entry.variedadeNome || '',
            entry.indicadorNome || '',
            entry.indicadorCodigo || ''
        ].join('|');
        if (!grouped.has(key)) {
            grouped.set(key, {
                fazenda: entry.fazendaNome || '-',
                talhao: entry.talhaoNome || '-',
                variedade: entry.variedadeNome || '-',
                indicador: entry.indicadorNome || '-',
                indicadorCodigo: entry.indicadorCodigo || '',
                count: 0,
                values: []
            });
        }
        const group = grouped.get(key);
        group.count += 1;
        const metric = getQualidadeMetric(entry);
        if (metric !== null && metric !== undefined) {
            group.values.push(Number(metric));
        }
    });

    return Array.from(grouped.values()).map(group => {
        const values = group.values.filter(v => !Number.isNaN(v));
        const avg = values.length ? (values.reduce((sum, v) => sum + v, 0) / values.length) : null;
        const min = values.length ? Math.min(...values) : null;
        const max = values.length ? Math.max(...values) : null;
        return [
            group.fazenda,
            group.talhao,
            group.variedade,
            group.indicador,
            group.count,
            avg !== null ? formatNumber(avg) : '-',
            min !== null ? formatNumber(min) : '-',
            max !== null ? formatNumber(max) : '-',
        ];
    });
};

const buildDetalhadoRows = (entries) => {
    return entries
        .sort((a, b) => normalizeQualidadeDate(a.data).localeCompare(normalizeQualidadeDate(b.data)))
        .map(entry => {
            const consumo = entry.consumo || {};
            const broca = entry.broca || {};
            const qtdGemas = entry.valorCalculado ?? entry.qtdGemasTotal ?? broca.qtdGemasTotal;
            return [
                formatDate(normalizeQualidadeDate(entry.data)),
                entry.fazendaNome || '-',
                entry.talhaoNome || '-',
                entry.variedadeNome || '-',
                entry.tipoPlantio || '-',
                entry.tipoInspecao || '-',
                entry.tipoPrestadorPlantando || '-',
                entry.frentePlantioNome || '-',
                entry.indicadorNome || '-',
                entry.valor != null ? formatNumber(entry.valor) : '-',
                entry.amostragem ?? '-',
                qtdGemas != null ? formatNumber(qtdGemas) : '-',
                consumo.consumoMudaT != null ? formatNumber(consumo.consumoMudaT) : '-',
                broca.percentualBroca != null ? formatNumber(broca.percentualBroca) : '-',
                consumo.prestadorTirouMudaNome || '-',
                consumo.fazendaOrigemMudaNome || '-',
            ];
        });
};

const generateQualidadePlantioPdf = async (req, res, db) => {
    const filters = { ...req.query, ...req.body };
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_qualidade_plantio.pdf');
    doc.pipe(res);

    try {
        const data = await getQualidadePlantioData(db, filters);
        const flattened = flattenQualidadeEntries(data);
        const filtered = filterQualidadeEntries(flattened, filters);
        const title = 'Relatório de Qualidade de Plantio';
        const logoBase64 = await getLogoBase64(db, filters.companyId);
        let currentY = await generatePdfHeader(doc, title, logoBase64);

        if (!filtered.length) {
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        const isDetalhado = filters.modelo === 'detalhado';
        const headers = isDetalhado
            ? ['Data', 'Fazenda', 'Talhão', 'Variedade', 'Tipo Plantio', 'Tipo Inspeção', 'Prestador', 'Frente', 'Indicador', 'Valor', 'Amostragem', 'Qtd. Gemas', 'Consumo (t)', '% Broca', 'Prestador (Muda)', 'Fazenda Origem']
            : ['Fazenda', 'Talhão', 'Variedade', 'Indicador', 'Qtde.', 'Média', 'Mínimo', 'Máximo'];
        const rows = isDetalhado ? buildDetalhadoRows(filtered) : buildResumoRows(filtered);

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY);
        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error('Erro ao gerar PDF de Qualidade de Plantio:', error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generateQualidadePlantioExcel = async (req, res, db) => {
    const filters = { ...req.query, ...req.body };
    try {
        const data = await getQualidadePlantioData(db, filters);
        const flattened = flattenQualidadeEntries(data);
        const filtered = filterQualidadeEntries(flattened, filters);
        const isDetalhado = filters.modelo === 'detalhado';
        const headers = isDetalhado
            ? ['Data', 'Fazenda', 'Talhão', 'Variedade', 'Tipo Plantio', 'Tipo Inspeção', 'Prestador', 'Frente', 'Indicador', 'Valor', 'Amostragem', 'Qtd. Gemas', 'Consumo (t)', '% Broca', 'Prestador (Muda)', 'Fazenda Origem']
            : ['Fazenda', 'Talhão', 'Variedade', 'Indicador', 'Qtde.', 'Média', 'Mínimo', 'Máximo'];
        const rows = isDetalhado ? buildDetalhadoRows(filtered) : buildResumoRows(filtered);
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
        xlsx.utils.book_append_sheet(workbook, worksheet, isDetalhado ? 'Detalhado' : 'Resumo');
        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=relatorio_qualidade_plantio.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Erro ao gerar Excel de Qualidade de Plantio:', error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
    }
};

module.exports = {
    generateQualidadePlantioPdf,
    generateQualidadePlantioExcel,
};
