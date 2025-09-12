const express = require('express');
const PDFDocument = require('pdfkit');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTA DE RASTREABILIDADE (HISTÓRICO DO TALHÃO) ---

    // GET /api/compliance/history/talhao/:talhaoId?safraId=...
    router.get('/history/talhao/:talhaoId', async (req, res) => {
        try {
            const { talhaoId } = req.params;
            const { safraId } = req.query;

            if (!safraId) {
                return res.status(400).send({ message: 'O parâmetro "safraId" é obrigatório.' });
            }

            // 1. Encontrar o planejamento
            let planejamentosQuery = db.collection('planejamentosSafra')
                .where('talhaoId', '==', talhaoId)
                .where('safraId', '==', safraId);

            const planejamentosSnapshot = await planejamentosQuery.get();
            if (planejamentosSnapshot.empty) {
                return res.status(404).send({ message: 'Nenhum planejamento encontrado para este talhão e safra.' });
            }
            const planejamentoDoc = planejamentosSnapshot.docs[0];
            const planejamentoId = planejamentoDoc.id;

            // 2. Buscar todas as atividades de campo associadas
            const atividadesSnapshot = await db.collection('atividadesCampo')
                .where('planejamentoId', '==', planejamentoId)
                .orderBy('data', 'asc')
                .get();

            const historico = [];
            for (const atividadeDoc of atividadesSnapshot.docs) {
                const atividade = atividadeDoc.data();
                // Simplificando o detalhe para a resposta JSON
                historico.push({
                    id: atividadeDoc.id,
                    data: atividade.data.toDate().toLocaleDateString('pt-BR'),
                    tipo: atividade.tipoAtividade,
                    detalhes: atividade.detalhes || {}
                });
            }

            res.status(200).send(historico);

        } catch (error) {
            console.error("Erro ao gerar histórico de rastreabilidade:", error);
            res.status(500).send({ message: 'Erro no servidor ao gerar histórico.' });
        }
    });

    // --- ROTA PARA GERAR PDF DO CADERNO DE CAMPO ---

    // GET /api/compliance/reports/caderno-de-campo/pdf?talhaoId=...&safraId=...
    router.get('/reports/caderno-de-campo/pdf', async (req, res) => {
        try {
            const { talhaoId, safraId } = req.query;
            if (!talhaoId || !safraId) {
                return res.status(400).send({ message: 'Os parâmetros "talhaoId" e "safraId" são obrigatórios.' });
            }

            // 1. Buscar dados
            const talhaoDoc = await db.collection('talhoes').doc(talhaoId).get();
            const safraDoc = await db.collection('safras').doc(safraId).get();
            if (!talhaoDoc.exists || !safraDoc.exists) {
                return res.status(404).send({ message: 'Talhão ou Safra não encontrados.' });
            }
            const planejamentosSnapshot = await db.collection('planejamentosSafra')
                .where('talhaoId', '==', talhaoId).where('safraId', '==', safraId).get();
            if (planejamentosSnapshot.empty) {
                return res.status(404).send({ message: 'Nenhum planejamento encontrado.' });
            }
            const planejamentoId = planejamentosSnapshot.docs[0].id;

            const atividadesSnapshot = await db.collection('atividadesCampo')
                .where('planejamentoId', '==', planejamentoId).orderBy('data', 'asc').get();

            // 2. Gerar o PDF
            const doc = new PDFDocument({ margin: 50, bufferPages: true });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=caderno_de_campo_${talhaoDoc.data().nome_identificador}.pdf`);
            doc.pipe(res);

            // Cabeçalho
            doc.fontSize(18).text('Caderno de Campo', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Talhão: ${talhaoDoc.data().nome_identificador}`);
            doc.text(`Safra: ${safraDoc.data().nome}`);
            doc.moveDown(2);

            doc.fontSize(14).text('Histórico de Atividades', { underline: true });
            doc.moveDown();

            // Tabela de Atividades
            for (const atividadeDoc of atividadesSnapshot.docs) {
                const atividade = atividadeDoc.data();
                doc.font('Helvetica-Bold').text(`Data: ${atividade.data.toDate().toLocaleDateString('pt-BR')}`);
                doc.font('Helvetica').text(`Atividade: ${atividade.tipoAtividade}`);
                doc.text(`Detalhes: ${JSON.stringify(atividade.detalhes || {})}`);
                doc.moveDown();

                if (doc.y > 700) { doc.addPage(); }
            }

            doc.end();

        } catch (error) {
            console.error("Erro ao gerar Caderno de Campo:", error);
            res.status(500).send({ message: 'Erro no servidor ao gerar relatório.' });
        }
    });

    return router;
};
