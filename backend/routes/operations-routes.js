const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTAS PARA PLANEJAMENTO DE SAFRA ---

    // POST /api/operations/planejamentos - Criar um novo planejamento para um talhão
    router.post('/planejamentos', async (req, res) => {
        try {
            const { safraId, talhaoId, culturaId, variedade, areaPlantada_ha } = req.body;
            if (!safraId || !talhaoId || !culturaId || !areaPlantada_ha) {
                return res.status(400).send({ message: 'Campos "safraId", "talhaoId", "culturaId" e "areaPlantada_ha" são obrigatórios.' });
            }

            // Opcional: Validar se os IDs de safra, talhão e cultura existem antes de criar.
            // Por simplicidade, vamos assumir que o frontend envia dados válidos.

            const planejamentoData = {
                safraId,
                talhaoId,
                culturaId,
                variedade: variedade || null,
                areaPlantada_ha: parseFloat(areaPlantada_ha),
                status: 'Planejado', // Status inicial: Planejado, Em Andamento, Colhido, Cancelado
                createdAt: new Date()
            };

            const docRef = await db.collection('planejamentosSafra').add(planejamentoData);
            res.status(201).send({ id: docRef.id, ...planejamentoData });

        } catch (error) {
            console.error("Erro ao criar planejamento de safra:", error);
            res.status(500).send({ message: 'Erro no servidor ao criar planejamento.' });
        }
    });

    // GET /api/operations/planejamentos/safra/:safraId - Listar todos os planejamentos de uma safra
    router.get('/planejamentos/safra/:safraId', async (req, res) => {
        try {
            const { safraId } = req.params;
            const snapshot = await db.collection('planejamentosSafra').where('safraId', '==', safraId).get();

            const planejamentos = [];
            snapshot.forEach(doc => {
                planejamentos.push({ id: doc.id, ...doc.data() });
            });

            res.status(200).send(planejamentos);
        } catch (error) {
            console.error("Erro ao listar planejamentos:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar planejamentos.' });
        }
    });

    // PUT /api/operations/planejamentos/:id - Atualizar um planejamento (ex: mudar status)
    router.put('/planejamentos/:id', async (req, res) => {
        try {
            const docRef = db.collection('planejamentosSafra').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Planejamento não encontrado.' });
            }

            const updateData = { ...req.body, updatedAt: new Date() };
            await docRef.update(updateData);
            res.status(200).send({ message: 'Planejamento atualizado com sucesso.', id: req.params.id });
        } catch (error) {
            console.error("Erro ao atualizar planejamento:", error);
            res.status(500).send({ message: 'Erro no servidor ao atualizar planejamento.' });
        }
    });

    // DELETE /api/operations/planejamentos/:id - Deletar um planejamento
    router.delete('/planejamentos/:id', async (req, res) => {
        try {
            const docRef = db.collection('planejamentosSafra').doc(req.params.id);
            const doc = await docRef.get();
            if (!doc.exists) {
                return res.status(404).send({ message: 'Planejamento não encontrado.' });
            }
            // Adicionar validação para não deletar se houver atividades associadas
            await docRef.delete();
            res.status(200).send({ message: 'Planejamento deletado com sucesso.' });
        } catch (error) {
            console.error("Erro ao deletar planejamento:", error);
            res.status(500).send({ message: 'Erro no servidor ao deletar planejamento.' });
        }
    });

    // --- ROTAS PARA ATIVIDADES DE CAMPO ---

    // POST /api/operations/atividades - Registrar uma nova atividade de campo
    router.post('/atividades', async (req, res) => {
        try {
            const { planejamentoId, tipoAtividade, data, detalhes } = req.body;
            if (!planejamentoId || !tipoAtividade || !data) {
                return res.status(400).send({ message: 'Campos "planejamentoId", "tipoAtividade" e "data" são obrigatórios.' });
            }

            // Opcional: Validar se o planejamentoId existe
            const planejamentoDoc = await db.collection('planejamentosSafra').doc(planejamentoId).get();
            if (!planejamentoDoc.exists) {
                return res.status(404).send({ message: 'O planejamento especificado não foi encontrado.' });
            }

            const atividadeData = {
                planejamentoId,
                tipoAtividade, // Ex: 'Plantio', 'Colheita', 'Pulverização'
                data: new Date(data),
                detalhes: detalhes || {}, // Objeto com insumos, maquinário, etc.
                createdAt: new Date()
            };

            const docRef = await db.collection('atividadesCampo').add(atividadeData);

            // Se a atividade for 'Plantio', atualiza o status do planejamento para 'Em Andamento'
            if (tipoAtividade === 'Plantio') {
                await db.collection('planejamentosSafra').doc(planejamentoId).update({ status: 'Em Andamento' });
            }
            // Se a atividade for 'Colheita', atualiza o status para 'Colhido'
            if (tipoAtividade === 'Colheita') {
                await db.collection('planejamentosSafra').doc(planejamentoId).update({ status: 'Colhido' });
            }

            res.status(201).send({ id: docRef.id, ...atividadeData });
        } catch (error) {
            console.error("Erro ao registrar atividade:", error);
            res.status(500).send({ message: 'Erro no servidor ao registrar atividade.' });
        }
    });

    // GET /api/operations/atividades/planejamento/:planejamentoId - Listar atividades de um planejamento
    router.get('/atividades/planejamento/:planejamentoId', async (req, res) => {
        try {
            const { planejamentoId } = req.params;
            const snapshot = await db.collection('atividadesCampo')
                .where('planejamentoId', '==', planejamentoId)
                .orderBy('data', 'asc')
                .get();

            const atividades = [];
            snapshot.forEach(doc => {
                atividades.push({ id: doc.id, ...doc.data() });
            });

            res.status(200).send(atividades);
        } catch (error) {
            console.error("Erro ao listar atividades:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar atividades.' });
        }
    });

    // PUT /api/operations/atividades/:id - Atualizar uma atividade
    router.put('/atividades/:id', async (req, res) => {
        try {
            const docRef = db.collection('atividadesCampo').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Atividade não encontrada.' });
            }
            await docRef.update({ ...req.body, updatedAt: new Date() });
            res.status(200).send({ message: 'Atividade atualizada com sucesso.' });
        } catch (error) {
            console.error("Erro ao atualizar atividade:", error);
            res.status(500).send({ message: 'Erro no servidor ao atualizar atividade.' });
        }
    });

    // DELETE /api/operations/atividades/:id - Deletar uma atividade
    router.delete('/atividades/:id', async (req, res) => {
        try {
            const docRef = db.collection('atividadesCampo').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Atividade não encontrada.' });
            }
            await docRef.delete();
            res.status(200).send({ message: 'Atividade deletada com sucesso.' });
        } catch (error) {
            console.error("Erro ao deletar atividade:", error);
            res.status(500).send({ message: 'Erro no servidor ao deletar atividade.' });
        }
    });

    return router;
};
