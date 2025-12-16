const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber } = require('../utils/pdfGenerator');
const { getShapefileData, findTalhaoForTrap, findShapefileProp, safeToDate } = require('../utils/geoUtils');
const admin = require('firebase-admin');

const generateMonitoramentoPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_monitoramento.pdf`);
    doc.pipe(res);

    try {
        const { inicio, fim, fazendaCodigo, generatedBy, companyId } = req.query;
        if (!companyId) {
            await generatePdfHeader(doc, 'Erro', null);
            doc.text('O ID da empresa não foi fornecido.');
            doc.end();
            return;
        }

        const logoBase64 = await getLogoBase64(db, companyId);

        let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Coletada');

        if (inicio) query = query.where('dataColeta', '>=', new Date(inicio));
        if (fim) query = query.where('dataColeta', '<=', new Date(fim));

        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

        const title = 'Relatório de Monitoramento de Armadilhas';
        let currentY = await generatePdfHeader(doc, title, logoBase64);

        if (data.length === 0) {
            doc.text('Nenhuma armadilha coletada encontrada para os filtros selecionados.');
            generatePdfFooter(doc, generatedBy);
            return doc.end();
        }

        const geojsonData = await getShapefileData(db, companyId);

        const enrichedData = data.map(trap => {
            const talhaoProps = geojsonData ? findTalhaoForTrap(trap, geojsonData) : null;
            return {
                ...trap,
                fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                fazendaCodigoShape: findShapefileProp(talhaoProps, ['CD_FAZENDA', 'FUNDO_AGR']) || 'N/A',
                talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A'
            };
        });

        let finalData = enrichedData;
        if (fazendaCodigo) {
            finalData = enrichedData.filter(d => String(d.fazendaCodigoShape) === String(fazendaCodigo));
        }

        // Sort: Farm > Date > Talhao
        finalData.sort((a, b) => {
            const fCodeA = parseInt(a.fazendaCodigoShape) || 0;
            const fCodeB = parseInt(b.fazendaCodigoShape) || 0;
            if (fCodeA !== fCodeB) return fCodeA - fCodeB;

            const dateA = a.dataColeta ? a.dataColeta.toDate() : new Date(0);
            const dateB = b.dataColeta ? b.dataColeta.toDate() : new Date(0);
            if (dateA - dateB !== 0) return dateA - dateB;

            const tA = String(a.talhaoNome||'');
            const tB = String(b.talhaoNome||'');
            return tA.localeCompare(tB, undefined, {numeric: true});
        });

        const headers = ['Fazenda', 'Data Coleta', 'Data Instalação', 'Talhão', 'Qtd. Mariposas'];
        const rows = finalData.map(trap => [
            `${trap.fazendaCodigoShape} - ${trap.fazendaNome}`,
            trap.dataColeta && typeof trap.dataColeta.toDate === 'function' ? trap.dataColeta.toDate().toLocaleDateString('pt-BR') : 'N/A',
            trap.dataInstalacao && typeof trap.dataInstalacao.toDate === 'function' ? trap.dataInstalacao.toDate().toLocaleDateString('pt-BR') : 'N/A',
            trap.talhaoNome,
            trap.contagemMariposas || 0
        ]);

        await drawTable(doc, headers, rows, title, logoBase64, currentY);

        generatePdfFooter(doc, generatedBy);
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar PDF de Monitoramento:", error);
        if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        else doc.end();
    }
};

const generateArmadilhasPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_armadilhas.pdf`);
    doc.pipe(res);

    try {
        const { inicio, fim, fazendaCodigo, generatedBy, companyId } = req.query;
        if (!companyId) {
            await generatePdfHeader(doc, 'Erro', null);
            doc.text('O ID da empresa não foi fornecido.');
            doc.end();
            return;
        }

        const logoBase64 = await getLogoBase64(db, companyId);

        let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Coletada');

        if (inicio) query = query.where('dataColeta', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
        if (fim) query = query.where('dataColeta', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

        const title = 'Relatório de Armadilhas Coletadas';

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhuma armadilha coletada encontrada para os filtros selecionados.');
            generatePdfFooter(doc, generatedBy);
            return doc.end();
        }

        const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
        const usersMap = {};
        usersSnapshot.forEach(doc => {
            usersMap[doc.id] = doc.data().username || doc.data().email;
        });

        const geojsonData = await getShapefileData(db, companyId);

        let enrichedData = data.map(trap => {
            const talhaoProps = geojsonData ? findTalhaoForTrap(trap, geojsonData) : null;
            const dataInstalacao = safeToDate(trap.dataInstalacao);
            const dataColeta = safeToDate(trap.dataColeta);

            let diasEmCampo = 'N/A';
            if (dataInstalacao && dataColeta) {
                const diffTime = Math.abs(dataColeta - dataInstalacao);
                diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            return {
                ...trap,
                fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fazendaCode || 'N/A',
                talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                dataInstalacaoFmt: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                dataColetaFmt: dataColeta ? dataColeta.toLocaleDateString('pt-BR') : 'N/A',
                diasEmCampo: diasEmCampo,
                instaladoPorNome: usersMap[trap.instaladoPor] || 'Desconhecido',
                coletadoPorNome: usersMap[trap.coletadoPor] || 'Desconhecido',
                rawDateColeta: dataColeta,
            };
        });

        if (fazendaCodigo) {
            const farmQuery = db.collection('fazendas').where('companyId', '==', companyId).where('code', '==', fazendaCodigo).limit(1);
            const farm = await farmQuery.get();
            if (!farm.empty) {
                const farmName = farm.docs[0].data().name;
                enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
            } else {
                enrichedData = [];
            }
        }

        // Sort: Farm > Data Inst > Talhao
        enrichedData.sort((a, b) => {
            const fCodeA = parseInt(a.fundoAgricola) || 0;
            const fCodeB = parseInt(b.fundoAgricola) || 0;
            if (fCodeA !== fCodeB) return fCodeA - fCodeB;

            const d1 = a.dataInstalacao ? safeToDate(a.dataInstalacao) : new Date(0);
            const d2 = b.dataInstalacao ? safeToDate(b.dataInstalacao) : new Date(0);
            if (d1 - d2 !== 0) return d1 - d2;

            const tA = String(a.talhaoNome||'');
            const tB = String(b.talhaoNome||'');
            return tA.localeCompare(tB, undefined, {numeric: true});
        });

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const headers = ['Fazenda', 'Data Inst.', 'Data Coleta', 'Talhão', 'Fundo Agr.', 'Dias Campo', 'Qtd. Mariposas', 'Instalado Por', 'Coletado Por', 'Obs.'];
        const rows = enrichedData.map(trap => [
            trap.fazendaNome,
            trap.dataInstalacaoFmt,
            trap.dataColetaFmt,
            trap.talhaoNome,
            trap.fundoAgricola,
            trap.diasEmCampo,
            trap.contagemMariposas || 0,
            trap.instaladoPorNome,
            trap.coletadoPorNome,
            trap.observacoes || ''
        ]);

        await drawTable(doc, headers, rows, title, logoBase64, currentY);

        generatePdfFooter(doc, generatedBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF de Armadilhas:", error);
        if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        else doc.end();
    }
};

const generateArmadilhasAtivasPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_armadilhas_instaladas.pdf`);
    doc.pipe(res);

    try {
        const { inicio, fim, fazendaCodigo, generatedBy, companyId } = req.query;
        if (!companyId) {
            await generatePdfHeader(doc, 'Erro', null);
            doc.text('O ID da empresa não foi fornecido.');
            doc.end();
            return;
        }

        const logoBase64 = await getLogoBase64(db, companyId);

        let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Ativa');

        if (inicio) query = query.where('dataInstalacao', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
        if (fim) query = query.where('dataInstalacao', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

        const title = 'Relatório de Armadilhas Instaladas (Ativas)';

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhuma armadilha ativa encontrada para os filtros selecionados.');
            generatePdfFooter(doc, generatedBy);
            return doc.end();
        }

        const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
        const usersMap = {};
        usersSnapshot.forEach(doc => {
            usersMap[doc.id] = doc.data().username || doc.data().email;
        });

        const geojsonData = await getShapefileData(db, companyId);

        let enrichedData = data.map(trap => {
            const talhaoProps = geojsonData ? findTalhaoForTrap(trap, geojsonData) : null;
            const dataInstalacao = safeToDate(trap.dataInstalacao);

            let diasEmCampo = 'N/A';
            let previsaoRetiradaFmt = 'N/A';

            if (dataInstalacao) {
                const diffTime = Math.abs(new Date() - dataInstalacao);
                diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const previsaoRetirada = new Date(dataInstalacao);
                previsaoRetirada.setDate(previsaoRetirada.getDate() + 7);
                previsaoRetiradaFmt = previsaoRetirada.toLocaleDateString('pt-BR');
            }

            return {
                ...trap,
                fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fazendaCode || 'N/A',
                talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                dataInstalacaoFmt: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                previsaoRetiradaFmt: previsaoRetiradaFmt,
                diasEmCampo: diasEmCampo,
                instaladoPorNome: usersMap[trap.instaladoPor] || 'Desconhecido',
                rawDateInst: dataInstalacao
            };
        });

        if (fazendaCodigo) {
            const farmQuery = db.collection('fazendas').where('companyId', '==', companyId).where('code', '==', fazendaCodigo).limit(1);
            const farm = await farmQuery.get();
            if (!farm.empty) {
                const farmName = farm.docs[0].data().name;
                enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
            } else {
                enrichedData = [];
            }
        }

        // Sort: Farm > Date > Talhao
        enrichedData.sort((a, b) => {
            const fCodeA = parseInt(a.fundoAgricola) || 0;
            const fCodeB = parseInt(b.fundoAgricola) || 0;
            if (fCodeA !== fCodeB) return fCodeA - fCodeB;

            const d1 = a.rawDateInst || new Date(0);
            const d2 = b.rawDateInst || new Date(0);
            if (d1 - d2 !== 0) return d1 - d2;

            const tA = String(a.talhaoNome||'');
            const tB = String(b.talhaoNome||'');
            return tA.localeCompare(tB, undefined, {numeric: true});
        });

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const headers = ['Fazenda', 'Data Inst.', 'Talhão', 'Fundo Agr.', 'Previsão Retirada', 'Dias Campo', 'Instalado Por', 'Obs.'];
        const rows = enrichedData.map(trap => [
            trap.fazendaNome,
            trap.dataInstalacaoFmt,
            trap.talhaoNome,
            trap.fundoAgricola,
            trap.previsaoRetiradaFmt,
            trap.diasEmCampo,
            trap.instaladoPorNome,
            trap.observacoes || ''
        ]);

        await drawTable(doc, headers, rows, title, logoBase64, currentY);

        generatePdfFooter(doc, generatedBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF de Armadilhas Ativas:", error);
        if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        else doc.end();
    }
};

module.exports = {
    generateMonitoramentoPdf,
    generateArmadilhasPdf,
    generateArmadilhasAtivasPdf
};
