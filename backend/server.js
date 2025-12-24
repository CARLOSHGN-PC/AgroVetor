// server.js - Backend com Geração de PDF e Upload de Shapefile

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const axios = require('axios');
const shp = require('shpjs');
const pointInPolygon = require('point-in-polygon');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const csv = require('csv-parser');
const { Readable } = require('stream');
const xlsx = require('xlsx');

// Import utilities
const { formatNumber } = require('./utils/pdfGenerator');
const { getFilteredData } = require('./utils/dataUtils');

// Import new report modules
const { generatePlantioFazendaPdf, generatePlantioTalhaoPdf, getPlantioData } = require('./reports/plantioReport');
const { generateClimaPdf, getClimaData } = require('./reports/climaReport');
const { generateBrocaPdf } = require('./reports/brocaReport');
const { generatePerdaPdf } = require('./reports/perdaReport');
const { generateCigarrinhaPdf, generateCigarrinhaAmostragemPdf } = require('./reports/cigarrinhaReport');
const { generateMonitoramentoPdf, generateArmadilhasPdf, generateArmadilhasAtivasPdf } = require('./reports/monitoramentoReport');
const { generateColheitaPdf, generateColheitaMensalPdf } = require('./reports/colheitaReport');
const { generateOsPdf } = require('./reports/osReport');
const { generateRiskViewPdf, getRiskViewData } = require('./reports/riskViewReport');

const app = express();
const port = process.env.PORT || 3001;

const corsOptions = {
    origin: 'https://agrovetor.store',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

let db, bucket;
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token de autenticação não fornecido ou inválido.' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        if (process.env.MOCK_FIREBASE === 'true') {
             if (token === 'valid-mock-token') {
                 req.user = { uid: 'mock-user', email: 'mock@test.com' };
                 next();
                 return;
             }
             throw new Error('Mock token validation failed');
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;

        const requestCompanyId = req.body.companyId || req.query.companyId;

        if (requestCompanyId) {
            const userSnapshot = await db.collection('users').doc(req.user.uid).get();
            if (userSnapshot.exists) {
                const userData = userSnapshot.data();

                if (userData.role !== 'super-admin' && userData.companyId !== requestCompanyId) {
                    return res.status(403).json({ message: 'Acesso negado: você não tem permissão para acessar os dados desta empresa.' });
                }

                req.userData = userData;
            } else {
                    return res.status(403).json({ message: 'Usuário não encontrado no banco de dados.' });
            }
        }

        next();
    } catch (error) {
        console.error('Erro na verificação do token:', error);
        return res.status(403).json({ message: 'Falha na autenticação: Token inválido ou expirado.' });
    }
};

