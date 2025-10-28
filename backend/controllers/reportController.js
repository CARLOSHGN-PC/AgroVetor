const { getFilteredData, sortByDateAndFazenda } = require('../services/dataService');
const { generatePdfHeader, generatePdfFooter, drawRow, checkPageBreak } = require('../services/pdfService');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const { db } = require('../services/firebase');


const generateBrocamentoPDF = async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        filters.companyId = req.user.companyId; // Enforce companyId from authenticated user

        const data = await getFilteredData('registros', filters);
        const title = 'Relatório de Inspeção de Broca';

        if (data.length === 0) {
            await generatePdfHeader(doc, title, filters.companyId);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', filters.companyId).get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
            fazendasData[docSnap.data().code] = docSnap.data();
        });

        const enrichedData = data.map(reg => {
            const farm = fazendasData[reg.codigo];
            const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === reg.talhao.toUpperCase());
            return { ...reg, variedade: talhao?.variedade || 'N/A' };
        });

        const isModelB = filters.tipoRelatorio === 'B';

        let currentY = await generatePdfHeader(doc, title, filters.companyId);

        const headersA = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
        const columnWidthsA = [160, 60, 60, 100, 80, 60, 45, 45, 45, 55, 62];
        const headersB = ['Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
        const columnWidthsB = [75, 80, 160, 90, 75, 50, 50, 50, 70, 77];

        const headersAConfig = headersA.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
        const headersBConfig = headersB.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));


        if (!isModelB) { // Modelo A
            currentY = drawRow(doc, headersA, currentY, true, false, columnWidthsA, 5, 18, headersAConfig);
            for(const r of enrichedData) {
                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsA, 5, 18, headersAConfig);
            }
        } else { // Modelo B
            const groupedData = enrichedData.reduce((acc, reg) => {
                const key = `${reg.codigo} - ${reg.fazenda}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(reg);
                return acc;
            }, {});

            for (const fazendaKey of Object.keys(groupedData).sort()) {
                currentY = await checkPageBreak(doc, currentY, title, 40);
                doc.y = currentY;
                doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
                currentY = doc.y + 5;

                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, headersB, currentY, true, false, columnWidthsB, 5, 18, headersBConfig);

                const farmData = groupedData[fazendaKey];
                for(const r of farmData) {
                    currentY = await checkPageBreak(doc, currentY, title);
                    currentY = drawRow(doc, [r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsB, 5, 18, headersBConfig);
                }

                const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
                const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
                const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
                const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
                const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
                const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

                const subtotalRow = ['', '', '', 'Sub Total', subTotalEntrenos, subTotalBase, subTotalMeio, subTotalTopo, subTotalBrocado, subTotalPercent];
                currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidthsB, 5, 18, headersBConfig);
                currentY += 10;
            }
        }

        const grandTotalEntrenos = enrichedData.reduce((sum, r) => sum + r.entrenos, 0);
        const grandTotalBrocado = enrichedData.reduce((sum, r) => sum + r.brocado, 0);
        const grandTotalBase = enrichedData.reduce((sum, r) => sum + r.base, 0);
        const grandTotalMeio = enrichedData.reduce((sum, r) => sum + r.meio, 0);
        const grandTotalTopo = enrichedData.reduce((sum, r) => sum + r.topo, 0);
        const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

        currentY = await checkPageBreak(doc, currentY, title, 40);
        doc.y = currentY;

        if (!isModelB) {
            const totalRowData = ['', '', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
            drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, 5, 18, headersAConfig);
        } else {
            const totalRowDataB = ['', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
            drawRow(doc, totalRowDataB, currentY, false, true, columnWidthsB, 5, 18, headersBConfig);
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Brocamento:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generateBrocamentoCSV = async (req, res) => {
    try {
        const filters = req.query;
        filters.companyId = req.user.companyId;

        const data = await getFilteredData('registros', filters);
        if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

        const filePath = path.join(os.tmpdir(), `brocamento_${Date.now()}.csv`);
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                {id: 'fazenda', title: 'Fazenda'}, {id: 'data', title: 'Data'}, {id: 'talhao', title: 'Talhão'},
                {id: 'corte', title: 'Corte'}, {id: 'entrenos', title: 'Entrenós'}, {id: 'brocado', title: 'Brocado'},
                {id: 'brocamento', title: 'Brocamento (%)'}
            ]
        });
        const records = data.map(r => ({ ...r, fazenda: `${r.codigo} - ${r.fazenda}` }));
        await csvWriter.writeRecords(records);
        res.download(filePath);
    } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
};


const generatePerdaPDF = async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_perda.pdf`);
    doc.pipe(res);

    try {
        const filters = req.query;
        filters.companyId = req.user.companyId;
        const data = await getFilteredData('perdas', filters);
        const isDetailed = filters.tipoRelatorio === 'B';
        const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';

        if (data.length === 0) {
            await generatePdfHeader(doc, title, filters.companyId);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, filters.companyId);

        const headersA = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
        const columnWidthsA = [80, 160, 80, 100, 60, 120, 80];
        const headersB = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaco', 'Pedaco', 'Total'];
        const columnWidthsB = [60, 120, 60, 70, 40, 90, 50, 50, 40, 40, 50, 50, 50];

        const headersAConfig = headersA.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
        const headersBConfig = headersB.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));

        const rowHeight = 18;
        const textPadding = 5;

        if (!isDetailed) { // Modelo A - Resumido
            currentY = drawRow(doc, headersA, currentY, true, false, columnWidthsA, textPadding, rowHeight, headersAConfig);
            for(const p of data) {
                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.total)], currentY, false, false, columnWidthsA, textPadding, rowHeight, headersAConfig);
            }
        } else { // Modelo B - Detalhado
            const groupedData = data.reduce((acc, p) => {
                const key = `${p.codigo} - ${p.fazenda}`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(p);
                return acc;
            }, {});

            for (const fazendaKey of Object.keys(groupedData).sort()) {
                currentY = await checkPageBreak(doc, currentY, title, 40);
                doc.y = currentY;
                doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
                currentY = doc.y + 5;

                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, headersB, currentY, true, false, columnWidthsB, textPadding, rowHeight, headersBConfig);

                const farmData = groupedData[fazendaKey];
                for(const p of farmData) {
                    currentY = await checkPageBreak(doc, currentY, title);
                    currentY = drawRow(doc, [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.canaInteira), formatNumber(p.tolete), formatNumber(p.toco), formatNumber(p.ponta), formatNumber(p.estilhaco), formatNumber(p.pedaco), formatNumber(p.total)], currentY, false, false, columnWidthsB, textPadding, rowHeight, headersBConfig);
                }

                const subTotalCanaInteira = farmData.reduce((sum, p) => sum + p.canaInteira, 0);
                const subTotalTolete = farmData.reduce((sum, p) => sum + p.tolete, 0);
                const subTotalToco = farmData.reduce((sum, p) => sum + p.toco, 0);
                const subTotalPonta = farmData.reduce((sum, p) => sum + p.ponta, 0);
                const subTotalEstilhaco = farmData.reduce((sum, p) => sum + p.estilhaco, 0);
                const subTotalPedaco = farmData.reduce((sum, p) => sum + p.pedaco, 0);
                const subTotal = farmData.reduce((sum, p) => sum + p.total, 0);

                const subtotalRow = ['', '', '', '', '', 'Sub Total', formatNumber(subTotalCanaInteira), formatNumber(subTotalTolete), formatNumber(subTotalToco), formatNumber(subTotalPonta), formatNumber(subTotalEstilhaco), formatNumber(subTotalPedaco), formatNumber(subTotal)];
                currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidthsB, textPadding, rowHeight, headersBConfig);
                currentY += 10;
            }
        }

        const grandTotalCanaInteira = data.reduce((sum, p) => sum + p.canaInteira, 0);
        const grandTotalTolete = data.reduce((sum, p) => sum + p.tolete, 0);
        const grandTotalToco = data.reduce((sum, p) => sum + p.toco, 0);
        const grandTotalPonta = data.reduce((sum, p) => sum + p.ponta, 0);
        const grandTotalEstilhaco = data.reduce((sum, p) => sum + p.estilhaco, 0);
        const grandTotalPedaco = data.reduce((sum, p) => sum + p.pedaco, 0);
        const grandTotal = data.reduce((sum, p) => sum + p.total, 0);

        currentY = await checkPageBreak(doc, currentY, title, 40);
        doc.y = currentY;

        if (!isDetailed) {
            const totalRowData = ['', '', '', '', '', 'Total Geral', formatNumber(grandTotal)];
            drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, textPadding, rowHeight, headersAConfig);
        } else {
            const totalRowData = ['', '', '', '', '', 'Total Geral', formatNumber(grandTotalCanaInteira), formatNumber(grandTotalTolete), formatNumber(grandTotalToco), formatNumber(grandTotalPonta), formatNumber(grandTotalEstilhaco), formatNumber(grandTotalPedaco), formatNumber(grandTotal)];
            drawRow(doc, totalRowData, currentY, false, true, columnWidthsB, textPadding, rowHeight, headersBConfig);
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Perda:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generatePerdaCSV = async (req, res) => {
    try {
        const filters = req.query;
        filters.companyId = req.user.companyId;
        const data = await getFilteredData('perdas', filters);
        if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

        const isDetailed = filters.tipoRelatorio === 'B';
        const filePath = path.join(os.tmpdir(), `perda_${Date.now()}.csv`);
        let header, records;

        if (isDetailed) {
            header = [
                {id: 'data', title: 'Data'}, {id: 'fazenda', title: 'Fazenda'}, {id: 'talhao', title: 'Talhão'}, {id: 'frenteServico', title: 'Frente'},
                {id: 'turno', title: 'Turno'}, {id: 'operador', title: 'Operador'}, {id: 'canaInteira', title: 'C.Inteira'}, {id: 'tolete', title: 'Tolete'},
                {id: 'toco', title: 'Toco'}, {id: 'ponta', title: 'Ponta'}, {id: 'estilhaco', title: 'Estilhaço'}, {id: 'pedaco', title: 'Pedaço'}, {id: 'total', title: 'Total'}
            ];
            records = data.map(p => ({ ...p, fazenda: `${p.codigo} - ${p.fazenda}` }));
        } else {
            header = [
                {id: 'data', title: 'Data'}, {id: 'fazenda', title: 'Fazenda'}, {id: 'talhao', title: 'Talhão'}, {id: 'frenteServico', title: 'Frente'},
                {id: 'turno', title: 'Turno'}, {id: 'operador', title: 'Operador'}, {id: 'total', title: 'Total'}
            ];
            records = data.map(p => ({ data: p.data, fazenda: `${p.codigo} - ${p.fazenda}`, talhao: p.talhao, frenteServico: p.frenteServico, turno: p.turno, operador: p.operador, total: p.total }));
        }

        const csvWriter = createObjectCsvWriter({ path: filePath, header });
        await csvWriter.writeRecords(records);
        res.download(filePath);
    } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
};


const generateCigarrinhaPDF = async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_cigarrinha.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        filters.companyId = req.user.companyId;
        const data = await getFilteredData('cigarrinha', filters);
        const title = 'Relatório de Monitoramento de Cigarrinha';

        if (data.length === 0) {
            await generatePdfHeader(doc, title, filters.companyId);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', filters.companyId).get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
            fazendasData[docSnap.data().code] = docSnap.data();
        });

        const enrichedData = data.map(reg => {
            const farm = fazendasData[reg.codigo];
            const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === reg.talhao.toUpperCase());
            return { ...reg, variedade: talhao?.variedade || 'N/A' };
        });

        let currentY = await generatePdfHeader(doc, title, filters.companyId);

        const headers = ['Data', 'Fazenda', 'Talhão', 'Variedade', 'F1', 'F2', 'F3', 'F4', 'F5', 'Adulto', 'Resultado'];
        const columnWidths = [80, 180, 80, 100, 40, 40, 40, 40, 40, 50, 72];
        const headersConfig = headers.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));

        currentY = drawRow(doc, headers, currentY, true, false, columnWidths, 5, 18, headersConfig);

        for(const r of enrichedData) {
            currentY = await checkPageBreak(doc, currentY, title);
            const date = new Date(r.data + 'T03:00:00Z');
            const formattedDate = date.toLocaleDateString('pt-BR');
            const row = [
                formattedDate,
                `${r.codigo} - ${r.fazenda}`,
                r.talhao,
                r.variedade,
                r.fase1,
                r.fase2,
                r.fase3,
                r.fase4,
                r.fase5,
                r.adulto ? 'Sim' : 'Não',
                r.resultado
            ];
            currentY = drawRow(doc, row, currentY, false, false, columnWidths, 5, 18, headersConfig);
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Cigarrinha:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generateCigarrinhaCSV = async (req, res) => {
    try {
        const filters = req.query;
        filters.companyId = req.user.companyId;
        const data = await getFilteredData('cigarrinha', filters);
        if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

        const filePath = path.join(os.tmpdir(), `cigarrinha_${Date.now()}.csv`);
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                {id: 'data', title: 'Data'}, {id: 'fazenda', title: 'Fazenda'}, {id: 'talhao', title: 'Talhão'},
                {id: 'variedade', title: 'Variedade'}, {id: 'fase1', title: 'Fase 1'}, {id: 'fase2', title: 'Fase 2'},
                {id: 'fase3', title: 'Fase 3'}, {id: 'fase4', title: 'Fase 4'}, {id: 'fase5', title: 'Fase 5'},
                {id: 'adulto', title: 'Adulto Presente'}, {id: 'resultado', title: 'Resultado'}
            ]
        });

        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', req.query.companyId).get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
            fazendasData[docSnap.data().code] = docSnap.data();
        });

        const records = data.map(r => {
            const farm = fazendasData[r.codigo];
            const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === r.talhao.toUpperCase());
            const date = new Date(r.data + 'T03:00:00Z');
            const formattedDate = date.toLocaleDateString('pt-BR');
            return {
                ...r,
                data: formattedDate,
                fazenda: `${r.codigo} - ${r.fazenda}`,
                variedade: talhao?.variedade || 'N/A',
                adulto: r.adulto ? 'Sim' : 'Não',
                resultado: r.resultado
            };
        });

        await csvWriter.writeRecords(records);
        res.download(filePath);
    } catch (error) {
        console.error("Erro ao gerar CSV de Cigarrinha:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};


const generateCigarrinhaAmostragemPDF = async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    const { tipoRelatorio = 'detalhado' } = req.query;
    const filename = `relatorio_cigarrinha_amostragem_${tipoRelatorio}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    doc.pipe(res);

    try {
        const filters = req.query;
        filters.companyId = req.user.companyId;
        const data = await getFilteredData('cigarrinhaAmostragem', filters);
        const title = `Relatório de Cigarrinha (Amostragem) - ${tipoRelatorio.charAt(0).toUpperCase() + tipoRelatorio.slice(1)}`;

        if (data.length === 0) {
            await generatePdfHeader(doc, title, filters.companyId);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, filters.companyId);

        if (tipoRelatorio === 'resumido') {
            const groupedData = data.reduce((acc, r) => {
                const date = new Date(r.data + 'T03:00:00Z');
                const formattedDate = date.toLocaleDateString('pt-BR');
                const key = `${formattedDate}|${r.codigo}|${r.fazenda}|${r.talhao}`;

                if (!acc[key]) {
                    acc[key] = {
                        data: r.data, // Preserva a data original para ordenação
                        formattedDate: formattedDate, // Usa a data formatada para exibição
                        codigo: r.codigo,
                        fazenda: r.fazenda,
                        talhao: r.talhao,
                        variedade: r.variedade,
                        fase1: 0, fase2: 0, fase3: 0, fase4: 0, fase5: 0,
                    };
                }
                r.amostras.forEach(amostra => {
                    acc[key].fase1 += amostra.fase1 || 0;
                    acc[key].fase2 += amostra.fase2 || 0;
                    acc[key].fase3 += amostra.fase3 || 0;
                    acc[key].fase4 += amostra.fase4 || 0;
                    acc[key].fase5 += amostra.fase5 || 0;
                });
                return acc;
            }, {});

            const headers = ['Data', 'Fazenda', 'Talhão', 'Variedade', 'Fase 1 (Soma)', 'Fase 2 (Soma)', 'Fase 3 (Soma)', 'Fase 4 (Soma)', 'Fase 5 (Soma)'];
            const columnWidths = [80, 150, 80, 100, 60, 60, 60, 60, 72];
            currentY = drawRow(doc, headers, currentY, true, false, columnWidths);

            const summarizedData = Object.values(groupedData);
            summarizedData.sort(sortByDateAndFazenda);

            for (const group of summarizedData) {
                const row = [
                    group.formattedDate,
                    `${group.codigo} - ${group.fazenda}`,
                    group.talhao,
                    group.variedade,
                    group.fase1, group.fase2, group.fase3, group.fase4, group.fase5
                ];
                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, row, currentY, false, false, columnWidths);
            }

        } else if (tipoRelatorio === 'final') {
            const headers = ['Fazenda', 'Data', 'Variedade', 'Adulto', 'Fase1', 'Fase2', 'Fase3', 'Fase4', 'Fase5', 'Resultado Final'];
            const columnWidths = [190, 70, 120, 50, 45, 45, 45, 45, 45, 82];
            currentY = drawRow(doc, headers, currentY, true, false, columnWidths);

            for (const r of data) {
                const date = new Date(r.data + 'T03:00:00Z');
                const formattedDate = date.toLocaleDateString('pt-BR');

                const totalFases = r.amostras.reduce((acc, amostra) => {
                    acc.f1 += amostra.fase1 || 0;
                    acc.f2 += amostra.fase2 || 0;
                    acc.f3 += amostra.fase3 || 0;
                    acc.f4 += amostra.fase4 || 0;
                    acc.f5 += amostra.fase5 || 0;
                    return acc;
                }, { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0 });

                const row = [
                    `${r.codigo} - ${r.fazenda}`,
                    formattedDate,
                    r.variedade,
                    r.adulto ? 'Sim' : 'Não',
                    totalFases.f1,
                    totalFases.f2,
                    totalFases.f3,
                    totalFases.f4,
                    totalFases.f5,
                    (r.resultado || 0).toFixed(2).replace('.', ',')
                ];
                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, row, currentY, false, false, columnWidths);
            }
        } else { // Detalhado
            const headers = ['Fazenda', 'Talhão', 'Data', 'Variedade', 'Adulto', 'Nº Amostra', 'F1', 'F2', 'F3', 'F4', 'F5', 'Resultado Amostra'];
            const columnWidths = [140, 70, 65, 100, 50, 60, 40, 40, 40, 40, 40, 97];
            currentY = drawRow(doc, headers, currentY, true, false, columnWidths);
            const divisor = parseInt(filters.divisor, 10) || parseInt(data[0]?.divisor || '5', 10);

            for(const r of data) {
                if (r.amostras && r.amostras.length > 0) {
                    for (let i = 0; i < r.amostras.length; i++) {
                        const amostra = r.amostras[i];
                        const date = new Date(r.data + 'T03:00:00Z');
                        const formattedDate = date.toLocaleDateString('pt-BR');

                        const somaFases = (amostra.fase1 || 0) + (amostra.fase2 || 0) + (amostra.fase3 || 0) + (amostra.fase4 || 0) + (amostra.fase5 || 0);
                        const resultadoAmostra = (somaFases / divisor).toFixed(2).replace('.', ',');

                        const row = [
                            `${r.codigo} - ${r.fazenda}`,
                            r.talhao,
                            formattedDate,
                            r.variedade,
                            r.adulto ? 'Sim' : 'Não',
                            i + 1,
                            amostra.fase1 || 0,
                            amostra.fase2 || 0,
                            amostra.fase3 || 0,
                            amostra.fase4 || 0,
                            amostra.fase5 || 0,
                            resultadoAmostra
                        ];
                        currentY = await checkPageBreak(doc, currentY, title);
                        currentY = drawRow(doc, row, currentY, false, false, columnWidths);
                    }
                }
            }
        }

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Cigarrinha (Amostragem):", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generateCigarrinhaAmostragemCSV = async (req, res) => {
    try {
        const { tipoRelatorio = 'detalhado' } = req.query;
        const filters = req.query;
        filters.companyId = req.user.companyId;
        const data = await getFilteredData('cigarrinhaAmostragem', filters);
        if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

        const filename = `relatorio_cigarrinha_amostragem_${tipoRelatorio}_${Date.now()}.csv`;
        const filePath = path.join(os.tmpdir(), filename);

        let header, records;

        if (tipoRelatorio === 'resumido') {
            header = [
                { id: 'data', title: 'Data' }, { id: 'fazenda', title: 'Fazenda' }, { id: 'talhao', title: 'Talhão' }, { id: 'variedade', title: 'Variedade' },
                { id: 'fase1', title: 'Fase 1 (Soma)' }, { id: 'fase2', title: 'Fase 2 (Soma)' }, { id: 'fase3', title: 'Fase 3 (Soma)' },
                { id: 'fase4', title: 'Fase 4 (Soma)' }, { id: 'fase5', title: 'Fase 5 (Soma)' }
            ];

            const groupedData = data.reduce((acc, r) => {
                const date = new Date(r.data + 'T03:00:00Z');
                const formattedDate = date.toLocaleDateString('pt-BR');
                const key = `${formattedDate}|${r.codigo}|${r.fazenda}|${r.talhao}`;

                if (!acc[key]) {
                    acc[key] = {
                        data: r.data, // Preserva a data original para ordenação
                        formattedDate: formattedDate,
                        codigo: r.codigo,
                        fazenda: `${r.codigo} - ${r.fazenda}`,
                        talhao: r.talhao,
                        variedade: r.variedade,
                        fase1: 0, fase2: 0, fase3: 0, fase4: 0, fase5: 0,
                    };
                }
                r.amostras.forEach(amostra => {
                    acc[key].fase1 += amostra.fase1 || 0;
                    acc[key].fase2 += amostra.fase2 || 0;
                    acc[key].fase3 += amostra.fase3 || 0;
                    acc[key].fase4 += amostra.fase4 || 0;
                    acc[key].fase5 += amostra.fase5 || 0;
                });
                return acc;
            }, {});

            let summarizedData = Object.values(groupedData);
            summarizedData.sort(sortByDateAndFazenda);

            records = summarizedData.map(rec => ({
                data: rec.formattedDate,
                fazenda: rec.fazenda,
                talhao: rec.talhao,
                variedade: rec.variedade,
                fase1: rec.fase1,
                fase2: rec.fase2,
                fase3: rec.fase3,
                fase4: rec.fase4,
                fase5: rec.fase5
            }));

        } else if (tipoRelatorio === 'final') {
            header = [
                { id: 'fazenda', title: 'Fazenda' }, { id: 'data', title: 'Data' }, { id: 'variedade', title: 'Variedade' },
                { id: 'fase1', title: 'Fase1' }, { id: 'fase2', title: 'Fase2' }, { id: 'fase3', title: 'Fase3' },
                { id: 'fase4', title: 'Fase4' }, { id: 'fase5', title: 'Fase5' }, { id: 'resultadoFinal', title: 'Resultado Final' }
            ];

            records = data.map(r => {
                const date = new Date(r.data + 'T03:00:00Z');
                const formattedDate = date.toLocaleDateString('pt-BR');

                const totalFases = r.amostras.reduce((acc, amostra) => {
                    acc.f1 += amostra.fase1 || 0;
                    acc.f2 += amostra.fase2 || 0;
                    acc.f3 += amostra.fase3 || 0;
                    acc.f4 += amostra.fase4 || 0;
                    acc.f5 += amostra.fase5 || 0;
                    return acc;
                }, { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0 });

                return {
                    fazenda: `${r.codigo} - ${r.fazenda}`,
                    data: formattedDate,
                    variedade: r.variedade,
                    fase1: totalFases.f1,
                    fase2: totalFases.f2,
                    fase3: totalFases.f3,
                    fase4: totalFases.f4,
                    fase5: totalFases.f5,
                    resultadoFinal: (r.resultado || 0).toFixed(2).replace('.', ',')
                };
            });

        } else { // Detalhado
            header = [
                { id: 'fazenda', title: 'Fazenda' }, { id: 'talhao', title: 'Talhão' }, { id: 'data', title: 'Data' }, { id: 'variedade', title: 'Variedade' },
                { id: 'adulto', title: 'Adulto Presente'}, { id: 'numeroAmostra', title: 'Nº Amostra' }, { id: 'fase1', title: 'Fase 1' }, { id: 'fase2', title: 'Fase 2' },
                { id: 'fase3', title: 'Fase 3' }, { id: 'fase4', title: 'Fase 4' }, { id: 'fase5', title: 'Fase 5' },
                { id: 'resultadoAmostra', title: 'Resultado Amostra'}
            ];
            records = [];
            const divisor = parseInt(req.query.divisor, 10) || parseInt(data[0]?.divisor || '5', 10);

            data.forEach(lancamento => {
                if (lancamento.amostras && lancamento.amostras.length > 0) {
                    lancamento.amostras.forEach((amostra, index) => {
                        const date = new Date(lancamento.data + 'T03:00:00Z');
                        const formattedDate = date.toLocaleDateString('pt-BR');
                        const somaFases = (amostra.fase1 || 0) + (amostra.fase2 || 0) + (amostra.fase3 || 0) + (amostra.fase4 || 0) + (amostra.fase5 || 0);
                        const resultadoAmostra = (somaFases / divisor).toFixed(2).replace('.', ',');

                        records.push({
                            fazenda: `${lancamento.codigo} - ${lancamento.fazenda}`, talhao: lancamento.talhao, data: formattedDate,
                            variedade: lancamento.variedade, adulto: lancamento.adulto ? 'Sim' : 'Não', numeroAmostra: index + 1, fase1: amostra.fase1 || 0,
                            fase2: amostra.fase2 || 0, fase3: amostra.fase3 || 0, fase4: amostra.fase4 || 0, fase5: amostra.fase5 || 0,
                            resultadoAmostra: resultadoAmostra
                        });
                    });
                }
            });
        }

        const csvWriter = createObjectCsvWriter({ path: filePath, header: header, fieldDelimiter: ';' });
        await csvWriter.writeRecords(records);
        res.download(filePath);
    } catch (error) {
        console.error("Erro ao gerar CSV de Cigarrinha (Amostragem):", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};


const generateColheitaPDF = async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_colheita_custom.pdf`);
    doc.pipe(res);

    try {
        const { planId, selectedColumns, generatedBy } = req.query;
        const companyId = req.user.companyId;
        const selectedCols = JSON.parse(selectedColumns || '{}');

        if (!planId) {
            await generatePdfHeader(doc, 'Relatório Customizado de Colheita', companyId);
            doc.text('Nenhum plano de colheita selecionado.');
            generatePdfFooter(doc, generatedBy);
            doc.end();
            return;
        }

        const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
        if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
            await generatePdfHeader(doc, 'Relatório Customizado de Colheita', companyId);
            doc.text('Plano de colheita não encontrado ou não pertence a esta empresa.');
            generatePdfFooter(doc, generatedBy);
            doc.end();
            return;
        }

        const harvestPlan = harvestPlanDoc.data();
        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', companyId).get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            fazendasData[data.code] = { id: docSnap.id, ...data };
        });

        const title = `Relatório de Colheita - ${harvestPlan.frontName}`;
        let currentY = await generatePdfHeader(doc, title, companyId);

        const allPossibleHeadersConfig = [
            { id: 'seq', title: 'Seq.', minWidth: 35 },
            { id: 'fazenda', title: 'Fazenda', minWidth: 120 },
            { id: 'talhoes', title: 'Talhões', minWidth: 160 },
            { id: 'area', title: 'Área (ha)', minWidth: 50 },
            { id: 'producao', title: 'Prod. (ton)', minWidth: 60 },
            { id: 'variedade', title: 'Variedade', minWidth: 130 },
            { id: 'idade', title: 'Idade (m)', minWidth: 55 },
            { id: 'atr', title: 'ATR', minWidth: 40 },
            { id: 'maturador', title: 'Matur.', minWidth: 60 },
            { id: 'diasAplicacao', title: 'Dias Aplic.', minWidth: 70 },
            { id: 'distancia', title: 'KM', minWidth: 40 },
            { id: 'entrada', title: 'Entrada', minWidth: 65 },
            { id: 'saida', title: 'Saída', minWidth: 65 }
        ];

        let finalHeaders = [];
        const initialFixedHeaders = ['seq', 'fazenda', 'area', 'producao'];
        const finalFixedHeaders = ['entrada', 'saida'];

        initialFixedHeaders.forEach(id => {
            const header = allPossibleHeadersConfig.find(h => h.id === id);
            if (header) finalHeaders.push(header);
        });

        if (selectedCols['talhoes']) {
            const header = allPossibleHeadersConfig.find(h => h.id === 'talhoes');
            if (header) finalHeaders.push(header);
        }

        allPossibleHeadersConfig.forEach(header => {
            if (selectedCols[header.id] && !initialFixedHeaders.includes(header.id) && !finalFixedHeaders.includes(header.id) && header.id !== 'talhoes') {
                finalHeaders.push(header);
            }
        });

        finalFixedHeaders.forEach(id => {
            const header = allPossibleHeadersConfig.find(h => h.id === id);
            if (header) finalHeaders.push(header);
        });

        const headersText = finalHeaders.map(h => h.title);

        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        let totalMinWidth = 0;
        let flexibleColumnsCount = 0;

        finalHeaders.forEach(header => {
            totalMinWidth += header.minWidth;
            if (['fazenda', 'talhoes', 'variedade'].includes(header.id)) {
                flexibleColumnsCount++;
            }
        });

        let remainingWidth = pageWidth - totalMinWidth;
        let flexibleColumnExtraWidth = flexibleColumnsCount > 0 ? remainingWidth / flexibleColumnsCount : 0;

        let finalColumnWidths = finalHeaders.map(header => {
            let width = header.minWidth;
            if (['fazenda', 'talhoes', 'variedade'].includes(header.id)) {
                width += flexibleColumnExtraWidth;
            }
            return width;
        });

        const currentTotalWidth = finalColumnWidths.reduce((sum, w) => sum + w, 0);
        const difference = pageWidth - currentTotalWidth;
        if (difference !== 0 && flexibleColumnsCount > 0) {
            const firstFlexibleIndex = finalHeaders.findIndex(h => ['fazenda', 'talhoes', 'variedade'].includes(h.id));
            if (firstFlexibleIndex !== -1) {
                finalColumnWidths[firstFlexibleIndex] += difference;
            }
        }


        const rowHeight = 18;
        const textPadding = 5;

        currentY = drawRow(doc, headersText, currentY, true, false, finalColumnWidths, textPadding, rowHeight, finalHeaders);

        let grandTotalProducao = 0;
        let grandTotalArea = 0;
        let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
        const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
        const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

        for (let i = 0; i < harvestPlan.sequence.length; i++) {
            const group = harvestPlan.sequence[i];

            const isGroupClosed = group.plots.every(p => closedTalhaoIds.has(p.talhaoId));

            if (!isGroupClosed) {
                grandTotalProducao += group.totalProducao;
                grandTotalArea += group.totalArea;
            }

            const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
            const dataEntrada = new Date(currentDate.getTime());

            let dataSaida = new Date(dataEntrada.getTime());
            dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));

            if (!isGroupClosed) {
                currentDate = new Date(dataSaida.getTime());
                currentDate.setDate(currentDate.getDate() + 1);
            }

            let totalAgeInDays = 0, plotsWithDate = 0;
            let totalDistancia = 0, plotsWithDistancia = 0;
            const allVarieties = new Set();

            group.plots.forEach(plot => {
                const farm = fazendasData[group.fazendaCodigo];
                const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                if (talhao) {
                    if (talhao.dataUltimaColheita) {
                        const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
                        if (!isNaN(dataUltima)) {
                            totalAgeInDays += Math.abs(dataEntrada - dataUltima);
                            plotsWithDate++;
                        }
                    }
                    if (talhao.variedade) allVarieties.add(talhao.variedade);
                    if (typeof talhao.distancia === 'number') {
                        totalDistancia += talhao.distancia;
                        plotsWithDistancia++;
                    }
                }
            });

            const idadeMediaMeses = plotsWithDate > 0 ? ((totalAgeInDays / plotsWithDate) / (1000 * 60 * 60 * 24 * 30)).toFixed(1) : 'N/A';
            const avgDistancia = plotsWithDistancia > 0 ? (totalDistancia / plotsWithDistancia).toFixed(2) : 'N/A';

            let diasAplicacao = 'N/A';
            if (group.maturadorDate) {
                try {
                    const today = new Date();
                    const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
                    const diffTime = today - applicationDate;
                    if (diffTime >= 0) {
                        diasAplicacao = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    }
                } catch (e) { diasAplicacao = 'N/A'; }
            }

            const rowDataMap = {
                seq: i + 1,
                fazenda: `${group.fazendaCodigo} - ${group.fazendaName} ${isGroupClosed ? '(ENCERRADO)' : ''}`,
                talhoes: group.plots.map(p => p.talhaoName).join(', '),
                area: formatNumber(group.totalArea),
                producao: formatNumber(group.totalProducao),
                variedade: Array.from(allVarieties).join(', ') || 'N/A',
                idade: idadeMediaMeses,
                atr: group.atr || 'N/A',
                maturador: group.maturador || 'N/A',
                diasAplicacao: diasAplicacao,
                distancia: avgDistancia,
                entrada: dataEntrada.toLocaleDateString('pt-BR'),
                saida: dataSaida.toLocaleDateString('pt-BR')
            };

            const rowData = finalHeaders.map(h => rowDataMap[h.id]);

            currentY = await checkPageBreak(doc, currentY, title);
            currentY = drawRow(doc, rowData, currentY, false, false, finalColumnWidths, textPadding, rowHeight, finalHeaders, isGroupClosed);
        }

        currentY = await checkPageBreak(doc, currentY, title, 40);
        doc.y = currentY;

        const totalRowData = new Array(finalHeaders.length).fill('');
        const fazendaIndex = finalHeaders.findIndex(h => h.id === 'fazenda');
        const areaIndex = finalHeaders.findIndex(h => h.id === 'area');
        const prodIndex = finalHeaders.findIndex(h => h.id === 'producao');

        if (fazendaIndex !== -1) {
            totalRowData[fazendaIndex] = 'Total Geral (Ativo)';
        } else {
            totalRowData[1] = 'Total Geral (Ativo)';
        }

        if (areaIndex !== -1) {
            totalRowData[areaIndex] = formatNumber(grandTotalArea);
        }
        if (prodIndex !== -1) {
            totalRowData[prodIndex] = formatNumber(grandTotalProducao);
        }

        drawRow(doc, totalRowData, currentY, false, true, finalColumnWidths, textPadding, rowHeight, finalHeaders);

        generatePdfFooter(doc, generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro no PDF de Colheita:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

const generateColheitaCSV = async (req, res) => {
    try {
        const { planId, selectedColumns } = req.query;
        const companyId = req.user.companyId;
        const selectedCols = JSON.parse(selectedColumns || '{}');
        if (!planId) return res.status(400).send('Nenhum plano de colheita selecionado.');

        const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
        if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
            return res.status(404).send('Plano de colheita não encontrado ou não pertence a esta empresa.');
        }

        const harvestPlan = harvestPlanDoc.data();
        const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', companyId).get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            fazendasData[data.code] = { id: docSnap.id, ...data };
        });

        const allPossibleHeaders = [
            { id: 'seq', title: 'Seq.' }, { id: 'fazenda', title: 'Fazenda' },
            { id: 'talhoes', title: 'Talhões' }, { id: 'area', title: 'Área (ha)' },
            { id: 'producao', title: 'Produção (ton)' }, { id: 'variedade', title: 'Variedade' },
            { id: 'idade', title: 'Idade (m)' }, { id: 'atr', title: 'ATR' },
            { id: 'maturador', title: 'Maturador' }, { id: 'diasAplicacao', title: 'Dias Aplic.' },
            { id: 'distancia', title: 'KM' }, { id: 'entrada', title: 'Entrada' },
            { id: 'saida', title: 'Saída' }
        ];

        let finalHeaders = allPossibleHeaders.filter(h =>
            ['seq', 'fazenda', 'area', 'producao', 'entrada', 'saida'].includes(h.id) || selectedCols[h.id]
        );

        const records = [];
        let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
        const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
        const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

        for (let i = 0; i < harvestPlan.sequence.length; i++) {
            const group = harvestPlan.sequence[i];
            const isGroupClosed = group.plots.every(p => closedTalhaoIds.has(p.talhaoId));

            const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
            const dataEntrada = new Date(currentDate.getTime());
            let dataSaida = new Date(dataEntrada.getTime());
            dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));

            if (!isGroupClosed) {
                currentDate = new Date(dataSaida.getTime());
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Cálculos auxiliares
            let totalAgeInDays = 0, plotsWithDate = 0, totalDistancia = 0, plotsWithDistancia = 0;
            const allVarieties = new Set();
            group.plots.forEach(plot => {
                const farm = fazendasData[group.fazendaCodigo];
                const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                if (talhao) {
                    if (talhao.dataUltimaColheita) {
                        const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
                        if (!isNaN(dataUltima)) { totalAgeInDays += Math.abs(dataEntrada - dataUltima); plotsWithDate++; }
                    }
                    if (talhao.variedade) allVarieties.add(talhao.variedade);
                    if (typeof talhao.distancia === 'number') { totalDistancia += talhao.distancia; plotsWithDistancia++; }
                }
            });
            const idadeMediaMeses = plotsWithDate > 0 ? ((totalAgeInDays / plotsWithDate) / (1000 * 60 * 60 * 24 * 30)).toFixed(1) : 'N/A';
            const avgDistancia = plotsWithDistancia > 0 ? (totalDistancia / plotsWithDistancia).toFixed(2) : 'N/A';
            let diasAplicacao = 'N/A';
            if (group.maturadorDate) {
                try {
                    const diffTime = new Date() - new Date(group.maturadorDate + 'T03:00:00Z');
                    if (diffTime >= 0) diasAplicacao = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                } catch (e) {}
            }

            const record = {
                seq: i + 1,
                fazenda: `${group.fazendaCodigo} - ${group.fazendaName} ${isGroupClosed ? '(ENCERRADO)' : ''}`,
                talhoes: group.plots.map(p => p.talhaoName).join(', '),
                area: group.totalArea.toFixed(2),
                producao: group.totalProducao.toFixed(2),
                variedade: Array.from(allVarieties).join(', ') || 'N/A',
                idade: idadeMediaMeses,
                atr: group.atr || 'N/A',
                maturador: group.maturador || 'N/A',
                diasAplicacao: diasAplicacao,
                distancia: avgDistancia,
                entrada: dataEntrada.toLocaleDateString('pt-BR'),
                saida: dataSaida.toLocaleDateString('pt-BR')
            };
            records.push(record);
        }

        const filePath = path.join(os.tmpdir(), `relatorio_colheita_${Date.now()}.csv`);
        const csvWriter = createObjectCsvWriter({ path: filePath, header: finalHeaders });
        await csvWriter.writeRecords(records);
        res.download(filePath);
    } catch (error) {
        console.error("Erro ao gerar CSV de Colheita Detalhado:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};

const generateColheitaMensalPDF = async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=previsao_mensal_colheita.pdf`);
    doc.pipe(res);

    try {
        const { planId, generatedBy } = req.query;
        const companyId = req.user.companyId;
        if (!planId) throw new Error('Nenhum plano de colheita selecionado.');

        const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
        if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
             throw new Error('Plano de colheita não encontrado ou não pertence a esta empresa.');
        }

        const harvestPlan = harvestPlanDoc.data();
        const monthlyTotals = {};
        let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
        const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
        const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

        harvestPlan.sequence.forEach(group => {
            if (group.plots.every(p => closedTalhaoIds.has(p.talhaoId))) return;
            let producaoRestante = group.totalProducao;
            while (producaoRestante > 0) {
                const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyTotals[monthKey]) {
                    monthlyTotals[monthKey] = 0;
                }
                monthlyTotals[monthKey] += Math.min(producaoRestante, dailyTon);
                producaoRestante -= dailyTon;
                currentDate.setDate(currentDate.getDate() + 1);
            }
        });

        const title = `Previsão Mensal de Colheita - ${harvestPlan.frontName}`;
        let currentY = await generatePdfHeader(doc, title, companyId);

        const headers = ['Mês/Ano', 'Produção Total (ton)'];
        const columnWidths = [250, 250];

        currentY = drawRow(doc, headers, currentY, true, false, columnWidths);

        const sortedMonths = Object.keys(monthlyTotals).sort();
        for (const monthKey of sortedMonths) {
            currentY = await checkPageBreak(doc, currentY, title);
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
            const rowData = [
                `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`,
                formatNumber(monthlyTotals[monthKey])
            ];
            currentY = drawRow(doc, rowData, currentY, false, false, columnWidths);
        }

        generatePdfFooter(doc, generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Previsão Mensal:", error);
        if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        else doc.end();
    }
};

const generateColheitaMensalCSV = async (req, res) => {
    try {
        const { planId } = req.query;
        const companyId = req.user.companyId;
        if (!planId) return res.status(400).send('Nenhum plano de colheita selecionado.');

        const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
        if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
            return res.status(404).send('Plano de colheita não encontrado ou não pertence a esta empresa.');
        }

        const harvestPlan = harvestPlanDoc.data();
        const monthlyTotals = {};
        let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
        const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
        const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

        harvestPlan.sequence.forEach(group => {
            const isGroupClosed = group.plots.every(p => closedTalhaoIds.has(p.talhaoId));
            if(isGroupClosed) return;

            let producaoRestante = group.totalProducao;
            while (producaoRestante > 0) {
                const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyTotals[monthKey]) {
                    monthlyTotals[monthKey] = 0;
                }
                monthlyTotals[monthKey] += Math.min(producaoRestante, dailyTon);
                producaoRestante -= dailyTon;
                currentDate.setDate(currentDate.getDate() + 1);
            }
        });

        const filePath = path.join(os.tmpdir(), `previsao_mensal_${Date.now()}.csv`);
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: 'mes', title: 'Mês/Ano' },
                { id: 'producao', title: 'Produção Total (ton)' }
            ]
        });

        const records = Object.keys(monthlyTotals).sort().map(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
            return {
                mes: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`,
                producao: monthlyTotals[monthKey].toFixed(2)
            };
        });

        await csvWriter.writeRecords(records);
        res.download(filePath);
    } catch (error) {
        console.error("Erro ao gerar CSV de Previsão Mensal:", error);
        res.status(500).send('Erro ao gerar relatório.');
    }
};


module.exports = {
    generateBrocamentoPDF,
    generateBrocamentoCSV,
    generatePerdaPDF,
    generatePerdaCSV,
    generateCigarrinhaPDF,
    generateCigarrinhaCSV,
    generateCigarrinhaAmostragemPDF,
    generateCigarrinhaAmostragemCSV,
    generateColheitaPDF,
    generateColheitaCSV,
    generateColheitaMensalPDF,
    generateColheitaMensalCSV,
};
