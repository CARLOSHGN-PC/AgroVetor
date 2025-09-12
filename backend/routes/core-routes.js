const express = require('express');

// Esta função irá configurar e retornar o roteador com as dependências (como o 'db')
module.exports = function(db) {
    const router = express.Router();

    // --- ROTAS PARA FAZENDAS ---

    // POST /api/core/fazendas - Criar uma nova fazenda
    router.post('/fazendas', async (req, res) => {
        try {
            const { nome, cnpj_cpf, endereco, cidade, estado, area_total_ha } = req.body;
            if (!nome || !area_total_ha) {
                return res.status(400).send({ message: 'Os campos "nome" e "area_total_ha" são obrigatórios.' });
            }

            const fazendaData = {
                nome,
                cnpj_cpf: cnpj_cpf || null,
                endereco: endereco || null,
                cidade: cidade || null,
                estado: estado || null,
                area_total_ha: parseFloat(area_total_ha),
                createdAt: new Date(),
            };

            const docRef = await db.collection('fazendas').add(fazendaData);
            res.status(201).send({ id: docRef.id, ...fazendaData });
        } catch (error) {
            console.error("Erro ao criar fazenda:", error);
            res.status(500).send({ message: 'Erro no servidor ao criar fazenda.' });
        }
    });

    // GET /api/core/fazendas - Listar todas as fazendas
    router.get('/fazendas', async (req, res) => {
        try {
            const snapshot = await db.collection('fazendas').orderBy('nome').get();
            if (snapshot.empty) {
                return res.status(200).send([]);
            }
            const fazendas = [];
            snapshot.forEach(doc => {
                fazendas.push({ id: doc.id, ...doc.data() });
            });
            res.status(200).send(fazendas);
        } catch (error) {
            console.error("Erro ao listar fazendas:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar fazendas.' });
        }
    });

    // GET /api/core/fazendas/:id - Obter uma fazenda específica
    router.get('/fazendas/:id', async (req, res) => {
        try {
            const docRef = db.collection('fazendas').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Fazenda não encontrada.' });
            }

            res.status(200).send({ id: doc.id, ...doc.data() });
        } catch (error) {
            console.error("Erro ao obter fazenda:", error);
            res.status(500).send({ message: 'Erro no servidor ao obter fazenda.' });
        }
    });

    // PUT /api/core/fazendas/:id - Atualizar uma fazenda
    router.put('/fazendas/:id', async (req, res) => {
        try {
            const docRef = db.collection('fazendas').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Fazenda não encontrada para atualização.' });
            }

            // Pega apenas os campos enviados no body para não sobrescrever com 'undefined'
            const updateData = { ...req.body, updatedAt: new Date() };

            await docRef.update(updateData);
            res.status(200).send({ message: 'Fazenda atualizada com sucesso.', id: req.params.id });
        } catch (error) {
            console.error("Erro ao atualizar fazenda:", error);
            res.status(500).send({ message: 'Erro no servidor ao atualizar fazenda.' });
        }
    });

    // DELETE /api/core/fazendas/:id - Deletar uma fazenda
    router.delete('/fazendas/:id', async (req, res) => {
        try {
            const docRef = db.collection('fazendas').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Fazenda não encontrada para exclusão.' });
            }

            // Adicionar lógica para verificar se existem talhões associados antes de deletar
            // (a ser implementado)

            await docRef.delete();
            res.status(200).send({ message: 'Fazenda deletada com sucesso.' });
        } catch (error) {
            console.error("Erro ao deletar fazenda:", error);
            res.status(500).send({ message: 'Erro no servidor ao deletar fazenda.' });
        }
    });

    // --- ROTAS PARA TALHÕES ---

    // POST /api/core/talhoes - Criar um novo talhão
    router.post('/talhoes', async (req, res) => {
        try {
            const { nome_identificador, area_ha, fazendaId, geometria } = req.body;
            if (!nome_identificador || !area_ha || !fazendaId) {
                return res.status(400).send({ message: 'Campos "nome_identificador", "area_ha" e "fazendaId" são obrigatórios.' });
            }

            // Validar se a fazenda existe
            const fazendaDoc = await db.collection('fazendas').doc(fazendaId).get();
            if (!fazendaDoc.exists) {
                return res.status(404).send({ message: 'A fazenda especificada não foi encontrada.' });
            }

            const talhaoData = {
                fazendaId,
                nome_identificador,
                area_ha: parseFloat(area_ha),
                geometria: geometria || null, // GeoJSON
                createdAt: new Date(),
            };

            const docRef = await db.collection('talhoes').add(talhaoData);
            res.status(201).send({ id: docRef.id, ...talhaoData });
        } catch (error) {
            console.error("Erro ao criar talhão:", error);
            res.status(500).send({ message: 'Erro no servidor ao criar talhão.' });
        }
    });

    // GET /api/core/talhoes/fazenda/:fazendaId - Listar todos os talhões de uma fazenda
    router.get('/talhoes/fazenda/:fazendaId', async (req, res) => {
        try {
            const { fazendaId } = req.params;
            const snapshot = await db.collection('talhoes').where('fazendaId', '==', fazendaId).orderBy('nome_identificador').get();

            if (snapshot.empty) {
                return res.status(200).send([]);
            }

            const talhoes = [];
            snapshot.forEach(doc => {
                talhoes.push({ id: doc.id, ...doc.data() });
            });
            res.status(200).send(talhoes);
        } catch (error) {
            console.error("Erro ao listar talhões:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar talhões.' });
        }
    });

    // GET /api/core/talhoes/:id - Obter um talhão específico
    router.get('/talhoes/:id', async (req, res) => {
        try {
            const docRef = db.collection('talhoes').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Talhão não encontrado.' });
            }

            res.status(200).send({ id: doc.id, ...doc.data() });
        } catch (error) {
            console.error("Erro ao obter talhão:", error);
            res.status(500).send({ message: 'Erro no servidor ao obter talhão.' });
        }
    });

    // PUT /api/core/talhoes/:id - Atualizar um talhão
    router.put('/talhoes/:id', async (req, res) => {
        try {
            const docRef = db.collection('talhoes').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Talhão não encontrado para atualização.' });
            }

            const updateData = { ...req.body, updatedAt: new Date() };
            await docRef.update(updateData);
            res.status(200).send({ message: 'Talhão atualizado com sucesso.', id: req.params.id });
        } catch (error) {
            console.error("Erro ao atualizar talhão:", error);
            res.status(500).send({ message: 'Erro no servidor ao atualizar talhão.' });
        }
    });

    // DELETE /api/core/talhoes/:id - Deletar um talhão
    router.delete('/talhoes/:id', async (req, res) => {
        try {
            const docRef = db.collection('talhoes').doc(req.params.id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).send({ message: 'Talhão não encontrado para exclusão.' });
            }

            await docRef.delete();
            res.status(200).send({ message: 'Talhão deletado com sucesso.' });
        } catch (error) {
            console.error("Erro ao deletar talhão:", error);
            res.status(500).send({ message: 'Erro no servidor ao deletar talhão.' });
        }
    });

    // --- ROTAS PARA CULTURAS ---

    // POST /api/core/culturas
    router.post('/culturas', async (req, res) => {
        try {
            const { nome_popular, nome_cientifico, variedades } = req.body;
            if (!nome_popular) {
                return res.status(400).send({ message: 'O campo "nome_popular" é obrigatório.' });
            }
            const culturaData = {
                nome_popular,
                nome_cientifico: nome_cientifico || null,
                variedades: variedades || [],
                createdAt: new Date(),
            };
            const docRef = await db.collection('culturas').add(culturaData);
            res.status(201).send({ id: docRef.id, ...culturaData });
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao criar cultura.' });
        }
    });

    // GET /api/core/culturas
    router.get('/culturas', async (req, res) => {
        try {
            const snapshot = await db.collection('culturas').orderBy('nome_popular').get();
            const culturas = [];
            snapshot.forEach(doc => culturas.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(culturas);
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao listar culturas.' });
        }
    });

    // PUT /api/core/culturas/:id
    router.put('/culturas/:id', async (req, res) => {
        try {
            const docRef = db.collection('culturas').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Cultura não encontrada.' });
            }
            await docRef.update({ ...req.body, updatedAt: new Date() });
            res.status(200).send({ message: 'Cultura atualizada com sucesso.' });
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao atualizar cultura.' });
        }
    });

    // DELETE /api/core/culturas/:id
    router.delete('/culturas/:id', async (req, res) => {
        try {
            const docRef = db.collection('culturas').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Cultura não encontrada.' });
            }
            await docRef.delete();
            res.status(200).send({ message: 'Cultura deletada com sucesso.' });
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao deletar cultura.' });
        }
    });


    // --- ROTAS PARA SAFRAS ---

    // POST /api/core/safras
    router.post('/safras', async (req, res) => {
        try {
            const { nome, data_inicio, data_fim } = req.body;
            if (!nome || !data_inicio || !data_fim) {
                return res.status(400).send({ message: 'Campos "nome", "data_inicio" e "data_fim" são obrigatórios.' });
            }
            const safraData = {
                nome,
                data_inicio: new Date(data_inicio),
                data_fim: new Date(data_fim),
                createdAt: new Date(),
            };
            const docRef = await db.collection('safras').add(safraData);
            res.status(201).send({ id: docRef.id, ...safraData });
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao criar safra.' });
        }
    });

    // GET /api/core/safras
    router.get('/safras', async (req, res) => {
        try {
            const snapshot = await db.collection('safras').orderBy('data_inicio', 'desc').get();
            const safras = [];
            snapshot.forEach(doc => safras.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(safras);
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao listar safras.' });
        }
    });

    // PUT /api/core/safras/:id
    router.put('/safras/:id', async (req, res) => {
        try {
            const docRef = db.collection('safras').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Safra não encontrada.' });
            }
            await docRef.update({ ...req.body, updatedAt: new Date() });
            res.status(200).send({ message: 'Safra atualizada com sucesso.' });
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao atualizar safra.' });
        }
    });

    // DELETE /api/core/safras/:id
    router.delete('/safras/:id', async (req, res) => {
        try {
            const docRef = db.collection('safras').doc(req.params.id);
            if (!(await docRef.get()).exists) {
                return res.status(404).send({ message: 'Safra não encontrada.' });
            }
            await docRef.delete();
            res.status(200).send({ message: 'Safra deletada com sucesso.' });
        } catch (error) {
            res.status(500).send({ message: 'Erro no servidor ao deletar safra.' });
        }
    });

    return router;
};
