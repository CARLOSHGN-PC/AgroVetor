const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTAS PARA CADASTRO DE SENSORES ---

    // POST /api/iot/sensores - Cadastrar um novo sensor
    router.post('/sensores', async (req, res) => {
        try {
            const { tipo, modelo, talhaoId } = req.body;
            if (!tipo || !modelo) {
                return res.status(400).send({ message: 'Campos "tipo" e "modelo" são obrigatórios.' });
            }
            const sensorData = {
                tipo,
                modelo,
                talhaoId: talhaoId || null,
                status: 'Inativo', // Começa como inativo até a primeira leitura
                last_seen: null,
                createdAt: new Date()
            };
            const docRef = await db.collection('sensores').add(sensorData);
            res.status(201).send({ id: docRef.id, ...sensorData });
        } catch (error) {
            res.status(500).send({ message: 'Erro ao cadastrar sensor.' });
        }
    });

    // GET /api/iot/sensores - Listar sensores
    router.get('/sensores', async (req, res) => {
        try {
            const snapshot = await db.collection('sensores').get();
            const sensores = [];
            snapshot.forEach(doc => sensores.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(sensores);
        } catch (error) {
            res.status(500).send({ message: 'Erro ao listar sensores.' });
        }
    });

    // --- ROTAS PARA LEITURAS DE SENSORES (INGESTÃO) ---

    // POST /api/iot/readings - Endpoint para receber dados dos sensores
    router.post('/readings', async (req, res) => {
        try {
            const { sensorId, leituras } = req.body;
            if (!sensorId || !Array.isArray(leituras) || leituras.length === 0) {
                return res.status(400).send({ message: 'Campos "sensorId" e "leituras" (array) são obrigatórios.'});
            }

            const sensorRef = db.collection('sensores').doc(sensorId);
            const sensorDoc = await sensorRef.get();
            if (!sensorDoc.exists) {
                return res.status(404).send({ message: 'Sensor não cadastrado.' });
            }

            const batch = db.batch();
            const timestamp = new Date();

            leituras.forEach(leitura => {
                const { tipoLeitura, valor } = leitura;
                if (tipoLeitura && valor !== undefined) {
                    const leituraRef = db.collection('leiturasSensor').doc(); // Novo doc para cada leitura
                    batch.set(leituraRef, {
                        sensorId,
                        timestamp,
                        tipoLeitura,
                        valor: parseFloat(valor)
                    });
                }
            });

            // Atualiza o status e o last_seen do sensor
            batch.update(sensorRef, { status: 'Ativo', last_seen: timestamp });

            await batch.commit();
            res.status(202).send({ message: 'Leituras recebidas com sucesso.' });

        } catch (error) {
            console.error("Erro na ingestão de leitura de sensor:", error);
            res.status(500).send({ message: 'Erro no servidor ao processar leituras.' });
        }
    });

    // GET /api/iot/readings/:sensorId - Listar leituras de um sensor
    router.get('/readings/:sensorId', async (req, res) => {
        try {
            const { sensorId } = req.params;
            const { startDate, endDate } = req.query;

            let query = db.collection('leiturasSensor').where('sensorId', '==', sensorId);
            if (startDate) query = query.where('timestamp', '>=', new Date(startDate));
            if (endDate) query = query.where('timestamp', '<=', new Date(endDate));

            const snapshot = await query.orderBy('timestamp', 'desc').get();
            const leituras = [];
            snapshot.forEach(doc => leituras.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(leituras);
        } catch (error) {
            res.status(500).send({ message: 'Erro ao listar leituras de sensor.' });
        }
    });

    return router;
};
