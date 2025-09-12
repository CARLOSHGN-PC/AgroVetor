const express = require('express');
const axios = require('axios');

module.exports = function(db) {
    const router = express.Router();

    // --- ROTA PARA PREVISÃO DO TEMPO ---

    // GET /api/weather/forecast?lat=...&lon=... - Busca a previsão do tempo de uma API externa
    router.get('/forecast', async (req, res) => {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).send({ message: 'Latitude (lat) e Longitude (lon) são obrigatórias.' });
        }

        // A chave de API deve ser armazenada de forma segura, como variável de ambiente
        const apiKey = process.env.OPENWEATHERMAP_API_KEY || null;
        if (!apiKey) {
            return res.status(503).send({ message: 'O serviço de previsão do tempo está desativado. Chave de API não configurada.' });
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=pt_br`;

        try {
            const response = await axios.get(url);
            const data = response.data;

            // Simplificando a resposta para o frontend
            const simplifiedForecast = {
                cidade: data.name,
                temperatura: data.main.temp,
                sensacao_termica: data.main.feels_like,
                temp_min: data.main.temp_min,
                temp_max: data.main.temp_max,
                umidade: data.main.humidity,
                descricao: data.weather[0].description,
                icone: `http://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`
            };

            res.status(200).send(simplifiedForecast);
        } catch (error) {
            console.error("Erro ao buscar previsão do tempo:", error.response ? error.response.data : error.message);
            res.status(502).send({ message: 'Erro ao comunicar com o serviço de previsão do tempo.' });
        }
    });

    // --- ROTAS PARA DADOS HISTÓRICOS DE CLIMA ---

    // POST /api/weather/history - Salva um registro histórico de clima
    router.post('/history', async (req, res) => {
        try {
            const { fazendaId, latitude, longitude, data, temperatura_c, umidade_percent, precipitacao_mm } = req.body;
            if (!fazendaId || !data || temperatura_c === undefined) {
                 return res.status(400).send({ message: 'Campos "fazendaId", "data" e "temperatura_c" são obrigatórios.' });
            }

            const climaData = {
                fazendaId,
                location: new db.GeoPoint(parseFloat(latitude || 0), parseFloat(longitude || 0)),
                data: new Date(data),
                temperatura_c: parseFloat(temperatura_c),
                umidade_percent: parseFloat(umidade_percent || 0),
                precipitacao_mm: parseFloat(precipitacao_mm || 0),
                createdAt: new Date()
            };

            const docRef = await db.collection('dadosClimaticos').add(climaData);
            res.status(201).send({ id: docRef.id, ...climaData });

        } catch (error) {
            console.error("Erro ao salvar histórico de clima:", error);
            res.status(500).send({ message: 'Erro no servidor ao salvar histórico de clima.' });
        }
    });

    // GET /api/weather/history/:fazendaId - Lista o histórico de clima de uma fazenda
    router.get('/history/:fazendaId', async (req, res) => {
        try {
            const { fazendaId } = req.params;
            const { startDate, endDate } = req.query;

            let query = db.collection('dadosClimaticos').where('fazendaId', '==', fazendaId);

            if (startDate) query = query.where('data', '>=', new Date(startDate));
            if (endDate) query = query.where('data', '<=', new Date(endDate));

            const snapshot = await query.orderBy('data', 'desc').get();
            const historico = [];
            snapshot.forEach(doc => historico.push({ id: doc.id, ...doc.data() }));
            res.status(200).send(historico);
        } catch (error) {
            console.error("Erro ao listar histórico de clima:", error);
            res.status(500).send({ message: 'Erro no servidor ao listar histórico de clima.' });
        }
    });

    return router;
};
