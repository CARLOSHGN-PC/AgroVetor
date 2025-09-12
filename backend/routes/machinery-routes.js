const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTAS PARA MAQUINÁRIO ---

    // POST /api/machinery/maquinarios - Cadastrar uma nova máquina
    router.post('/maquinarios', async (req, res) => {
        try {
            const { nome, marca, modelo, tipo, status, custo_hora } = req.body;
            if (!nome || !tipo) {
                return res.status(400).send({ message: 'Campos "nome" e "tipo" são obrigatórios.' });
            }

            const maquinarioData = {
                nome,
                marca: marca || null,
                modelo: modelo || null,
                tipo, // 'Trator', 'Colheitadeira', 'Implemento'
                status: status || 'Operacional', // 'Operacional', 'Em Manutenção', 'Inativo'
                hodometro: parseFloat(req.body.hodometro || 0),
                custo_hora: parseFloat(custo_hora || 0), // Adicionando custo por hora
                createdAt: new Date()
            };

            const docRef = await db.collection('maquinarios').add(maquinarioData);
            res.status(201).send({ id: docRef.id, ...maquinarioData });
        } catch (error) {
            console.error("Erro ao cadastrar maquinário:", error);
            res.status(500).send({ message: 'Erro no servidor ao cadastrar maquinário.' });
        }
    });

    // GET /api/machinery/maquinarios - Listar todo o maquinário
    router.get('/maquinarios', async (req, res) => {
        try {
            const snapshot = await db.collection('maquinarios').orderBy('nome').get();
            const maquinarios = [];
            snapshot.forEach(doc => maquinarios.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(maquinarios);
        } catch (error) {
            console.error("Erro ao listar maquinário:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar maquinário.' });
        }
    });

    // PUT /api/machinery/maquinarios/:id - Atualizar um maquinário
    router.put('/maquinarios/:id', async (req, res) => {
        try {
            const docRef = db.collection('maquinarios').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Maquinário não encontrado.' });
            }
            await docRef.update({ ...req.body, updatedAt: new Date() });
            res.status(200).send({ message: 'Maquinário atualizado com sucesso.' });
        } catch (error) {
            console.error("Erro ao atualizar maquinário:", error);
            res.status(500).send({ message: 'Erro no servidor ao atualizar maquinário.' });
        }
    });

    // --- ROTAS PARA MANUTENÇÕES ---

    // POST /api/machinery/manutencoes - Registrar uma nova manutenção
    router.post('/manutencoes', async (req, res) => {
        try {
            const { maquinarioId, tipoManutencao, data, descricaoServico } = req.body;
            if (!maquinarioId || !tipoManutencao || !data || !descricaoServico) {
                return res.status(400).send({ message: 'Campos "maquinarioId", "tipoManutencao", "data" e "descricaoServico" são obrigatórios.' });
            }

            const manutencaoData = {
                maquinarioId,
                tipoManutencao, // 'Preventiva', 'Corretiva'
                data: new Date(data),
                descricaoServico,
                custo: parseFloat(req.body.custo || 0),
                hodometro: parseFloat(req.body.hodometro || 0),
                createdAt: new Date()
            };

            const docRef = await db.collection('manutencoes').add(manutencaoData);
            res.status(201).send({ id: docRef.id, ...manutencaoData });
        } catch (error) {
            console.error("Erro ao registrar manutenção:", error);
            res.status(500).send({ message: 'Erro no servidor ao registrar manutenção.' });
        }
    });

    // GET /api/machinery/manutencoes/:maquinarioId - Listar manutenções de uma máquina
    router.get('/manutencoes/:maquinarioId', async (req, res) => {
        try {
            const { maquinarioId } = req.params;
            const snapshot = await db.collection('manutencoes')
                .where('maquinarioId', '==', maquinarioId)
                .orderBy('data', 'desc')
                .get();

            const manutencoes = [];
            snapshot.forEach(doc => manutencoes.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(manutencoes);
        } catch (error) {
            console.error("Erro ao listar manutenções:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar manutenções.' });
        }
    });


    // --- ROTAS PARA ABASTECIMENTOS ---

    // POST /api/machinery/abastecimentos - Registrar um novo abastecimento
    router.post('/abastecimentos', async (req, res) => {
        try {
            const { maquinarioId, data, litros } = req.body;
            if (!maquinarioId || !data || !litros) {
                return res.status(400).send({ message: 'Campos "maquinarioId", "data" e "litros" são obrigatórios.' });
            }

            const abastecimentoData = {
                maquinarioId,
                data: new Date(data),
                litros: parseFloat(litros),
                custoTotal: parseFloat(req.body.custoTotal || 0),
                hodometro: parseFloat(req.body.hodometro || 0),
                createdAt: new Date()
            };

            const docRef = await db.collection('abastecimentos').add(abastecimentoData);
            res.status(201).send({ id: docRef.id, ...abastecimentoData });
        } catch (error) {
            console.error("Erro ao registrar abastecimento:", error);
            res.status(500).send({ message: 'Erro no servidor ao registrar abastecimento.' });
        }
    });

    // GET /api/machinery/abastecimentos/:maquinarioId - Listar abastecimentos de uma máquina
    router.get('/abastecimentos/:maquinarioId', async (req, res) => {
        try {
            const { maquinarioId } = req.params;
            const snapshot = await db.collection('abastecimentos')
                .where('maquinarioId', '==', maquinarioId)
                .orderBy('data', 'desc')
                .get();

            const abastecimentos = [];
            snapshot.forEach(doc => abastecimentos.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(abastecimentos);
        } catch (error) {
            console.error("Erro ao listar abastecimentos:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar abastecimentos.' });
        }
    });

    return router;
};
