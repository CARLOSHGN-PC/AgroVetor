const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTAS PARA TRANSAÇÕES FINANCEIRAS (DESPESAS/RECEITAS) ---

    // POST /api/financial/transacoes - Registrar uma nova transação financeira
    router.post('/transacoes', async (req, res) => {
        try {
            const { tipo, descricao, valor, categoria, data } = req.body;
            if (!tipo || !descricao || !valor || !categoria || !data) {
                return res.status(400).send({ message: 'Campos "tipo", "descricao", "valor", "categoria" e "data" são obrigatórios.' });
            }
            if (!['Despesa', 'Receita'].includes(tipo)) {
                return res.status(400).send({ message: 'O "tipo" deve ser "Despesa" ou "Receita".' });
            }

            const transacaoData = {
                tipo,
                descricao,
                valor: parseFloat(valor), // O valor será negativo para despesa, positivo para receita
                categoria,
                data: new Date(data),
                // Opcional: linkar a outros documentos
                safraId: req.body.safraId || null,
                fazendaId: req.body.fazendaId || null,
                talhaoId: req.body.talhaoId || null,
                createdAt: new Date()
            };

            const docRef = await db.collection('transacoesFinanceiras').add(transacaoData);
            res.status(201).send({ id: docRef.id, ...transacaoData });
        } catch (error) {
            console.error("Erro ao registrar transação financeira:", error);
            res.status(500).send({ message: 'Erro no servidor ao registrar transação.' });
        }
    });

    // GET /api/financial/transacoes - Listar transações com filtros
    router.get('/transacoes', async (req, res) => {
        try {
            const { tipo, categoria, safraId, fazendaId, talhaoId } = req.query;
            let query = db.collection('transacoesFinanceiras');

            if (tipo) query = query.where('tipo', '==', tipo);
            if (categoria) query = query.where('categoria', '==', categoria);
            if (safraId) query = query.where('safraId', '==', safraId);
            if (fazendaId) query = query.where('fazendaId', '==', fazendaId);
            if (talhaoId) query = query.where('talhaoId', '==', talhaoId);

            const snapshot = await query.orderBy('data', 'desc').get();
            const transacoes = [];
            snapshot.forEach(doc => transacoes.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(transacoes);
        } catch (error) {
            console.error("Erro ao listar transações:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar transações.' });
        }
    });

    // --- ROTA DE CÁLCULO DE RENTABILIDADE ---

    // GET /api/financial/rentabilidade/talhao/:talhaoId?safraId=... - Calcula a rentabilidade de um talhão
    router.get('/rentabilidade/talhao/:talhaoId', async (req, res) => {
        try {
            const { talhaoId } = req.params;
            const { safraId } = req.query; // safraId é opcional

            let totalReceitas = 0;
            const custosDetalhados = {
                insumos: 0,
                outrasDespesas: 0,
            };

            // 1. Encontrar os planejamentos para o talhão e safra(s)
            let planejamentosQuery = db.collection('planejamentosSafra').where('talhaoId', '==', talhaoId);
            if (safraId) {
                planejamentosQuery = planejamentosQuery.where('safraId', '==', safraId);
            }
            const planejamentosSnapshot = await planejamentosQuery.get();
            const planejamentoIds = planejamentosSnapshot.docs.map(doc => doc.id);

            // 2. Calcular custo dos insumos a partir das atividades de campo
            if (planejamentoIds.length > 0) {
                const atividadesSnapshot = await db.collection('atividadesCampo').where('planejamentoId', 'in', planejamentoIds).get();
                for (const atividadeDoc of atividadesSnapshot.docs) {
                    const atividade = atividadeDoc.data();
                    if (atividade.detalhes && atividade.detalhes.insumos) {
                        for (const insumoUsado of atividade.detalhes.insumos) {
                            if (insumoUsado.insumoId && insumoUsado.quantidade) {
                                const insumoDoc = await db.collection('insumos').doc(insumoUsado.insumoId).get();
                                if (insumoDoc.exists) {
                                    const precoInsumo = insumoDoc.data().preco || 0;
                                    custosDetalhados.insumos += insumoUsado.quantidade * precoInsumo;
                                }
                            }
                        }
                    }
                }
            }

            // 3. Buscar transações financeiras manuais (despesas e receitas)
            let transacoesQuery = db.collection('transacoesFinanceiras').where('talhaoId', '==', talhaoId);
             if (safraId) {
                transacoesQuery = transacoesQuery.where('safraId', '==', safraId);
            }
            const transacoesSnapshot = await transacoesQuery.get();

            transacoesSnapshot.forEach(doc => {
                const transacao = doc.data();
                if (transacao.tipo === 'Receita') {
                    totalReceitas += transacao.valor;
                } else {
                    custosDetalhados.outrasDespesas += transacao.valor;
                }
            });

            const totalDespesas = custosDetalhados.insumos + custosDetalhados.outrasDespesas;

            res.status(200).send({
                talhaoId,
                safraId: safraId || 'Todas as Safras',
                totalReceitas,
                totalDespesas,
                lucro: totalReceitas - totalDespesas,
                custosDetalhados,
            });

        } catch (error) {
            console.error("Erro ao calcular rentabilidade:", error);
            res.status(500).send({ message: 'Erro no servidor ao calcular rentabilidade.' });
        }
    });

    return router;
};
