const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTAS PARA CATÁLOGO DE INSUMOS ---

    // POST /api/inventory/insumos - Criar um novo tipo de insumo no catálogo
    router.post('/insumos', async (req, res) => {
        try {
            const { nome, tipo, unidadePadrao, preco } = req.body;
            if (!nome || !tipo || !unidadePadrao) {
                return res.status(400).send({ message: 'Campos "nome", "tipo" e "unidadePadrao" são obrigatórios.' });
            }

            const insumoData = {
                nome,
                tipo, // 'Semente', 'Fertilizante', 'Defensivo', etc.
                unidadePadrao, // 'kg', 'L', 'un'
                preco: parseFloat(preco || 0), // Adicionando o campo de preço
                createdAt: new Date()
            };

            const docRef = await db.collection('insumos').add(insumoData);
            res.status(201).send({ id: docRef.id, ...insumoData });
        } catch (error) {
            console.error("Erro ao criar insumo:", error);
            res.status(500).send({ message: 'Erro no servidor ao criar insumo.' });
        }
    });

    // GET /api/inventory/insumos - Listar todos os insumos do catálogo
    router.get('/insumos', async (req, res) => {
        try {
            const snapshot = await db.collection('insumos').orderBy('nome').get();
            const insumos = [];
            snapshot.forEach(doc => insumos.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(insumos);
        } catch (error) {
            console.error("Erro ao listar insumos:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar insumos.' });
        }
    });

    // PUT /api/inventory/insumos/:id - Atualizar um insumo
    router.put('/insumos/:id', async (req, res) => {
        try {
            const docRef = db.collection('insumos').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Insumo não encontrado.' });
            }
            await docRef.update({ ...req.body, updatedAt: new Date() });
            res.status(200).send({ message: 'Insumo atualizado com sucesso.' });
        } catch (error) {
            console.error("Erro ao atualizar insumo:", error);
            res.status(500).send({ message: 'Erro no servidor ao atualizar insumo.' });
        }
    });

    // DELETE /api/inventory/insumos/:id - Deletar um insumo
    router.delete('/insumos/:id', async (req, res) => {
        try {
            const docRef = db.collection('insumos').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Insumo não encontrado.' });
            }
            // Adicionar validação para não deletar se houver movimentações de estoque associadas
            await docRef.delete();
            res.status(200).send({ message: 'Insumo deletado com sucesso.' });
        } catch (error) {
            console.error("Erro ao deletar insumo:", error);
            res.status(500).send({ message: 'Erro no servidor ao deletar insumo.' });
        }
    });

    // --- ROTAS PARA MOVIMENTAÇÕES DE ESTOQUE ---

    // POST /api/inventory/movimentacoes - Registrar uma nova movimentação de estoque
    router.post('/movimentacoes', async (req, res) => {
        try {
            const { insumoId, tipoMovimentacao, quantidade, atividadeCampoId } = req.body;
            if (!insumoId || !tipoMovimentacao || !quantidade) {
                return res.status(400).send({ message: 'Campos "insumoId", "tipoMovimentacao" e "quantidade" são obrigatórios.' });
            }
            if (!['Entrada', 'Saída', 'Ajuste'].includes(tipoMovimentacao)) {
                return res.status(400).send({ message: 'O "tipoMovimentacao" deve ser "Entrada", "Saída" ou "Ajuste".' });
            }

            const movimentacaoData = {
                insumoId,
                tipoMovimentacao,
                quantidade: parseFloat(quantidade),
                atividadeCampoId: atividadeCampoId || null,
                data: new Date(),
                createdAt: new Date()
            };

            const docRef = await db.collection('movimentacoesEstoque').add(movimentacaoData);
            res.status(201).send({ id: docRef.id, ...movimentacaoData });
        } catch (error) {
            console.error("Erro ao registrar movimentação de estoque:", error);
            res.status(500).send({ message: 'Erro no servidor ao registrar movimentação.' });
        }
    });

    // GET /api/inventory/movimentacoes/:insumoId - Listar o histórico de movimentações de um insumo
    router.get('/movimentacoes/:insumoId', async (req, res) => {
        try {
            const { insumoId } = req.params;
            const snapshot = await db.collection('movimentacoesEstoque')
                .where('insumoId', '==', insumoId)
                .orderBy('data', 'desc')
                .get();

            const movimentacoes = [];
            snapshot.forEach(doc => movimentacoes.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(movimentacoes);
        } catch (error) {
            console.error("Erro ao listar movimentações:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar movimentações.' });
        }
    });

    // GET /api/inventory/estoque/:insumoId - Calcular e retornar o estoque atual de um insumo
    router.get('/estoque/:insumoId', async (req, res) => {
        try {
            const { insumoId } = req.params;
            const snapshot = await db.collection('movimentacoesEstoque')
                .where('insumoId', '==', insumoId)
                .get();

            let estoqueAtual = 0;
            snapshot.forEach(doc => {
                const mov = doc.data();
                if (mov.tipoMovimentacao === 'Entrada') {
                    estoqueAtual += mov.quantidade;
                } else if (mov.tipoMovimentacao === 'Saída') {
                    estoqueAtual -= mov.quantidade;
                } else if (mov.tipoMovimentacao === 'Ajuste') {
                    // Para ajuste, a quantidade pode ser positiva ou negativa
                    estoqueAtual += mov.quantidade;
                }
            });

            res.status(200).send({ insumoId, estoqueAtual });
        } catch (error) {
            console.error("Erro ao calcular estoque:", error);
            res.status(500).send({ message: 'Erro no servidor ao calcular estoque.' });
        }
    });

    return router;
};
