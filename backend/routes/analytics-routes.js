const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTA PARA KPIs GLOBAIS DA SAFRA ---

    // GET /api/analytics/kpis/safra/:safraId - Calcula os KPIs globais para uma safra
    router.get('/kpis/safra/:safraId', async (req, res) => {
        try {
            const { safraId } = req.params;
            let totalAreaPlantada = 0;
            let totalProducao = 0; // Assumindo em toneladas
            let custoTotal = 0;
            let receitaTotal = 0;

            // 1. Encontrar todos os planejamentos da safra
            const planejamentosSnapshot = await db.collection('planejamentosSafra').where('safraId', '==', safraId).get();
            if (planejamentosSnapshot.empty) {
                return res.status(200).send({ message: "Nenhum dado encontrado para esta safra." });
            }
            const planejamentoIds = planejamentosSnapshot.docs.map(doc => doc.id);
            const talhaoIds = planejamentosSnapshot.docs.map(doc => doc.data().talhaoId);

            planejamentosSnapshot.forEach(doc => {
                totalAreaPlantada += doc.data().areaPlantada_ha || 0;
            });

            // 2. Calcular produção total a partir das atividades de colheita
            const atividadesSnapshot = await db.collection('atividadesCampo')
                .where('planejamentoId', 'in', planejamentoIds)
                .where('tipoAtividade', '==', 'Colheita')
                .get();

            atividadesSnapshot.forEach(doc => {
                totalProducao += doc.data().detalhes.toneladas || 0;
            });

            // 3. Calcular custos e receitas a partir das transações financeiras da safra
            const transacoesSnapshot = await db.collection('transacoesFinanceiras').where('safraId', '==', safraId).get();
            transacoesSnapshot.forEach(doc => {
                const transacao = doc.data();
                if (transacao.tipo === 'Receita') {
                    receitaTotal += transacao.valor;
                } else {
                    custoTotal += transacao.valor; // Despesas são negativas, então somamos
                }
            });

            // Adicionar aqui a lógica para somar custos de insumos, etc. (simplificado por enquanto)


            // 4. Calcular KPIs
            const produtividadeMedia = totalAreaPlantada > 0 ? totalProducao / totalAreaPlantada : 0; // ton/ha
            const custoPorHectare = totalAreaPlantada > 0 ? Math.abs(custoTotal) / totalAreaPlantada : 0;
            const lucroPorHectare = totalAreaPlantada > 0 ? (receitaTotal + custoTotal) / totalAreaPlantada : 0;

            res.status(200).send({
                safraId,
                totalAreaPlantada_ha: totalAreaPlantada,
                totalProducao_ton: totalProducao,
                receitaTotal,
                custoTotal,
                lucroTotal: receitaTotal + custoTotal,
                produtividadeMedia_ton_ha: produtividadeMedia,
                custoPorHectare,
                lucroPorHectare
            });

        } catch (error) {
            console.error("Erro ao calcular KPIs da safra:", error);
            res.status(500).send({ message: 'Erro no servidor ao calcular KPIs.' });
        }
    });

    // --- ROTA PARA DADOS DE MAPA DE CALOR (HEATMAP) ---

    // GET /api/analytics/heatmap/produtividade/safra/:safraId - Gera dados para mapa de calor de produtividade
    router.get('/heatmap/produtividade/safra/:safraId', async (req, res) => {
        try {
            const { safraId } = req.params;
            const heatmapData = [];

            // 1. Encontrar todos os planejamentos da safra
            const planejamentosSnapshot = await db.collection('planejamentosSafra').where('safraId', '==', safraId).get();
            if (planejamentosSnapshot.empty) {
                return res.status(200).send([]);
            }

            for (const planDoc of planejamentosSnapshot.docs) {
                const planejamento = planDoc.data();
                const talhaoId = planejamento.talhaoId;
                const area = planejamento.areaPlantada_ha || 0;

                // 2. Para cada planejamento, buscar o talhão para pegar a geometria
                const talhaoDoc = await db.collection('talhoes').doc(talhaoId).get();
                if (!talhaoDoc.exists) continue;

                const geometria = talhaoDoc.data().geometria;
                if (!geometria) continue; // Pula se não tiver dados de mapa

                // 3. Calcular a produção para este planejamento específico
                let producaoTalhao = 0;
                const atividadesSnapshot = await db.collection('atividadesCampo')
                    .where('planejamentoId', '==', planDoc.id)
                    .where('tipoAtividade', '==', 'Colheita')
                    .get();

                atividadesSnapshot.forEach(doc => {
                    producaoTalhao += (doc.data().detalhes && doc.data().detalhes.toneladas) ? doc.data().detalhes.toneladas : 0;
                });

                // 4. Calcular a produtividade e adicionar aos dados do heatmap
                const produtividade = area > 0 ? producaoTalhao / area : 0; // ton/ha

                heatmapData.push({
                    talhaoId,
                    nome: talhaoDoc.data().nome_identificador,
                    geometria,
                    valor: produtividade,
                    unidade: 'ton/ha'
                });
            }

            res.status(200).send(heatmapData);

        } catch (error) {
            console.error("Erro ao gerar dados para heatmap:", error);
            res.status(500).send({ message: 'Erro no servidor ao gerar dados para heatmap.' });
        }
    });

    return router;
};
