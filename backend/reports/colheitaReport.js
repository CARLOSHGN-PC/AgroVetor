const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, drawSummaryRow } = require('../utils/pdfGenerator');

const generateColheitaPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_colheita_custom.pdf`);
    doc.pipe(res);

    try {
        const { planId, selectedColumns, generatedBy, companyId } = req.query;
        const selectedCols = JSON.parse(selectedColumns || '{}');
        const logoBase64 = await getLogoBase64(db, companyId);

        if (!planId) {
            await generatePdfHeader(doc, 'Relatório Customizado de Colheita', logoBase64);
            doc.text('Nenhum plano de colheita selecionado.');
            generatePdfFooter(doc, generatedBy);
            doc.end();
            return;
        }
         if (!companyId) {
            await generatePdfHeader(doc, 'Relatório Customizado de Colheita', logoBase64);
            doc.text('ID da empresa não fornecido.');
            generatePdfFooter(doc, generatedBy);
            doc.end();
            return;
        }

        const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
        if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
            await generatePdfHeader(doc, 'Relatório Customizado de Colheita', logoBase64);
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
        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const allPossibleHeadersConfig = [
            { id: 'seq', title: 'Seq.' },
            { id: 'fazenda', title: 'Fazenda' },
            { id: 'talhoes', title: 'Talhões' },
            { id: 'area', title: 'Área (ha)' },
            { id: 'producao', title: 'Prod. (ton)' },
            { id: 'variedade', title: 'Variedade' },
            { id: 'idade', title: 'Idade (m)' },
            { id: 'atr', title: 'ATR' },
            { id: 'maturador', title: 'Matur.' },
            { id: 'diasAplicacao', title: 'Dias Aplic.' },
            { id: 'distancia', title: 'KM' },
            { id: 'entrada', title: 'Entrada' },
            { id: 'saida', title: 'Saída' }
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

        let grandTotalProducao = 0;
        let grandTotalArea = 0;
        let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
        const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
        const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

        const rows = [];

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

            rows.push(finalHeaders.map(h => rowDataMap[h.id]));
        }

        const columnWidths = calculateColumnWidths(doc, headersText, rows, doc.page.width, doc.page.margins);
        currentY = await drawTable(doc, headersText, rows, title, logoBase64, currentY);

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

        await drawSummaryRow(doc, totalRowData, currentY, columnWidths, title, logoBase64);

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

const generateColheitaMensalPdf = async (req, res, db) => {
    const doc = setupDoc({ layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=previsao_mensal_colheita.pdf`);
    doc.pipe(res);

    try {
        const { planId, generatedBy, companyId } = req.query;
        if (!planId) throw new Error('Nenhum plano de colheita selecionado.');
        if (!companyId) throw new Error('O ID da empresa é obrigatório.');

        const logoBase64 = await getLogoBase64(db, companyId);
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
        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const headers = ['Mês/Ano', 'Produção Total (ton)'];
        const sortedMonths = Object.keys(monthlyTotals).sort();

        const rows = sortedMonths.map(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
            return [
                `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`,
                formatNumber(monthlyTotals[monthKey])
            ];
        });

        await drawTable(doc, headers, rows, title, logoBase64, currentY);

        generatePdfFooter(doc, generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Previsão Mensal:", error);
        if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        else doc.end();
    }
};

module.exports = {
    generateColheitaPdf,
    generateColheitaMensalPdf
};
