const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow } = require('../utils/pdfGenerator');
const { getFilteredData } = require('../utils/dataUtils');

const sortByDateAndFazenda = (a, b) => {
    const dateComparison = new Date(a.data) - new Date(b.data);
    if (dateComparison !== 0) {
        return dateComparison;
    }
    const codeA = parseInt(a.codigo, 10) || 0;
    const codeB = parseInt(b.codigo, 10) || 0;
    return codeA - codeB;
};

const generateCigarrinhaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_cigarrinha.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getFilteredData(db, 'cigarrinha', filters);
        const title = 'Relatório de Monitoramento de Cigarrinha';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
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

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const headers = ['Data', 'Fazenda', 'Talhão', 'Variedade', 'F1', 'F2', 'F3', 'F4', 'F5', 'Adulto', 'Resultado'];

        const rows = enrichedData.map(r => {
            const date = new Date(r.data + 'T03:00:00Z');
            const formattedDate = date.toLocaleDateString('pt-BR');
            return [
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
        });

        await drawTable(doc, headers, rows, title, logoBase64, currentY);

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

const generateCigarrinhaAmostragemPdf = async (req, res, db) => {
    const doc = setupDoc();
    const { tipoRelatorio = 'detalhado' } = req.query;
    const filename = `relatorio_cigarrinha_amostragem_${tipoRelatorio}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getFilteredData(db, 'cigarrinhaAmostragem', filters);
        const title = `Relatório de Cigarrinha (Amostragem) - ${tipoRelatorio.charAt(0).toUpperCase() + tipoRelatorio.slice(1)}`;
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum dado encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        if (tipoRelatorio === 'resumido') {
            const groupedData = data.reduce((acc, r) => {
                const date = new Date(r.data + 'T03:00:00Z');
                const formattedDate = date.toLocaleDateString('pt-BR');
                const key = `${formattedDate}|${r.codigo}|${r.fazenda}|${r.talhao}`;

                if (!acc[key]) {
                    acc[key] = {
                        data: r.data,
                        formattedDate: formattedDate,
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
            const summarizedData = Object.values(groupedData);
            summarizedData.sort(sortByDateAndFazenda);

            const rows = summarizedData.map(group => [
                group.formattedDate,
                `${group.codigo} - ${group.fazenda}`,
                group.talhao,
                group.variedade,
                group.fase1, group.fase2, group.fase3, group.fase4, group.fase5
            ]);

            await drawTable(doc, headers, rows, title, logoBase64, currentY);

        } else if (tipoRelatorio === 'final') {
            const headers = ['Fazenda', 'Data', 'Variedade', 'Adulto', 'Fase1', 'Fase2', 'Fase3', 'Fase4', 'Fase5', 'Resultado Final'];

            const rows = data.map(r => {
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

                return [
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
            });

            await drawTable(doc, headers, rows, title, logoBase64, currentY);

        } else { // Detalhado
            const headers = ['Fazenda', 'Talhão', 'Data', 'Variedade', 'Adulto', 'Nº Amostra', 'F1', 'F2', 'F3', 'F4', 'F5', 'Resultado Amostra'];
            const divisor = parseInt(filters.divisor, 10) || parseInt(data[0]?.divisor || '5', 10);

            const rows = [];
            data.forEach(r => {
                if (r.amostras && r.amostras.length > 0) {
                    r.amostras.forEach((amostra, i) => {
                        const date = new Date(r.data + 'T03:00:00Z');
                        const formattedDate = date.toLocaleDateString('pt-BR');
                        const somaFases = (amostra.fase1 || 0) + (amostra.fase2 || 0) + (amostra.fase3 || 0) + (amostra.fase4 || 0) + (amostra.fase5 || 0);
                        const resultadoAmostra = (somaFases / divisor).toFixed(2).replace('.', ',');

                        rows.push([
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
                        ]);
                    });
                }
            });

            await drawTable(doc, headers, rows, title, logoBase64, currentY);
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

module.exports = {
    generateCigarrinhaPdf,
    generateCigarrinhaAmostragemPdf
};