try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON === '{}') {
        console.warn("AVISO: Variável FIREBASE_SERVICE_ACCOUNT_JSON ausente ou vazia. Inicializando em modo MOCK para testes.");
        process.env.MOCK_FIREBASE = 'true';

        db = {
            collection: () => ({
                doc: () => ({
                    get: async () => ({ exists: false }),
                    set: async () => {},
                    update: async () => {},
                }),
                where: () => ({
                    where: () => ({
                         get: async () => ({ empty: true, forEach: () => {} }),
                         limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
                    }),
                    get: async () => ({ empty: true, forEach: () => {} }),
                    limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
                }),
                add: async () => ({ id: 'mock-id' }),
            }),
            runTransaction: async (cb) => cb({ get: async () => ({ exists: false, data: () => ({ count: 0 }) }), set: () => {}, update: () => {} }),
            batch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} })
        };
        bucket = {
            file: () => ({
                save: async () => {},
                makePublic: async () => {},
                publicUrl: () => 'http://mock-url.com/file.zip'
            })
        };
    } else {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "agrovetor-v2.firebasestorage.app"
        });
        db = admin.firestore();
        bucket = admin.storage().bucket();
        console.log('Firebase Admin SDK inicializado com sucesso.');
    }

    const geminiApiKey = "";
    let model;
    if (!geminiApiKey) {
        console.warn("A funcionalidade de IA está desativada. Nenhuma chave de API foi fornecida.");
    } else {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
        console.log('Gemini AI Model inicializado com sucesso.');
    }

    app.get('/', (req, res) => {
        res.status(200).send('Servidor de relatórios AgroVetor está online e conectado ao Firebase!');
    });

    // ROTA PARA UPLOAD DO LOGO
    app.post('/upload-logo', authMiddleware, async (req, res) => {
        const { logoBase64, companyId } = req.body;
        if (!logoBase64) {
            return res.status(400).send({ message: 'Nenhum dado de imagem Base64 enviado.' });
        }
        if (!companyId) {
            return res.status(400).send({ message: 'O ID da empresa é obrigatório.' });
        }
        try {
            await db.collection('config').doc(companyId).set({ logoBase64: logoBase64 }, { merge: true });
            res.status(200).send({ message: 'Logo carregado com sucesso!' });
        } catch (error) {
            console.error("Erro ao salvar logo Base64 no Firestore:", error);
            res.status(500).send({ message: `Erro no servidor ao carregar logo: ${error.message}` });
        }
    });
 
    // ROTA PARA UPLOAD DO SHAPEFILE
    app.post('/upload-shapefile', authMiddleware, async (req, res) => {
        const { fileBase64, companyId } = req.body;
        if (!fileBase64) {
            return res.status(400).send({ message: 'Nenhum dado de arquivo Base64 foi enviado.' });
        }
        if (!companyId) {
            return res.status(400).send({ message: 'O ID da empresa é obrigatório.' });
        }

        try {
            const buffer = Buffer.from(fileBase64, 'base64');
            const filePath = `shapefiles/${companyId}/talhoes.zip`;
            const file = bucket.file(filePath);

            await file.save(buffer, {
                metadata: {
                    contentType: 'application/zip',
                },
            });
            
            await file.makePublic();
            const downloadURL = file.publicUrl();

            await db.collection('config').doc(companyId).set({
                shapefileURL: downloadURL,
                lastUpdated: new Date()
            }, { merge: true });

            res.status(200).send({ message: 'Shapefile enviado com sucesso!', url: downloadURL });

        } catch (error) {
            console.error("Erro no servidor ao fazer upload do shapefile:", error);
            res.status(500).send({ message: `Erro no servidor ao processar o arquivo: ${error.message}` });
        }
    });

    // ROTA PARA INGESTÃO DE RELATÓRIO HISTÓRICO (SEM IA)
    app.post('/api/upload/historical-report', authMiddleware, async (req, res) => {
        const { reportData: originalReportData, companyId } = req.body;
        if (!originalReportData) {
            return res.status(400).json({ message: 'Nenhum dado de relatório foi enviado.' });
        }
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
        }

        try {
            let reportText;

            if (originalReportData.startsWith('data:')) {
                const base64Data = originalReportData.split(';base64,')[1] || '';
                const buffer = Buffer.from(base64Data, 'base64');

                if (buffer && buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
                    const workbook = xlsx.read(buffer, { type: 'buffer' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const dataAsJson = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                    reportText = dataAsJson.map(row => row.join(';')).join('\n');
                } else {
                    reportText = buffer.toString('utf8');
                }
            } else {
                reportText = originalReportData;
            }

            const records = [];
            const stream = Readable.from(reportText);

            stream.pipe(csv({
                separator: ';',
                mapHeaders: ({ header }) => header.trim().toLowerCase()
            }))
            .on('data', (data) => records.push(data))
            .on('end', async () => {
                if (records.length === 0) {
                    return res.status(400).json({ message: "O relatório parece estar vazio ou em um formato incorreto." });
                }

                const requiredHeaders = ['codigofazenda', 'toneladas', 'atr'];
                const firstRecordHeaders = Object.keys(records[0]);
                const missingHeaders = requiredHeaders.filter(h => !firstRecordHeaders.includes(h));

                if (missingHeaders.length > 0) {
                    return res.status(400).json({ message: `Cabeçalhos em falta no seu relatório. É necessário ter as colunas: ${missingHeaders.join(', ')}` });
                }

                const batchSize = 400;
                for (let i = 0; i < records.length; i += batchSize) {
                    const batch = db.batch();
                    const chunk = records.slice(i, i + batchSize);

                    chunk.forEach(record => {
                        const finalRecord = {
                            codigoFazenda: String(record.codigofazenda || '').trim(),
                            toneladas: parseFloat(String(record.toneladas || '0').replace(',', '.')) || 0,
                            atrRealizado: parseFloat(String(record.atr || '0').replace(',', '.')) || 0,
                            importedAt: new Date(),
                            companyId: companyId
                        };

                        if (finalRecord.codigoFazenda && finalRecord.toneladas > 0 && finalRecord.atrRealizado > 0) {
                             const docRef = db.collection('historicalHarvests').doc();
                             batch.set(docRef, finalRecord);
                        }
                    });
                    await batch.commit();
                }
                res.status(200).json({ message: `${records.length} registros históricos importados com sucesso!` });
            });

        } catch (error) {
            console.error("Erro na ingestão de relatório histórico:", error);
            res.status(500).json({ message: 'Erro no servidor ao processar o relatório.' });
        }
    });

    // --- ROTA DE GERAÇÃO DA IA (GEMINI) ---
    app.post('/api/gemini/generate', authMiddleware, async (req, res) => {
        if (!model) {
            return res.status(503).json({ message: "Esta funcionalidade de IA está temporariamente desativada." });
        }
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ message: 'O prompt é obrigatório.' });
        }

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();

            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonResponse = JSON.parse(text);
            res.status(200).json(jsonResponse);

        } catch (error) {
            console.error("Erro ao chamar a API do Gemini:", error);
            res.status(500).json({ message: 'Erro ao comunicar com a IA.' });
        }
    });

    // ROTA PARA CÁLCULO DE ATR PONDERADO
    app.post('/api/calculate-atr', authMiddleware, async (req, res) => {
        const { codigoFazenda, companyId } = req.body;
        if (!codigoFazenda) {
            return res.status(400).json({ message: 'O código da fazenda é obrigatório.' });
        }
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
        }

        try {
            const farmCodeStr = String(codigoFazenda || '').trim();
            const historyQuery = await db.collection('historicalHarvests')
                .where('companyId', '==', companyId)
                .where('codigoFazenda', '==', farmCodeStr)
                .get();

            if (historyQuery.empty) {
                return res.status(200).json({ predicted_atr: 0, message: "Sem histórico para esta fazenda." });
            }

            const historicalData = [];
            historyQuery.forEach(doc => historicalData.push(doc.data()));

            const { totalAtrPonderado, totalToneladas } = historicalData.reduce((acc, data) => {
                const atr = parseFloat(String(data.atrRealizado).replace(',', '.')) || 0;
                const toneladas = parseFloat(String(data.toneladas).replace(',', '.')) || 0;

                if (atr > 0 && toneladas > 0) {
                    acc.totalAtrPonderado += atr * toneladas;
                    acc.totalToneladas += toneladas;
                }
                return acc;
            }, { totalAtrPonderado: 0, totalToneladas: 0 });

            const predicted_atr = totalToneladas > 0 ? totalAtrPonderado / totalToneladas : 0;

            return res.status(200).json({ predicted_atr });

        } catch (e) {
            console.error("Erro ao calcular ATR ponderado no backend:", e);
            res.status(500).json({ message: 'Erro no servidor ao calcular o ATR.' });
        }
    });

    async function deleteCollection(db, collectionPath, batchSize) {
        const collectionRef = db.collection(collectionPath);
        const query = collectionRef.orderBy('__name__').limit(batchSize);

        return new Promise((resolve, reject) => {
            deleteQueryBatch(db, query, resolve, reject);
        });
    }

    async function deleteQueryBatch(db, query, resolve, reject) {
        try {
            const snapshot = await query.get();

            const batchSize = snapshot.size;
            if (batchSize === 0) {
                resolve();
                return;
            }

            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            process.nextTick(() => {
                deleteQueryBatch(db, query, resolve, reject);
            });
        } catch(err) {
            reject(err);
        }
    }

    app.post('/api/delete/historical-data', authMiddleware, async (req, res) => {
        const { companyId } = req.body;
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
        }
        try {
            console.log(`Iniciando a exclusão do histórico para a empresa: ${companyId}`);
            const collectionRef = db.collection('historicalHarvests');
            const query = collectionRef.where('companyId', '==', companyId).limit(400);

            await new Promise((resolve, reject) => {
                deleteQueryBatch(db, query, resolve, reject);
            });

            console.log(`Histórico da empresa ${companyId} excluído com sucesso.`);
            res.status(200).json({ message: 'Todos os dados do histórico da IA para esta empresa foram excluídos com sucesso.' });
        } catch (error) {
            console.error(`Erro ao excluir o histórico da IA para a empresa ${companyId}:`, error);
            res.status(500).json({ message: 'Ocorreu um erro no servidor ao tentar excluir o histórico.' });
        }
    });

    app.post('/api/track', authMiddleware, async (req, res) => {
        const { userId, latitude, longitude, companyId } = req.body;

        if (!userId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: 'userId, latitude e longitude são obrigatórios.' });
        }
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório para rastreamento.' });
        }

        try {
            await db.collection('locationHistory').add({
                userId: userId,
                companyId: companyId,
                location: new admin.firestore.GeoPoint(parseFloat(latitude), parseFloat(longitude)),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            res.status(200).send({ message: 'Localização registrada com sucesso.' });
        } catch (error) {
            console.error("Erro ao registrar localização:", error);
            res.status(500).json({ message: 'Erro no servidor ao registrar localização.' });
        }
    });

    app.post('/api/track/batch', authMiddleware, async (req, res) => {
        const locations = req.body;

        if (!Array.isArray(locations) || locations.length === 0) {
            return res.status(400).json({ message: 'O corpo da requisição deve ser um array de localizações não vazio.' });
        }

        try {
            const batch = db.batch();
            let validLocations = 0;

            for (const loc of locations) {
                const { userId, latitude, longitude, timestamp, companyId } = loc;

                if (userId && latitude !== undefined && longitude !== undefined && timestamp && companyId) {
                    const docRef = db.collection('locationHistory').doc();
                    batch.set(docRef, {
                        userId: userId,
                        companyId: companyId,
                        location: new admin.firestore.GeoPoint(parseFloat(latitude), parseFloat(longitude)),
                        timestamp: new Date(timestamp)
                    });
                    validLocations++;
                }
            }

            if (validLocations === 0) {
                return res.status(400).json({ message: 'Nenhuma localização válida fornecida no lote.' });
            }

            await batch.commit();
            res.status(200).send({ message: `${validLocations} localizações registradas com sucesso.` });
        } catch (error) {
            console.error("Erro ao registrar localizações em lote:", error);
            res.status(500).json({ message: 'Erro no servidor ao registrar localizações em lote.' });
        }
    });

    app.get('/api/history', authMiddleware, async (req, res) => {
        const { userId, startDate, endDate, companyId } = req.query;

        if (!userId || !startDate || !endDate) {
            return res.status(400).json({ message: 'userId, startDate e endDate são obrigatórios.' });
        }
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
        }

        try {
            const query = db.collection('locationHistory')
                .where('companyId', '==', companyId)
                .where('userId', '==', userId)
                .where('timestamp', '>=', new Date(startDate + 'T00:00:00Z'))
                .where('timestamp', '<=', new Date(endDate + 'T23:59:59Z'));

            const snapshot = await query.get();

            if (snapshot.empty) {
                return res.status(200).json([]);
            }

            const history = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                history.push({
                    id: doc.id,
                    latitude: data.location.latitude,
                    longitude: data.location.longitude,
                timestamp: data.timestamp.toDate()
                });
            });

            history.sort((a, b) => a.timestamp - b.timestamp);

            res.status(200).json(history);
        } catch (error) {
            console.error("Erro ao buscar histórico de localização:", error);
            res.status(500).json({ message: 'Erro no servidor ao buscar histórico.' });
        }
    });

    // --- REPORT ROUTES ---

    app.get('/reports/plantio/fazenda/pdf', authMiddleware, (req, res) => generatePlantioFazendaPdf(req, res, db));

    app.get('/reports/plantio/fazenda/csv', authMiddleware, async (req, res) => {
        try {
            const filters = req.query;
            const data = await getPlantioData(db, filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `plantio_fazenda_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'farmName', title: 'Fazenda' },
                    { id: 'date', title: 'Data' },
                    { id: 'provider', title: 'Prestador' },
                    { id: 'leaderId', title: 'Matrícula do Líder' },
                    { id: 'variedade', title: 'Variedade Plantada' },
                    { id: 'talhao', title: 'Talhão' },
                    { id: 'area', title: 'Área Plant. (ha)' },
                    { id: 'chuva', title: 'Chuva (mm)' },
                    { id: 'obs', title: 'Observações' }
                ]
            });

            const records = [];
            data.forEach(item => {
                item.records.forEach(record => {
                    records.push({ ...item, ...record, farmName: `${item.farmCode} - ${item.farmName}` });
                });
            });

            records.sort((a, b) => {
                const farmA = parseInt(a.farmCode) || 0;
                const farmB = parseInt(b.farmCode) || 0;
                if (farmA !== farmB) return farmA - farmB;
                return new Date(a.date) - new Date(b.date);
            });

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Plantio por Fazenda:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/clima/pdf', authMiddleware, (req, res) => generateClimaPdf(req, res, db));

    app.get('/reports/clima/csv', authMiddleware, async (req, res) => {
        try {
            const filters = req.query;
            const data = await getClimaData(db, filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `clima_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'fazendaNome', title: 'Fazenda' },
                    { id: 'data', title: 'Data' },
                    { id: 'talhaoNome', title: 'Talhão' },
                    { id: 'tempMax', title: 'Temperatura Máxima (°C)' },
                    { id: 'tempMin', title: 'Temperatura Mínima (°C)' },
                    { id: 'umidade', title: 'Umidade Relativa (%)' },
                    { id: 'pluviosidade', title: 'Pluviosidade (mm)' },
                    { id: 'vento', title: 'Velocidade do Vento (km/h)' },
                    { id: 'obs', title: 'Observações' }
                ]
            });

            // Format Fazenda name as required: CODE - NAME
            const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', filters.companyId).get();
            const fazendasMap = {};
            fazendasSnapshot.forEach(doc => {
                const d = doc.data();
                fazendasMap[d.name.toUpperCase()] = d.code;
            });

            data.forEach(r => {
                if (r.fazendaNome && !r.fazendaNome.includes(' - ')) {
                    const code = fazendasMap[r.fazendaNome.toUpperCase()] || '';
                    if (code) {
                        r.fazendaNome = `${code} - ${r.fazendaNome}`;
                    }
                }
            });

            data.sort((a, b) => {
                // Sort by Farm Code (extracted from "CODE - NAME")
                const codeA = parseInt(a.fazendaNome.split(' - ')[0]) || 0;
                const codeB = parseInt(b.fazendaNome.split(' - ')[0]) || 0;
                if (codeA !== codeB) return codeA - codeB;
                return new Date(a.data) - new Date(b.data);
            });

            await csvWriter.writeRecords(data);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Clima:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/plantio/talhao/pdf', authMiddleware, (req, res) => generatePlantioTalhaoPdf(req, res, db));

    app.get('/reports/plantio/talhao/csv', authMiddleware, async (req, res) => {
        try {
            const filters = req.query;
            const data = await getPlantioData(db, filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `plantio_talhao_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'farmName', title: 'Fazenda' },
                    { id: 'date', title: 'Data' },
                    { id: 'talhao', title: 'Talhão' },
                    { id: 'variedade', title: 'Variedade Plantada' },
                    { id: 'provider', title: 'Prestador' },
                    { id: 'area', title: 'Área Plant. (ha)' },
                    { id: 'chuva', title: 'Chuva (mm)' },
                    { id: 'obs', title: 'Observações' }
                ]
            });

            const records = [];
            data.forEach(item => {
                item.records.forEach(record => {
                    records.push({ ...item, ...record, farmName: `${item.farmCode} - ${item.farmName}` });
                });
            });

            records.sort((a, b) => {
                const farmCodeA = parseInt(a.farmCode, 10) || 0;
                const farmCodeB = parseInt(b.farmCode, 10) || 0;
                if (farmCodeA !== farmCodeB) return farmCodeA - farmCodeB;

                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                if (dateA - dateB !== 0) return dateA - dateB;

                const tA = String(a.talhao||'');
                const tB = String(b.talhao||'');
                return tA.localeCompare(tB, undefined, {numeric: true});
            });

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Plantio por Talhão:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/brocamento/pdf', authMiddleware, (req, res) => generateBrocaPdf(req, res, db));

    app.get('/reports/brocamento/csv', authMiddleware, async (req, res) => {
        try {
            const data = await getFilteredData(db, 'registros', req.query);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');
            
            const filePath = path.join(os.tmpdir(), `brocamento_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    {id: 'fazenda', title: 'Fazenda'}, {id: 'data', title: 'Data'}, {id: 'talhao', title: 'Talhão'},
                    {id: 'corte', title: 'Corte'}, {id: 'entrenos', title: 'Entrenós'}, {id: 'brocado', title: 'Brocado'},
                    {id: 'brocamento', title: 'Brocamento (%)'}
                ]
            });

            const records = data.map(r => ({ ...r, fazenda: `${r.codigo} - ${r.fazenda}` }));

            records.sort((a, b) => {
                const codeA = parseInt(a.fazenda.split(' - ')[0]) || 0;
                const codeB = parseInt(b.fazenda.split(' - ')[0]) || 0;
                if (codeA !== codeB) return codeA - codeB;

                const dateA = new Date(a.data);
                const dateB = new Date(b.data);
                if (dateA - dateB !== 0) return dateA - dateB;

                const tA = String(a.talhao||'');
                const tB = String(b.talhao||'');
                return tA.localeCompare(tB, undefined, {numeric: true});
            });

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
    });

    app.get('/reports/perda/pdf', authMiddleware, (req, res) => generatePerdaPdf(req, res, db));

    app.get('/reports/perda/csv', authMiddleware, async (req, res) => {
        try {
            const filters = req.query;
            const data = await getFilteredData(db, 'perdas', filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const isDetailed = filters.tipoRelatorio === 'B';
            const filePath = path.join(os.tmpdir(), `perda_${Date.now()}.csv`);
            let header, records;

            if (isDetailed) {
                header = [
                    {id: 'fazenda', title: 'Fazenda'}, {id: 'data', title: 'Data'}, {id: 'talhao', title: 'Talhão'}, {id: 'frenteServico', title: 'Frente'},
                    {id: 'turno', title: 'Turno'}, {id: 'operador', title: 'Operador'}, {id: 'canaInteira', title: 'C.Inteira'}, {id: 'tolete', title: 'Tolete'},
                    {id: 'toco', title: 'Toco'}, {id: 'ponta', title: 'Ponta'}, {id: 'estilhaco', title: 'Estilhaço'}, {id: 'pedaco', title: 'Pedaço'}, {id: 'total', title: 'Total'}
                ];
                records = data.map(p => ({ ...p, fazenda: `${p.codigo} - ${p.fazenda}` }));
            } else {
                header = [
                    {id: 'fazenda', title: 'Fazenda'}, {id: 'data', title: 'Data'}, {id: 'talhao', title: 'Talhão'}, {id: 'frenteServico', title: 'Frente'},
                    {id: 'turno', title: 'Turno'}, {id: 'operador', title: 'Operador'}, {id: 'total', title: 'Total'}
                ];
                records = data.map(p => ({ data: p.data, fazenda: `${p.codigo} - ${p.fazenda}`, talhao: p.talhao, frenteServico: p.frenteServico, turno: p.turno, operador: p.operador, total: p.total }));
            }
            
            records.sort((a, b) => {
                const codeA = parseInt(a.fazenda.split(' - ')[0]) || 0;
                const codeB = parseInt(b.fazenda.split(' - ')[0]) || 0;
                if (codeA !== codeB) return codeA - codeB;

                const dateA = new Date(a.data);
                const dateB = new Date(b.data);
                if (dateA - dateB !== 0) return dateA - dateB;

                const tA = String(a.talhao||'');
                const tB = String(b.talhao||'');
                return tA.localeCompare(tB, undefined, {numeric: true});
            });

            const csvWriter = createObjectCsvWriter({ path: filePath, header });
            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
    });

    app.get('/reports/cigarrinha/pdf', authMiddleware, (req, res) => generateCigarrinhaPdf(req, res, db));

    app.get('/reports/cigarrinha-amostragem/pdf', authMiddleware, (req, res) => generateCigarrinhaAmostragemPdf(req, res, db));

    app.get('/reports/cigarrinha-amostragem/csv', authMiddleware, async (req, res) => {
        try {
            const { tipoRelatorio = 'detalhado' } = req.query;
            const data = await getFilteredData(db, 'cigarrinhaAmostragem', req.query);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

            const filename = `relatorio_cigarrinha_amostragem_${tipoRelatorio}_${Date.now()}.csv`;
            const filePath = path.join(os.tmpdir(), filename);

            let header, records;

            if (tipoRelatorio === 'resumido') {
                header = [
                    { id: 'fazenda', title: 'Fazenda' }, { id: 'data', title: 'Data' }, { id: 'talhao', title: 'Talhão' }, { id: 'variedade', title: 'Variedade' },
                    { id: 'fase1', title: 'Fase 1 (Soma)' }, { id: 'fase2', title: 'Fase 2 (Soma)' }, { id: 'fase3', title: 'Fase 3 (Soma)' },
                    { id: 'fase4', title: 'Fase 4 (Soma)' }, { id: 'fase5', title: 'Fase 5 (Soma)' }
                ];

                const groupedData = data.reduce((acc, r) => {
                    const date = new Date(r.data + 'T03:00:00Z');
                    const formattedDate = date.toLocaleDateString('pt-BR');
                    const key = `${formattedDate}|${r.codigo}|${r.fazenda}|${r.talhao}`;

                    if (!acc[key]) {
                        acc[key] = {
                            data: r.data,
                            formattedDate: formattedDate,
                            codigo: r.codigo,
                            fazenda: `${r.codigo} - ${r.fazenda}`,
                            talhao: r.talhao,
                            variedade: r.variedade,
                            fase1: 0, fase2: 0, fase3: 0, fase4: 0, fase5: 0,
                        };
                    }
                    r.amostras.forEach(amostra => {
                        acc[key].fase1 += amostra.fase1 || 0;
                        acc[key].fase2 += amostra.fase2 || 0;
                        acc[key].fase3 += amostra.fase3 || 0;
                        acc[key].fase4 += amostra.fase4 || 0;
                        acc[key].fase5 += amostra.fase5 || 0;
                    });
                    return acc;
                }, {});

                let summarizedData = Object.values(groupedData);
                summarizedData.sort((a,b) => {
                    const codeA = parseInt(a.codigo) || 0;
                    const codeB = parseInt(b.codigo) || 0;
                    if (codeA !== codeB) return codeA - codeB;

                    const dateA = new Date(a.data);
                    const dateB = new Date(b.data);
                    if (dateA - dateB !== 0) return dateA - dateB;

                    const tA = String(a.talhao||'');
                    const tB = String(b.talhao||'');
                    return tA.localeCompare(tB, undefined, {numeric: true});
                });

                records = summarizedData.map(rec => ({
                    data: rec.formattedDate,
                    fazenda: rec.fazenda,
                    talhao: rec.talhao,
                    variedade: rec.variedade,
                    fase1: rec.fase1,
                    fase2: rec.fase2,
                    fase3: rec.fase3,
                    fase4: rec.fase4,
                    fase5: rec.fase5
                }));

            } else if (tipoRelatorio === 'final') {
                header = [
                    { id: 'fazenda', title: 'Fazenda' }, { id: 'data', title: 'Data' }, { id: 'variedade', title: 'Variedade' },
                    { id: 'fase1', title: 'Fase1' }, { id: 'fase2', title: 'Fase2' }, { id: 'fase3', title: 'Fase3' },
                    { id: 'fase4', title: 'Fase4' }, { id: 'fase5', title: 'Fase5' }, { id: 'resultadoFinal', title: 'Resultado Final' }
                ];

                records = data.map(r => {
                    const date = new Date(r.data + 'T03:00:00Z');
                    const formattedDate = date.toLocaleDateString('pt-BR');

                    const totalFases = r.amostras.reduce((acc, amostra) => {
                        acc.f1 += amostra.fase1 || 0;
                        acc.f2 += amostra.fase2 || 0;
                        acc.f3 += amostra.fase3 || 0;
                        acc.f4 += amostra.fase4 || 0;
                        acc.f5 += amostra.fase5 || 0;
                        return acc;
                    }, { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0 });

                    return {
                        fazenda: `${r.codigo} - ${r.fazenda}`,
                        data: formattedDate,
                        originalData: r.data,
                        variedade: r.variedade,
                        fase1: totalFases.f1,
                        fase2: totalFases.f2,
                        fase3: totalFases.f3,
                        fase4: totalFases.f4,
                        fase5: totalFases.f5,
                        resultadoFinal: (r.resultado || 0).toFixed(2).replace('.', ',')
                    };
                });

                records.sort((a,b) => {
                    const codeA = parseInt(a.fazenda.split(' - ')[0]) || 0;
                    const codeB = parseInt(b.fazenda.split(' - ')[0]) || 0;
                    if (codeA !== codeB) return codeA - codeB;
                    return new Date(a.originalData) - new Date(b.originalData);
                });

            } else { // Detalhado
                header = [
                    { id: 'fazenda', title: 'Fazenda' }, { id: 'data', title: 'Data' }, { id: 'talhao', title: 'Talhão' }, { id: 'variedade', title: 'Variedade' },
                    { id: 'adulto', title: 'Adulto Presente'}, { id: 'numeroAmostra', title: 'Nº Amostra' }, { id: 'fase1', title: 'Fase 1' }, { id: 'fase2', title: 'Fase 2' },
                    { id: 'fase3', title: 'Fase 3' }, { id: 'fase4', title: 'Fase 4' }, { id: 'fase5', title: 'Fase 5' },
                    { id: 'resultadoAmostra', title: 'Resultado Amostra'}
                ];
                records = [];
                const divisor = parseInt(req.query.divisor, 10) || parseInt(data[0]?.divisor || '5', 10);

                data.sort((a,b) => {
                     const codeA = parseInt(a.codigo) || 0;
                     const codeB = parseInt(b.codigo) || 0;
                     if (codeA !== codeB) return codeA - codeB;

                     const dateA = new Date(a.data);
                     const dateB = new Date(b.data);
                     if (dateA - dateB !== 0) return dateA - dateB;

                     const tA = String(a.talhao||'');
                     const tB = String(b.talhao||'');
                     return tA.localeCompare(tB, undefined, {numeric: true});
                });

                data.forEach(lancamento => {
                    if (lancamento.amostras && lancamento.amostras.length > 0) {
                        lancamento.amostras.forEach((amostra, index) => {
                            const date = new Date(lancamento.data + 'T03:00:00Z');
                            const formattedDate = date.toLocaleDateString('pt-BR');
                            const somaFases = (amostra.fase1 || 0) + (amostra.fase2 || 0) + (amostra.fase3 || 0) + (amostra.fase4 || 0) + (amostra.fase5 || 0);
                            const resultadoAmostra = (somaFases / divisor).toFixed(2).replace('.', ',');

                            records.push({
                                fazenda: `${lancamento.codigo} - ${lancamento.fazenda}`, talhao: lancamento.talhao, data: formattedDate,
                                variedade: lancamento.variedade, adulto: lancamento.adulto ? 'Sim' : 'Não', numeroAmostra: index + 1, fase1: amostra.fase1 || 0,
                                fase2: amostra.fase2 || 0, fase3: amostra.fase3 || 0, fase4: amostra.fase4 || 0, fase5: amostra.fase5 || 0,
                                resultadoAmostra: resultadoAmostra
                            });
                        });
                    }
                });
            }

            const csvWriter = createObjectCsvWriter({ path: filePath, header: header, fieldDelimiter: ';' });
            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Cigarrinha (Amostragem):", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/cigarrinha/csv', authMiddleware, async (req, res) => {
        try {
            const data = await getFilteredData(db, 'cigarrinha', req.query);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `cigarrinha_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    {id: 'fazenda', title: 'Fazenda'}, {id: 'data', title: 'Data'}, {id: 'talhao', title: 'Talhão'},
                    {id: 'variedade', title: 'Variedade'}, {id: 'fase1', title: 'Fase 1'}, {id: 'fase2', title: 'Fase 2'},
                    {id: 'fase3', title: 'Fase 3'}, {id: 'fase4', title: 'Fase 4'}, {id: 'fase5', title: 'Fase 5'},
                    {id: 'adulto', title: 'Adulto Presente'}, {id: 'resultado', title: 'Resultado'}
                ]
            });

            const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', req.query.companyId).get();
            const fazendasData = {};
            fazendasSnapshot.forEach(docSnap => {
                fazendasData[docSnap.data().code] = docSnap.data();
            });

            // Sort data first
            data.sort((a,b) => {
                 const codeA = parseInt(a.codigo) || 0;
                 const codeB = parseInt(b.codigo) || 0;
                 if (codeA !== codeB) return codeA - codeB;

                 const dateA = new Date(a.data);
                 const dateB = new Date(b.data);
                 if (dateA - dateB !== 0) return dateA - dateB;

                 const tA = String(a.talhao||'');
                 const tB = String(b.talhao||'');
                 return tA.localeCompare(tB, undefined, {numeric: true});
            });

            const records = data.map(r => {
                const farm = fazendasData[r.codigo];
                const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === r.talhao.toUpperCase());
                const date = new Date(r.data + 'T03:00:00Z');
                const formattedDate = date.toLocaleDateString('pt-BR');
                return {
                    ...r,
                    data: formattedDate,
                    fazenda: `${r.codigo} - ${r.fazenda}`,
                    variedade: talhao?.variedade || 'N/A',
                    adulto: r.adulto ? 'Sim' : 'Não',
                    resultado: r.resultado
                };
            });

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Cigarrinha:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/colheita/pdf', authMiddleware, (req, res) => generateColheitaPdf(req, res, db));

    app.get('/reports/colheita/mensal/pdf', authMiddleware, (req, res) => generateColheitaMensalPdf(req, res, db));

    app.get('/reports/colheita/mensal/csv', authMiddleware, async (req, res) => {
        try {
            const { planId, companyId } = req.query;
            if (!planId) return res.status(400).send('Nenhum plano de colheita selecionado.');
            if (!companyId) return res.status(400).send('O ID da empresa é obrigatório.');

            const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
            if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
                return res.status(404).send('Plano de colheita não encontrado ou não pertence a esta empresa.');
            }

            const harvestPlan = harvestPlanDoc.data();
            const monthlyTotals = {};
            let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
            const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
            const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

            harvestPlan.sequence.forEach(group => {
                const isGroupClosed = group.plots.every(p => closedTalhaoIds.has(p.talhaoId));
                if(isGroupClosed) return;

                let producaoRestante = group.totalProducao;
                while (producaoRestante > 0) {
                    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                    if (!monthlyTotals[monthKey]) {
                        monthlyTotals[monthKey] = 0;
                    }
                    monthlyTotals[monthKey] += Math.min(producaoRestante, dailyTon);
                    producaoRestante -= dailyTon;
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            });

            const filePath = path.join(os.tmpdir(), `previsao_mensal_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'mes', title: 'Mês/Ano' },
                    { id: 'producao', title: 'Produção Total (ton)' }
                ]
            });

            const records = Object.keys(monthlyTotals).sort().map(monthKey => {
                const [year, month] = monthKey.split('-');
                const monthName = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
                return {
                    mes: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`,
                    producao: monthlyTotals[monthKey].toFixed(2)
                };
            });

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Previsão Mensal:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/colheita/csv', authMiddleware, async (req, res) => {
        try {
            const { planId, selectedColumns, companyId } = req.query;
            const selectedCols = JSON.parse(selectedColumns || '{}');
            if (!planId) return res.status(400).send('Nenhum plano de colheita selecionado.');
            if (!companyId) return res.status(400).send('O ID da empresa é obrigatório.');

            const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
            if (!harvestPlanDoc.exists || harvestPlanDoc.data().companyId !== companyId) {
                return res.status(404).send('Plano de colheita não encontrado ou não pertence a esta empresa.');
            }

            const harvestPlan = harvestPlanDoc.data();
            const fazendasSnapshot = await db.collection('fazendas').where('companyId', '==', companyId).get();
            const fazendasData = {};
            fazendasSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                fazendasData[data.code] = { id: docSnap.id, ...data };
            });

            const allPossibleHeaders = [
                { id: 'seq', title: 'Seq.' }, { id: 'fazenda', title: 'Fazenda' },
                { id: 'talhoes', title: 'Talhões' }, { id: 'area', title: 'Área (ha)' },
                { id: 'producao', title: 'Produção (ton)' }, { id: 'variedade', title: 'Variedade' },
                { id: 'idade', title: 'Idade (m)' }, { id: 'atr', title: 'ATR' },
                { id: 'maturador', title: 'Maturador' }, { id: 'diasAplicacao', title: 'Dias Aplic.' },
                { id: 'distancia', title: 'KM' }, { id: 'entrada', title: 'Entrada' },
                { id: 'saida', title: 'Saída' }
            ];

            let finalHeaders = allPossibleHeaders.filter(h =>
                ['seq', 'fazenda', 'area', 'producao', 'entrada', 'saida'].includes(h.id) || selectedCols[h.id]
            );

            const records = [];
            let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
            const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
            const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

            for (let i = 0; i < harvestPlan.sequence.length; i++) {
                const group = harvestPlan.sequence[i];
                const isGroupClosed = group.plots.every(p => closedTalhaoIds.has(p.talhaoId));

                const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
                const dataEntrada = new Date(currentDate.getTime());
                let dataSaida = new Date(dataEntrada.getTime());
                dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));

                if (!isGroupClosed) {
                    currentDate = new Date(dataSaida.getTime());
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                // Cálculos auxiliares
                let totalAgeInDays = 0, plotsWithDate = 0, totalDistancia = 0, plotsWithDistancia = 0;
                const allVarieties = new Set();
                group.plots.forEach(plot => {
                    const farm = fazendasData[group.fazendaCodigo];
                    const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                    if (talhao) {
                        if (talhao.dataUltimaColheita) {
                            const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
                            if (!isNaN(dataUltima)) { totalAgeInDays += Math.abs(dataEntrada - dataUltima); plotsWithDate++; }
                        }
                        if (talhao.variedade) allVarieties.add(talhao.variedade);
                        if (typeof talhao.distancia === 'number') { totalDistancia += talhao.distancia; plotsWithDistancia++; }
                    }
                });
                const idadeMediaMeses = plotsWithDate > 0 ? ((totalAgeInDays / plotsWithDate) / (1000 * 60 * 60 * 24 * 30)).toFixed(1) : 'N/A';
                const avgDistancia = plotsWithDistancia > 0 ? (totalDistancia / plotsWithDistancia).toFixed(2) : 'N/A';
                let diasAplicacao = 'N/A';
                if (group.maturadorDate) {
                    try {
                        const diffTime = new Date() - new Date(group.maturadorDate + 'T03:00:00Z');
                        if (diffTime >= 0) diasAplicacao = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    } catch (e) {}
                }

                const record = {
                    seq: i + 1,
                    fazenda: `${group.fazendaCodigo} - ${group.fazendaName} ${isGroupClosed ? '(ENCERRADO)' : ''}`,
                    talhoes: group.plots.map(p => p.talhaoName).join(', '),
                    area: group.totalArea.toFixed(2),
                    producao: group.totalProducao.toFixed(2),
                    variedade: Array.from(allVarieties).join(', ') || 'N/A',
                    idade: idadeMediaMeses,
                    atr: group.atr || 'N/A',
                    maturador: group.maturador || 'N/A',
                    diasAplicacao: diasAplicacao,
                    distancia: avgDistancia,
                    entrada: dataEntrada.toLocaleDateString('pt-BR'),
                    saida: dataSaida.toLocaleDateString('pt-BR')
                };
                records.push(record);
            }

            const filePath = path.join(os.tmpdir(), `relatorio_colheita_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({ path: filePath, header: finalHeaders });
            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Colheita Detalhado:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/monitoramento/pdf', authMiddleware, (req, res) => generateMonitoramentoPdf(req, res, db));

    app.get('/reports/armadilhas/pdf', authMiddleware, (req, res) => generateArmadilhasPdf(req, res, db));

    app.get('/reports/armadilhas/csv', authMiddleware, async (req, res) => {
        try {
            const { inicio, fim, fazendaCodigo, companyId } = req.query;
            if (!companyId) {
                return res.status(400).send('O ID da empresa é obrigatório.');
            }
            let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Coletada');
            
            if (inicio) query = query.where('dataColeta', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataColeta', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

            const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });

            const { getShapefileData, findTalhaoForTrap, findShapefileProp, safeToDate } = require('./utils/geoUtils');
            const geojsonData = await getShapefileData(db, companyId);

            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                const dataInstalacao = safeToDate(trap.dataInstalacao);
                const dataColeta = safeToDate(trap.dataColeta);

                let diasEmCampo = 'N/A';
                if (dataInstalacao && dataColeta) {
                    const diffTime = Math.abs(dataColeta - dataInstalacao);
                    diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                // Format fazendaNome as CODE - NAME using properties from shapefile or trap data
                const fazendaNameOnly = findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A';
                const fazendaCode = findShapefileProp(talhaoProps, ['FUNDO_AGR', 'CD_FAZENDA']) || trap.fazendaCode || '0';

                // Ensure format CODE - NAME
                let fazendaNomeFormatted = fazendaNameOnly;
                if (fazendaCode && fazendaCode !== '0' && !fazendaNameOnly.startsWith(fazendaCode)) {
                    fazendaNomeFormatted = `${fazendaCode} - ${fazendaNameOnly}`;
                }

                return {
                    fundoAgricola: fazendaCode,
                    fazendaNome: fazendaNomeFormatted,
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacao: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                    dataColeta: dataColeta ? dataColeta.toLocaleDateString('pt-BR') : 'N/A',
                    diasEmCampo: diasEmCampo,
                    contagemMariposas: trap.contagemMariposas || 0,
                    instaladoPor: usersMap[trap.instaladoPor] || 'Desconhecido',
                    coletadoPor: usersMap[trap.coletadoPor] || 'Desconhecido',
                    observacoes: trap.observacoes || ''
                };
            });
            
            if (fazendaCodigo) {
                // Filter by the code extracted above or the passed parameter
                enrichedData = enrichedData.filter(d => {
                    const code = parseInt(d.fundoAgricola) || 0;
                    return code === parseInt(fazendaCodigo);
                });
            }

            // Sort: Farm > Date Inst > Talhao
            enrichedData.sort((a,b) => {
                 // Numeric sort for farm code which is at start of fazendaNome or in fundoAgricola
                 const codeA = parseInt(a.fundoAgricola) || 0;
                 const codeB = parseInt(b.fundoAgricola) || 0;
                 if (codeA !== codeB) return codeA - codeB;

                 // Date compare (DD/MM/YYYY string to Date)
                 const toDate = (str) => {
                     if(!str || str === 'N/A') return new Date(0);
                     const [d, m, y] = str.split('/');
                     return new Date(`${y}-${m}-${d}`);
                 };
                 const dateA = toDate(a.dataInstalacao);
                 const dateB = toDate(b.dataInstalacao);
                 if (dateA - dateB !== 0) return dateA - dateB;

                 const tA = String(a.talhaoNome||'');
                 const tB = String(b.talhaoNome||'');
                 return tA.localeCompare(tB, undefined, {numeric: true});
            });

            const filePath = path.join(os.tmpdir(), `armadilhas_report_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'fazendaNome', title: 'Fazenda' },
                    { id: 'dataInstalacao', title: 'Data Instalação' },
                    { id: 'dataColeta', title: 'Data Coleta' },
                    { id: 'talhaoNome', title: 'Talhão' },
                    { id: 'diasEmCampo', title: 'Dias em Campo' },
                    { id: 'contagemMariposas', title: 'Qtd. Mariposas' },
                    { id: 'instaladoPor', title: 'Instalado Por' },
                    { id: 'coletadoPor', title: 'Coletado Por' },
                    { id: 'observacoes', title: 'Observações' }
                ]
            });

            await csvWriter.writeRecords(enrichedData);
            res.download(filePath);

        } catch (error) {
            console.error("Erro ao gerar CSV de Armadilhas:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/armadilhas-ativas/pdf', authMiddleware, (req, res) => generateArmadilhasAtivasPdf(req, res, db));

    app.get('/reports/armadilhas-ativas/csv', authMiddleware, async (req, res) => {
        try {
            const { inicio, fim, fazendaCodigo, companyId } = req.query;
            if (!companyId) {
                return res.status(400).send('O ID da empresa é obrigatório.');
            }
            let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Ativa');
            
            if (inicio) query = query.where('dataInstalacao', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataInstalacao', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

            const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });

            const { getShapefileData, findTalhaoForTrap, findShapefileProp, safeToDate } = require('./utils/geoUtils');
            const geojsonData = await getShapefileData(db, companyId);

            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
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

                // Format fazendaNome as CODE - NAME
                const fazendaNameOnly = findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A';
                const fazendaCode = findShapefileProp(talhaoProps, ['FUNDO_AGR', 'CD_FAZENDA']) || trap.fazendaCode || '0';

                let fazendaNomeFormatted = fazendaNameOnly;
                if (fazendaCode && fazendaCode !== '0' && !fazendaNameOnly.startsWith(fazendaCode)) {
                    fazendaNomeFormatted = `${fazendaCode} - ${fazendaNameOnly}`;
                }

                return {
                    fundoAgricola: fazendaCode,
                    fazendaNome: fazendaNomeFormatted,
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacao: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                    previsaoRetirada: previsaoRetiradaFmt,
                    diasEmCampo: diasEmCampo,
                    instaladoPor: usersMap[trap.instaladoPor] || 'Desconhecido',
                    observacoes: trap.observacoes || ''
                };
            });
            
            if (fazendaCodigo) {
                enrichedData = enrichedData.filter(d => parseInt(d.fundoAgricola) === parseInt(fazendaCodigo));
            }

            const filePath = path.join(os.tmpdir(), `armadilhas_instaladas_report_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'fazendaNome', title: 'Fazenda' },
                    { id: 'dataInstalacao', title: 'Data Instalação' },
                    { id: 'talhaoNome', title: 'Talhão' },
                    { id: 'previsaoRetirada', title: 'Previsão Retirada' },
                    { id: 'diasEmCampo', title: 'Dias em Campo' },
                    { id: 'instaladoPor', title: 'Instalado Por' },
                    { id: 'observacoes', title: 'Observações' }
                ]
            });

            await csvWriter.writeRecords(enrichedData);
            res.download(filePath);

        } catch (error) {
            console.error("Erro ao gerar CSV de Armadilhas Ativas:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/risk-view/pdf', authMiddleware, (req, res) => generateRiskViewPdf(req, res, db));

    app.get('/reports/risk-view/csv', authMiddleware, async (req, res) => {
        try {
            const { companyId } = req.query;
            if (!companyId) {
                return res.status(400).send('O ID da empresa é obrigatório.');
            }

            const { reportFarms } = await getRiskViewData(db, req.query);

            if (reportFarms.length === 0) {
                return res.status(404).send('Nenhuma fazenda com coletas encontrada para os filtros selecionados.');
            }

            const filePath = path.join(os.tmpdir(), `relatorio_risco_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'code', title: 'Código Fazenda' },
                    { id: 'name', title: 'Nome Fazenda' },
                    { id: 'totalTraps', title: 'Nº Armadilhas' },
                    { id: 'highCountTraps', title: 'Armadilhas >= 6' },
                    { id: 'riskPercentage', title: 'Índice de Aplicação (%)' }
                ]
            });

            const records = reportFarms.map(farm => ({
                code: farm.code,
                name: farm.name,
                totalTraps: farm.totalTraps,
                highCountTraps: farm.highCountTraps,
                riskPercentage: farm.riskPercentage.toFixed(2)
            }));

            records.sort((a, b) => a.code - b.code);

            await csvWriter.writeRecords(records);
            res.download(filePath);

        } catch (error) {
            console.error("Erro ao gerar CSV de Visualização de Risco:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.post('/api/os', authMiddleware, async (req, res) => {
        const { companyId, farmId, farmName, selectedPlots, totalArea, serviceType, responsible, observations, createdBy } = req.body;

        if (!companyId || !farmId || !selectedPlots) {
            return res.status(400).json({ message: 'Dados incompletos para criar a O.S.' });
        }

        try {
            const osRef = db.collection('serviceOrders').doc();
            const counterRef = db.collection('osCounters').doc(companyId);

            const newId = await db.runTransaction(async (transaction) => {
                const counterDoc = await transaction.get(counterRef);

                const year = new Date().getFullYear();
                let newCount;

                if (!counterDoc.exists || counterDoc.data().year !== year) {
                    newCount = 1;
                    transaction.set(counterRef, { count: newCount, year: year });
                } else {
                    newCount = counterDoc.data().count + 1;
                    transaction.update(counterRef, { count: newCount });
                }

                const sequentialId = `OS-${year}-${String(newCount).padStart(3, '0')}`;

                const osData = {
                    companyId,
                    farmId,
                    farmName,
                    selectedPlots,
                    serviceType: serviceType || '',
                    responsible: responsible || '',
                    totalArea,
                    observations: observations || '',
                    createdBy: createdBy || 'Sistema',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'Created',
                    sequentialId: sequentialId
                };

                transaction.set(osRef, osData);
                return osRef.id;
            });

            res.status(200).json({ message: 'Ordem de Serviço criada com sucesso.', id: newId });

        } catch (error) {
            console.error("Erro ao criar Ordem de Serviço com ID sequencial:", error);
            res.status(500).json({ message: 'Erro no servidor ao criar O.S. sequencial.' });
        }
    });

    app.get('/reports/os/pdf', authMiddleware, (req, res) => generateOsPdf(req, res, db));

    // --- ADMIN TOOLS ---
    app.post('/api/admin/fix-dates', authMiddleware, async (req, res) => {
        try {
            // Verify User is authenticated (Relaxed from Super Admin because regular admins need to fix their data too)
            // But we should restrict to 'admin' role of the company or super-admin.
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            if (!userDoc.exists) {
                return res.status(403).json({ message: 'Acesso negado.' });
            }
            const userData = userDoc.data();
            const allowedRoles = ['super-admin', 'admin', 'supervisor'];
            if (!allowedRoles.includes(userData.role)) {
                return res.status(403).json({ message: 'Acesso negado. Apenas Administradores podem executar esta ação.' });
            }

            const companyId = req.body.companyId || userData.companyId;
            if (!companyId) {
                 return res.status(400).json({ message: 'Company ID is required.' });
            }

            const batchLimit = 400;
            let totalFixed = 0;
            let lastDoc = null;
            let hasMore = true;

            console.log(`Iniciando correção de datas na coleção clima para a empresa ${companyId}...`);

            while (hasMore) {
                let query = db.collection('clima').where('companyId', '==', companyId).limit(batchLimit);
                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }

                const snapshot = await query.get();
                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }

                const batch = db.batch();
                let batchCount = 0;

                snapshot.forEach(doc => {
                    const data = doc.data();
                    let needsUpdate = false;
                    let updates = {};

                    if (data.data && typeof data.data === 'string') {
                        // 1. Trim Whitespace
                        let cleanDate = data.data.trim();
                        if (cleanDate !== data.data) {
                            needsUpdate = true;
                        }

                        // 2. Normalize YYYY-M-D to YYYY-MM-DD
                        if (cleanDate.includes('-')) {
                            const parts = cleanDate.split('-');
                            if (parts.length === 3) {
                                const year = parts[0];
                                let month = parts[1];
                                let day = parts[2];

                                if (month.length === 1 || day.length === 1) {
                                    month = month.padStart(2, '0');
                                    day = day.padStart(2, '0');
                                    cleanDate = `${year}-${month}-${day}`;
                                    needsUpdate = true;
                                }
                            }
                        } else if (cleanDate.includes('/')) {
                             // 3. Convert DD/MM/YYYY to YYYY-MM-DD (Legacy manual fix)
                             const parts = cleanDate.split('/');
                             if (parts.length === 3) {
                                 const day = parts[0].padStart(2, '0');
                                 const month = parts[1].padStart(2, '0');
                                 const year = parts[2];
                                 cleanDate = `${year}-${month}-${day}`;
                                 needsUpdate = true;
                             }
                        }

                        if (needsUpdate) {
                            updates.data = cleanDate;
                        }
                    }

                    // 4. Ensure numbers are numbers (Fix "10,5" strings)
                    if (typeof data.pluviosidade === 'string') {
                        const val = parseFloat(data.pluviosidade.replace(',', '.'));
                        if (!isNaN(val)) {
                            updates.pluviosidade = val;
                            needsUpdate = true;
                        }
                    }
                    if (typeof data.tempMax === 'string') {
                        const val = parseFloat(data.tempMax.replace(',', '.'));
                        if (!isNaN(val)) { updates.tempMax = val; needsUpdate = true; }
                    }
                    if (typeof data.tempMin === 'string') {
                        const val = parseFloat(data.tempMin.replace(',', '.'));
                        if (!isNaN(val)) { updates.tempMin = val; needsUpdate = true; }
                    }

                    if (Object.keys(updates).length > 0) {
                        batch.update(doc.ref, updates);
                        batchCount++;
                        totalFixed++;
                    }
                    lastDoc = doc;
                });

                if (batchCount > 0) {
                    await batch.commit();
                    console.log(`Corrigidos ${batchCount} documentos neste lote.`);
                }
            }

            res.status(200).json({ message: `Correção concluída. Total de registros atualizados: ${totalFixed}` });

        } catch (error) {
            console.error("Erro ao corrigir datas:", error);
            res.status(500).json({ message: `Erro no servidor: ${error.message}` });
        }
    });

} catch (error) {
    console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
}

app.listen(port, () => {
    console.log(`Servidor de relatórios rodando na porta ${port}`);
});
