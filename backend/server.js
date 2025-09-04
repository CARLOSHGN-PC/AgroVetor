// server.js - Backend com Geração de PDF e Upload de Shapefile

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit-table');
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

const app = express();
const port = process.env.PORT || 3001;

const corsOptions = {
    origin: 'https://agrovetor.store',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        throw new Error('A variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON não está definida.');
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
 
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "agrovetor-v2.firebasestorage.app" // Certifique-se que este é o nome correto do seu bucket
    });

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    console.log('Firebase Admin SDK inicializado com sucesso e conectado ao bucket.');

    // --- INICIALIZAÇÃO DA IA (GEMINI) ---
    const geminiApiKey = ""; // Chave de API removida a pedido do utilizador.
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
    app.post('/upload-logo', async (req, res) => {
        const { logoBase64 } = req.body;
        if (!logoBase64) {
            return res.status(400).send({ message: 'Nenhum dado de imagem Base64 enviado.' });
        }
        try {
            await db.collection('config').doc('company').set({ logoBase64: logoBase64 }, { merge: true });
            res.status(200).send({ message: 'Logo carregado com sucesso!' });
        } catch (error) {
            console.error("Erro ao salvar logo Base64 no Firestore:", error);
            res.status(500).send({ message: `Erro no servidor ao carregar logo: ${error.message}` });
        }
    });
 
    // ROTA PARA UPLOAD DO SHAPEFILE
    app.post('/upload-shapefile', async (req, res) => {
        const { fileBase64 } = req.body;
        if (!fileBase64) {
            return res.status(400).send({ message: 'Nenhum dado de arquivo Base64 foi enviado.' });
        }

        try {
            const buffer = Buffer.from(fileBase64, 'base64');
            const filePath = `shapefiles/talhoes.zip`;
            const file = bucket.file(filePath);

            await file.save(buffer, {
                metadata: {
                    contentType: 'application/zip',
                },
            });
            
            await file.makePublic();
            const downloadURL = file.publicUrl();

            await db.collection('config').doc('shapefile').set({
                shapefileURL: downloadURL,
                lastUpdated: new Date()
            });

            res.status(200).send({ message: 'Shapefile enviado com sucesso!', url: downloadURL });

        } catch (error) {
            console.error("Erro no servidor ao fazer upload do shapefile:", error);
            res.status(500).send({ message: `Erro no servidor ao processar o arquivo: ${error.message}` });
        }
    });

    // ROTA PARA INGESTÃO DE RELATÓRIO HISTÓRICO (SEM IA)
    app.post('/api/upload/historical-report', async (req, res) => {
        const { reportData: originalReportData } = req.body;
        if (!originalReportData) {
            return res.status(400).json({ message: 'Nenhum dado de relatório foi enviado.' });
        }

        try {
            let reportText;

            // Checa se o dado enviado é uma data URL (padrão do FileReader.readAsDataURL)
            if (originalReportData.startsWith('data:')) {
                const base64Data = originalReportData.split(';base64,')[1] || '';
                const buffer = Buffer.from(base64Data, 'base64');

                // Magic number check for ZIP files (XLSX, etc.)
                if (buffer && buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
                    const workbook = xlsx.read(buffer, { type: 'buffer' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const dataAsJson = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                    reportText = dataAsJson.map(row => row.join(';')).join('\n');
                } else {
                    // Assume que é um arquivo de texto (csv, txt)
                    reportText = buffer.toString('utf8');
                }
            } else {
                reportText = originalReportData;
            }

            const records = [];
            const stream = Readable.from(reportText);

            stream.pipe(csv({
                separator: ';',
                mapHeaders: ({ header }) => header.trim().toLowerCase() // Normaliza o cabeçalho
            }))
            .on('data', (data) => records.push(data))
            .on('end', async () => {
                if (records.length === 0) {
                    return res.status(400).json({ message: "O relatório parece estar vazio ou em um formato incorreto." });
                }

                // Valida se os cabeçalhos necessários existem no primeiro registro
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
                        };

                        // Não salva mais campos opcionais como talhao, safra, variedade
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
    app.post('/api/gemini/generate', async (req, res) => {
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
    app.post('/api/calculate-atr', async (req, res) => {
        const { codigoFazenda } = req.body;
        if (!codigoFazenda) {
            return res.status(400).json({ message: 'O código da fazenda é obrigatório.' });
        }

        try {
            const farmCodeStr = String(codigoFazenda || '').trim();
            const historyQuery = await db.collection('historicalHarvests')
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

    app.post('/api/delete/historical-data', async (req, res) => {
        try {
            console.log("Iniciando a exclusão da coleção 'historicalHarvests'...");
            await deleteCollection(db, 'historicalHarvests', 400);
            console.log("Coleção 'historicalHarvests' excluída com sucesso.");
            res.status(200).json({ message: 'Todos os dados do histórico da IA foram excluídos com sucesso.' });
        } catch (error) {
            console.error("Erro ao excluir o histórico da IA:", error);
            res.status(500).json({ message: 'Ocorreu um erro no servidor ao tentar excluir o histórico.' });
        }
    });

    app.post('/api/track', async (req, res) => {
        const { userId, latitude, longitude } = req.body;

        if (!userId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: 'userId, latitude e longitude são obrigatórios.' });
        }

        try {
            await db.collection('locationHistory').add({
                userId: userId,
                location: new admin.firestore.GeoPoint(parseFloat(latitude), parseFloat(longitude)),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            res.status(200).send({ message: 'Localização registrada com sucesso.' });
        } catch (error) {
            console.error("Erro ao registrar localização:", error);
            res.status(500).json({ message: 'Erro no servidor ao registrar localização.' });
        }
    });

    app.get('/api/cutting-order-next-id', async (req, res) => {
        const counterRef = db.collection('counters').doc('cuttingOrder');
        try {
            const nextId = await db.runTransaction(async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                if (!counterDoc.exists) {
                    transaction.set(counterRef, { currentId: 1 });
                    return 1;
                }
                const newId = counterDoc.data().currentId + 1;
                transaction.update(counterRef, { currentId: newId });
                return newId;
            });
            res.status(200).json({ nextId: nextId });
        } catch (error) {
            console.error("Erro ao gerar próximo ID da Ordem de Corte:", error);
            res.status(500).json({ message: 'Erro no servidor ao gerar ID.' });
        }
    });

    app.get('/api/history', async (req, res) => {
        const { userId, startDate, endDate } = req.query;

        if (!userId || !startDate || !endDate) {
            return res.status(400).json({ message: 'userId, startDate e endDate são obrigatórios.' });
        }

        try {
            const query = db.collection('locationHistory')
                .where('userId', '==', userId)
                .where('timestamp', '>=', new Date(startDate + 'T00:00:00Z'))
                .where('timestamp', '<=', new Date(endDate + 'T23:59:59Z'))
                .orderBy('timestamp', 'asc');

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

            res.status(200).json(history);
        } catch (error) {
            console.error("Erro ao buscar histórico de localização:", error);
            res.status(500).json({ message: 'Erro no servidor ao buscar histórico.' });
        }
    });

    // --- FUNÇÕES AUXILIARES ---

    const formatNumber = (num) => {
        if (typeof num !== 'number' || isNaN(num)) {
            return '0,00';
        }
        return num.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const getFilteredData = async (collectionName, filters) => {
        let query = db.collection(collectionName);
        if (filters.inicio) {
            query = query.where('data', '>=', filters.inicio);
        }
        if (filters.fim) {
            query = query.where('data', '<=', filters.fim);
        }
        
        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

        let farmCodesToFilter = null;

        if (filters.fazendaCodigo && filters.fazendaCodigo !== '') {
            farmCodesToFilter = [filters.fazendaCodigo];
        }
        else if (filters.tipos) {
            const selectedTypes = filters.tipos.split(',').filter(t => t);
            if (selectedTypes.length > 0) {
                const farmsQuery = db.collection('fazendas').where('types', 'array-contains-any', selectedTypes);
                const farmsSnapshot = await farmsQuery.get();
                
                const matchingFarmCodes = [];
                farmsSnapshot.forEach(doc => {
                    matchingFarmCodes.push(doc.data().code);
                });

                if (matchingFarmCodes.length > 0) {
                    farmCodesToFilter = matchingFarmCodes;
                } else {
                    return [];
                }
            }
        }

        let filteredData = data;

        if (farmCodesToFilter) {
            filteredData = filteredData.filter(d => farmCodesToFilter.includes(d.codigo));
        }
        
        if (filters.matricula) {
            filteredData = filteredData.filter(d => d.matricula === filters.matricula);
        }
        if (filters.talhao) {
            filteredData = filteredData.filter(d => d.talhao && d.talhao.toLowerCase().includes(filters.talhao.toLowerCase()));
        }
        if (filters.frenteServico) {
            filteredData = filteredData.filter(d => d.frenteServico && d.frenteServico.toLowerCase().includes(filters.frenteServico.toLowerCase()));
        }
        
        return filteredData.sort((a, b) => new Date(a.data) - new Date(b.data));
    };

    const generatePdfHeader = async (doc, title) => {
        try {
            const configDoc = await db.collection('config').doc('company').get();
            if (configDoc.exists && configDoc.data().logoBase64) {
                const logoBase64 = configDoc.data().logoBase64;
                doc.image(logoBase64, doc.page.margins.left, 15, { width: 40 });
            }
        } catch (error) {
            console.error("Não foi possível carregar o logotipo Base64:", error.message);
        }
        
        doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(2);
        return doc.y;
    };

    const generatePdfFooter = (doc, generatedBy = 'N/A') => {
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            
            const footerY = doc.page.height - doc.page.margins.bottom + 10;
            doc.fontSize(8).font('Helvetica')
               .text(`Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`,
                     doc.page.margins.left,
                     footerY,
                     { align: 'left', lineBreak: false });
        }
    };

    // --- [NOVO] FUNÇÕES AUXILIARES PARA MONITORAMENTO ---
    let cachedShapefile = null;
    let lastFetchTime = null;

    const getShapefileData = async () => {
        const now = new Date();
        // Cache em memória por 5 minutos para evitar downloads repetidos
        if (cachedShapefile && lastFetchTime && (now - lastFetchTime < 5 * 60 * 1000)) {
            return cachedShapefile;
        }

        const shapefileDoc = await db.collection('config').doc('shapefile').get();
        if (!shapefileDoc.exists || !shapefileDoc.data().shapefileURL) {
            throw new Error('URL do Shapefile não encontrada no Firestore.');
        }
        const url = shapefileDoc.data().shapefileURL;
        
        const response = await axios({ url, responseType: 'arraybuffer' });
        const geojson = await shp(response.data);
        
        cachedShapefile = geojson;
        lastFetchTime = now;
        return geojson;
    };

    const findTalhaoForTrap = (trap, geojsonData) => {
        const point = [trap.longitude, trap.latitude];
        for (const feature of geojsonData.features) {
            if (feature.geometry && feature.geometry.type === 'Polygon') {
                if (pointInPolygon(point, feature.geometry.coordinates[0])) {
                    return feature.properties;
                }
            }
        }
        return null; // Retorna null se não encontrar
    };

    const findShapefileProp = (props, keys) => {
        if (!props) return null;
        for (const key of keys) {
            if (props[key] !== undefined && props[key] !== null) {
                return props[key];
            }
        }
        return null;
    };

    // --- ROTAS DE RELATÓRIOS ---

    app.get('/reports/brocamento/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
        doc.pipe(res);

        try {
            const filters = req.query;
            const data = await getFilteredData('registros', filters);
            const title = 'Relatório de Inspeção de Broca';

            if (data.length === 0) {
                await generatePdfHeader(doc, title);
                doc.text('Nenhum dado encontrado para os filtros selecionados.');
                generatePdfFooter(doc, filters.generatedBy);
                doc.end();
                return;
            }
            
            const fazendasSnapshot = await db.collection('fazendas').get();
            const fazendasData = {};
            fazendasSnapshot.forEach(docSnap => {
                fazendasData[docSnap.data().code] = docSnap.data();
            });

            const enrichedData = data.map(reg => {
                const farm = fazendasData[reg.codigo];
                const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === reg.talhao.toUpperCase());
                return { ...reg, variedade: talhao?.variedade || 'N/A' };
            });

            const isModelB = filters.tipoRelatorio === 'B';
            
            await generatePdfHeader(doc, title);

            if (filters.tipoRelatorio === 'B') { // Modelo B - Por Fazenda
                const groupedData = enrichedData.reduce((acc, reg) => {
                    const key = `${reg.codigo} - ${reg.fazenda}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(reg);
                    return acc;
                }, {});

                for (const fazendaKey of Object.keys(groupedData).sort()) {
                    doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, { underline: true });
                    doc.moveDown(0.5);

                    const farmData = groupedData[fazendaKey];
                    const table = {
                        headers: ['Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'],
                        rows: farmData.map(r => [r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento])
                    };
                    await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
                    doc.moveDown();
                }
            } else { // Modelo A - Geral
                const table = {
                    headers: ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'],
                    rows: enrichedData.map(r => [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento])
                };
                await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
            }

            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF de Brocamento:", error);
            if (!res.headersSent) {
                res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            } else {
                doc.end();
            }
        }
    });

    app.get('/reports/brocamento/csv', async (req, res) => {
        try {
            const data = await getFilteredData('registros', req.query);
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
            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
    });

    app.get('/reports/censo-varietal/:format', async (req, res) => {
        const { format } = req.params;
        const { tipos, companyId, model, generatedBy } = req.query;

        try {
            let farmsQuery = db.collection('fazendas');
            const selectedTypes = tipos ? tipos.split(',').filter(t => t) : [];
            if (selectedTypes.length > 0) {
                farmsQuery = farmsQuery.where('types', 'array-contains-any', selectedTypes);
            }
            const snapshot = await farmsQuery.get();
            if (snapshot.empty) {
                return res.status(404).send('Nenhuma fazenda encontrada para os filtros selecionados.');
            }

            if (model === 'cut') {
                // --- LÓGICA PARA O MODELO "POR CORTE" (PIVOT TABLE) ---
                const maturationsSnapshot = await db.collection('varietyMaturations').get();
                const varietyMaturation = {};
                maturationsSnapshot.forEach(doc => {
                    const data = doc.data();
                    varietyMaturation[data.varietyName.toUpperCase()] = data.cycle;
                });

                const varietyToCompany = {};
                const companiesSnapshot = await db.collection('varietyCompanies').get();
                companiesSnapshot.forEach(doc => {
                    const company = doc.data();
                    if (company.varieties && Array.isArray(company.varieties)) {
                        company.varieties.forEach(v => {
                            varietyToCompany[v.trim().toUpperCase()] = company.name;
                        });
                    }
                });

                let companyNameFilter = null;
                if (companyId) {
                    const companyDoc = await db.collection('varietyCompanies').doc(companyId).get();
                    if (companyDoc.exists) {
                        companyNameFilter = companyDoc.data().name;
                    }
                }

                const pivotData = {};
                const allCuts = new Set();
                let grandTotalArea = 0;

                snapshot.forEach(doc => {
                    const farm = doc.data();
                    if (farm.talhoes && Array.isArray(farm.talhoes)) {
                        farm.talhoes.forEach(talhao => {
                            const variety = (talhao.variedade || 'N/A').trim().toUpperCase();
                            const companyOfVariety = varietyToCompany[variety];

                            if (companyNameFilter && companyOfVariety?.toLowerCase() !== companyNameFilter?.toLowerCase()) {
                                return;
                            }

                            const cut = talhao.corte ? parseInt(talhao.corte) : 0;
                            const area = parseFloat(talhao.area) || 0;

                            if (area > 0) {
                                if (!pivotData[variety]) pivotData[variety] = {};
                                if (!pivotData[variety][cut]) pivotData[variety][cut] = 0;
                                pivotData[variety][cut] += area;
                                if (cut > 0) allCuts.add(cut);
                                grandTotalArea += area;
                            }
                        });
                    }
                });

                if (grandTotalArea === 0) {
                    return res.status(404).send('Nenhum talhão com área ou variedade encontrada para os filtros aplicados.');
                }

                const sortedVarieties = Object.keys(pivotData).sort();
                const sortedCuts = Array.from(allCuts).sort((a, b) => a - b);

                if (format === 'pdf') {
                    const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape', bufferPages: true });
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_censo_por_corte.pdf');
                    doc.pipe(res);

                    await generatePdfHeader(doc, `Relatório de Censo por Corte`);

                    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                    const varietyColWidth = 100;
                    const maturationColWidth = 60;
                    const totalColWidth = 60;
                    const participationColWidth = 70;
                    const fixedWidth = varietyColWidth + maturationColWidth + totalColWidth + participationColWidth;
                    const remainingWidth = availableWidth - fixedWidth;
                    const cutColWidth = sortedCuts.length > 0 ? remainingWidth / sortedCuts.length : 0;

                    let fontSize = 8;
                    let headerFontSize = 9;
                    if (cutColWidth < 35) {
                        fontSize = 6;
                        headerFontSize = 7;
                    }

                    const columnConfig = [
                        { header: 'Variedade', width: varietyColWidth },
                        { header: 'Maturação', width: maturationColWidth },
                        ...sortedCuts.map(c => ({ header: `Corte ${c}`, width: cutColWidth, align: 'right' })),
                        { header: 'Total', width: totalColWidth, align: 'right' },
                        { header: 'Part. (%)', width: participationColWidth, align: 'right' }
                    ];

                    const headers = columnConfig.map(c => c.header);
                    const columnsSize = columnConfig.map(c => c.width);

                    const rows = sortedVarieties.map(variety => {
                        let varietyTotal = 0;
                        const rowData = [
                            variety,
                            varietyMaturation[variety] || 'N/A'
                        ];

                        sortedCuts.forEach(cut => {
                            const area = pivotData[variety][cut] || 0;
                            rowData.push(formatNumber(area));
                            varietyTotal += area;
                        });

                        const participation = grandTotalArea > 0 ? (varietyTotal / grandTotalArea) * 100 : 0;
                        rowData.push(formatNumber(varietyTotal));
                        rowData.push(formatNumber(participation) + '%');
                        return rowData;
                    });

                    const footer = ['Total Geral', ''];
                    sortedCuts.forEach(cut => {
                        let cutTotal = 0;
                        sortedVarieties.forEach(variety => {
                            cutTotal += pivotData[variety][cut] || 0;
                        });
                        footer.push(formatNumber(cutTotal));
                    });
                    footer.push(formatNumber(grandTotalArea));
                    footer.push('100.00%');
                    rows.push(footer);

                    const table = { headers, rows };

                    await doc.table(table, {
                        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(headerFontSize),
                        prepareRow: (row, i, isLast) => doc.font(i === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize),
                        columnsSize: columnsSize
                    });

                    generatePdfFooter(doc, generatedBy);
                    doc.end();

                } else if (format === 'csv') {
                    const csvHeader = [
                        { id: 'variety', title: 'Variedade' },
                        { id: 'maturation', title: 'Maturação' }
                    ];
                    sortedCuts.forEach(cut => {
                        csvHeader.push({ id: `corte_${cut}`, title: `Corte ${cut}` });
                    });
                    csvHeader.push({ id: 'total', title: 'Total' });
                    csvHeader.push({ id: 'participation', title: 'Participação (%)' });


                    const records = sortedVarieties.map(variety => {
                        const record = {
                            variety,
                            maturation: varietyMaturation[variety] || 'N/A'
                        };
                        let varietyTotal = 0;
                        sortedCuts.forEach(cut => {
                            const area = pivotData[variety][cut] || 0;
                            record[`corte_${cut}`] = area.toFixed(2);
                            varietyTotal += area;
                        });
                        record.total = varietyTotal.toFixed(2);
                        record.participation = grandTotalArea > 0 ? ((varietyTotal / grandTotalArea) * 100).toFixed(2) : "0.00";
                        return record;
                    });

                    const totalRecord = { variety: 'Total Geral', maturation: '' };
                    let grandTotal = 0;
                    sortedCuts.forEach(cut => {
                        let cutTotal = 0;
                        sortedVarieties.forEach(variety => {
                            cutTotal += pivotData[variety][cut] || 0;
                        });
                        totalRecord[`corte_${cut}`] = cutTotal.toFixed(2);
                        grandTotal += cutTotal;
                    });
                    totalRecord.total = grandTotal.toFixed(2);
                    totalRecord.participation = "100.00";
                    records.push(totalRecord);

                    const filePath = path.join(os.tmpdir(), `censo_por_corte_${Date.now()}.csv`);
                    const csvWriter = createObjectCsvWriter({ path: filePath, header: csvHeader });
                    await csvWriter.writeRecords(records);
                    res.download(filePath);
                }

            } else {
                // --- LÓGICA PARA O MODELO "POR VARIEDADE" ---
                const varietyToCompany = {};
                let companyNameFilter = 'Todas';
                const companiesSnapshot = await db.collection('varietyCompanies').get();
                companiesSnapshot.forEach(doc => {
                    const company = doc.data();
                    if (company.varieties && Array.isArray(company.varieties)) {
                        company.varieties.forEach(v => {
                            varietyToCompany[v.trim().toUpperCase()] = company.name;
                        });
                    }
                });

                if (companyId) {
                    const companyDoc = await db.collection('varietyCompanies').doc(companyId).get();
                    if (companyDoc.exists) companyNameFilter = companyDoc.data().name;
                }

                const companyData = {};
                let grandTotalArea = 0;

                snapshot.forEach(doc => {
                    const farm = doc.data();
                    if (farm.talhoes && Array.isArray(farm.talhoes)) {
                        farm.talhoes.forEach(talhao => {
                            const variety = talhao.variedade ? talhao.variedade.trim().toUpperCase() : 'NÃO IDENTIFICADA';
                            const company = varietyToCompany[variety] || 'Outras';
                            const area = parseFloat(talhao.area) || 0;
                            if (companyId && varietyToCompany[variety]?.toLowerCase() !== companyNameFilter?.toLowerCase()) return;
                            if (area > 0) {
                                if (!companyData[company]) companyData[company] = { totalArea: 0, varieties: {} };
                                if (!companyData[company].varieties[variety]) companyData[company].varieties[variety] = 0;
                                companyData[company].varieties[variety] += area;
                                companyData[company].totalArea += area;
                                grandTotalArea += area;
                            }
                        });
                    }
                });

                if (grandTotalArea === 0) return res.status(404).send('Nenhum talhão com área ou variedade encontrada.');

                if (format === 'pdf') {
                    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'portrait', bufferPages: true });
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_censo_varietal.pdf');
                    doc.pipe(res);

                    await generatePdfHeader(doc, `Relatório de Censo Varietal - ${companyNameFilter}`);
                    const sortedCompanies = Object.keys(companyData).sort();
                    let isFirstCompany = true;

                    for (const company of sortedCompanies) {
                        if (!isFirstCompany) {
                            doc.addPage();
                        }
                        isFirstCompany = false;

                        doc.fontSize(12).font('Helvetica-Bold').text(company, { underline: true });
                        doc.moveDown(0.5);

                        const sortedVarieties = Object.entries(companyData[company].varieties)
                            .map(([name, area]) => ({ name, area, percentage: (area / companyData[company].totalArea) * 100 }))
                            .sort((a, b) => b.area - a.area);

                        const table = {
                            headers: ['Variedade', 'Área (ha)', `Participação (${company})`],
                            rows: sortedVarieties.map(v => [v.name, formatNumber(v.area), formatNumber(v.percentage) + '%'])
                        };
                        table.rows.push(['Subtotal', formatNumber(companyData[company].totalArea), '100,00%']);

                        await doc.table(table, {
                            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
                            prepareRow: (row, i) => doc.font('Helvetica').fontSize(9),
                        });
                        doc.moveDown();
                    }

                    doc.moveDown();
                    doc.fontSize(12).font('Helvetica-Bold').text(`Total Geral: ${formatNumber(grandTotalArea)} ha`);
                    doc.moveDown(2);

                    // Adiciona seção de participação total, quebrando a página se necessário
                    if (doc.y + 80 > doc.page.height - doc.page.margins.bottom) {
                        doc.addPage();
                    }
                    doc.fontSize(12).font('Helvetica-Bold').text('Participação por Variedade (Total)', { underline: true });
                    doc.moveDown(0.5);

                    const allVarieties = {};
                    Object.values(companyData).forEach(comp => {
                        Object.entries(comp.varieties).forEach(([varietyName, area]) => {
                            if (!allVarieties[varietyName]) {
                                allVarieties[varietyName] = 0;
                            }
                            allVarieties[varietyName] += area;
                        });
                    });

                    const participationData = Object.entries(allVarieties)
                        .map(([name, area]) => ({ name, area, percentage: (area / grandTotalArea) * 100 }))
                        .sort((a, b) => b.area - a.area);

                    const participationTable = {
                        headers: ['Variedade', 'Área Total (ha)', 'Participação (%)'],
                        rows: participationData.map(v => [v.name, formatNumber(v.area), formatNumber(v.percentage) + '%'])
                    };

                    await doc.table(participationTable, {
                        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
                        prepareRow: (row, i) => doc.font('Helvetica').fontSize(9),
                    });


                    generatePdfFooter(doc, generatedBy);
                    doc.end();

                } else if (format === 'csv') {
                    const records = [];
                    const sortedCompanies = Object.keys(companyData).sort();
                    for (const company of sortedCompanies) {
                        const sortedVarieties = Object.entries(companyData[company].varieties)
                            .map(([name, area]) => ({ name, area, percentage: (area / grandTotalArea) * 100 }))
                            .sort((a, b) => b.area - a.area);

                        sortedVarieties.forEach(v => {
                            records.push({
                                company: company,
                                variety: v.name,
                                area: v.area.toFixed(2),
                                percentage: v.percentage.toFixed(2)
                            });
                        });
                    }

                    const filePath = path.join(os.tmpdir(), `censo_varietal_${Date.now()}.csv`);
                    const csvWriter = createObjectCsvWriter({
                        path: filePath,
                        header: [
                            { id: 'company', title: 'Empresa' },
                            { id: 'variety', title: 'Variedade' },
                            { id: 'area', title: 'Área (ha)' },
                            { id: 'percentage', title: 'Participação (%)' }
                        ]
                    });
                    await csvWriter.writeRecords(records);

                    // [NOVO] Adicionar seção de participação total ao CSV
                    const allVarieties = {};
                    Object.values(companyData).forEach(comp => {
                        Object.entries(comp.varieties).forEach(([varietyName, area]) => {
                            if (!allVarieties[varietyName]) allVarieties[varietyName] = 0;
                            allVarieties[varietyName] += area;
                        });
                    });

                    const participationData = Object.entries(allVarieties)
                        .map(([name, area]) => ({ name, area, percentage: (area / grandTotalArea) * 100 }))
                        .sort((a, b) => b.area - a.area);

                    const fs = require('fs').promises;
                    let csvContent = await fs.readFile(filePath, 'utf8');
                    csvContent += '\n'; // Linha em branco
                    csvContent += 'Participação por Variedade (Total)\n';
                    csvContent += 'Variedade;Área Total (ha);Participação (%)\n';
                    participationData.forEach(v => {
                        csvContent += `${v.name};${v.area.toFixed(2)};${v.percentage.toFixed(2)}\n`;
                    });

                    await fs.writeFile(filePath, csvContent);

                    res.download(filePath);
                } else {
                    res.status(400).send('Formato de relatório inválido.');
                }
            }

        } catch (error) {
            console.error("Erro ao gerar relatório de censo varietal:", error);
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        }
    });

    app.get('/reports/plantio/:format', async (req, res) => {
        const { format } = req.params;
        const { generatedBy } = req.query;

        try {
            const plansSnapshot = await db.collection('plantingPlans').orderBy('date', 'desc').get();
            if (plansSnapshot.empty) {
                return res.status(404).send('Nenhum plano de plantio encontrado.');
            }

            const farmsSnapshot = await db.collection('fazendas').get();
            const farmsMap = new Map();
            farmsSnapshot.forEach(doc => {
                farmsMap.set(doc.id, doc.data());
            });

            const reportData = [];
            plansSnapshot.forEach(doc => {
                const plan = doc.data();
                const farm = farmsMap.get(plan.fazendaId);
                const manejoPreReforma = plan.preReforma === 'outro' ? plan.preReformaOutro : plan.preReforma;

                reportData.push({
                    id: doc.id,
                    ...plan,
                    fazendaName: farm ? `${farm.code} - ${farm.name}` : 'Fazenda não encontrada',
                    talhoes: (plan.plots || []).map(p => p.name).join(', '),
                    manejo: manejoPreReforma
                });
            });

            if (format === 'pdf') {
                const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape', bufferPages: true });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'attachment; filename=relatorio_planejamento_plantio.pdf');
                doc.pipe(res);

                await generatePdfHeader(doc, 'Relatório de Planejamento de Plantio');

                const table = {
                    headers: ['Plano', 'Safra', 'Fazenda', 'Talhões', 'Área (ha)', 'Variedade', 'Data', 'Tipo Plantio', 'Prestador', 'Tipo Área', 'Manejo'],
                    rows: reportData.map(p => [
                        p.planName,
                        p.safra,
                        p.fazendaName,
                        p.talhoes,
                        (p.area || 0).toFixed(2),
                        p.variedade,
                        p.date,
                        p.tipoPlantio,
                        p.prestador,
                        p.tipoArea,
                        p.manejo
                    ])
                };

                await doc.table(table, {
                    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
                    prepareRow: (row, i) => doc.font('Helvetica').fontSize(8),
                });

                generatePdfFooter(doc, generatedBy);
                doc.end();
            } else if (format === 'csv') {
                const filePath = path.join(os.tmpdir(), `relatorio_plantio_${Date.now()}.csv`);
                const csvWriter = createObjectCsvWriter({
                    path: filePath,
                    header: [
                        { id: 'planName', title: 'Plano' },
                        { id: 'safra', title: 'Safra' },
                        { id: 'fazendaName', title: 'Fazenda' },
                        { id: 'talhoes', title: 'Talhões' },
                        { id: 'area', title: 'Área (ha)' },
                        { id: 'variedade', title: 'Variedade' },
                        { id: 'date', title: 'Data' },
                        { id: 'tch', title: 'TCH Esperado' },
                        { id: 'tipoPlantio', title: 'Tipo Plantio' },
                        { id: 'prestador', title: 'Prestador' },
                        { id: 'tipoArea', title: 'Tipo Área' },
                        { id: 'manejo', title: 'Manejo Pré-Reforma' },
                        { id: 'obs', title: 'Observações' }
                    ]
                });
                await csvWriter.writeRecords(reportData);
                res.download(filePath);
            } else {
                res.status(400).send('Formato de relatório inválido.');
            }

        } catch (error) {
            console.error("Erro ao gerar relatório de plantio:", error);
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        }
    });

    app.get('/reports/falta-colher/:format', async (req, res) => {
        const { format } = req.params;
        const { planId, fazendaCodigo, talhao, generatedBy, showPlots } = req.query;
        const shouldShowPlots = showPlots === 'true';

        if (!planId) {
            return res.status(400).send('ID do plano de colheita é obrigatório.');
        }

        try {
            const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
            if (!harvestPlanDoc.exists) {
                return res.status(404).send('Plano de colheita não encontrado.');
            }
            const harvestPlan = harvestPlanDoc.data();

            const allFarmCodes = [...new Set(harvestPlan.sequence.map(g => g.fazendaCodigo))];
            const farmsSnapshot = await db.collection('fazendas').where('code', 'in', allFarmCodes).get();
            const farmsData = {};
            farmsSnapshot.forEach(doc => {
                farmsData[doc.data().code] = doc.data();
            });

            const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);
            let reportData = [];

            const reportDataByFarm = {};

            for (const group of harvestPlan.sequence) {
                const activePlots = group.plots.filter(p => !closedTalhaoIds.has(p.talhaoId));
                if (activePlots.length === 0) continue;

                if (fazendaCodigo && group.fazendaCodigo !== fazendaCodigo) continue;

                const farmKey = `${group.fazendaCodigo} - ${group.fazendaName}`;
                if (!reportDataByFarm[farmKey]) {
                    reportDataByFarm[farmKey] = { plots: [], subtotal: { areaTotal: 0, areaColhida: 0, saldoArea: 0, prodTotal: 0, prodColhida: 0, saldoProd: 0 } };
                }

                const farm = farmsData[group.fazendaCodigo];
                if (!farm) continue;

                const groupAreaColhida = group.areaColhida || 0;
                const groupProdColhida = group.producaoColhida || 0;
                const groupActiveArea = group.plots.reduce((sum, p) => {
                    const talhaoData = farm.talhoes.find(t => t.id === p.talhaoId);
                    return sum + (talhaoData ? talhaoData.area : 0);
                }, 0);

                for (const plot of activePlots) {
                    const talhaoData = farm.talhoes.find(t => t.id === plot.talhaoId);
                    if (!talhaoData) continue;

                    if (talhao && !talhaoData.name.toLowerCase().includes(talhao.toLowerCase())) continue;

                    const plotArea = talhaoData.area || 0;
                    const plotProd = talhaoData.producao || 0;

                    const proratedAreaColhida = groupActiveArea > 0 ? (plotArea / groupActiveArea) * groupAreaColhida : 0;
                    const proratedProdColhida = groupActiveArea > 0 ? (plotArea / groupActiveArea) * groupProdColhida : 0; // Prorate by area as a proxy

                    const saldoArea = plotArea - proratedAreaColhida;
                    const saldoProd = plotProd - proratedProdColhida;

                    reportDataByFarm[farmKey].plots.push({
                        talhao: talhaoData.name,
                        areaTotal: plotArea,
                        areaColhida: proratedAreaColhida,
                        saldoArea: saldoArea,
                        prodTotal: plotProd,
                        prodColhida: proratedProdColhida,
                        saldoProd: saldoProd,
                    });

                    // Update subtotals
                    reportDataByFarm[farmKey].subtotal.areaTotal += plotArea;
                    reportDataByFarm[farmKey].subtotal.areaColhida += proratedAreaColhida;
                    reportDataByFarm[farmKey].subtotal.saldoArea += saldoArea;
                    reportDataByFarm[farmKey].subtotal.prodTotal += plotProd;
                    reportDataByFarm[farmKey].subtotal.prodColhida += proratedProdColhida;
                    reportDataByFarm[farmKey].subtotal.saldoProd += saldoProd;
                }
            }

            if (format === 'pdf') {
                const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=relatorio_falta_colher.pdf`);
                doc.pipe(res);
                await generatePdfHeader(doc, `Relatório de Saldo a Colher - ${harvestPlan.frontName}`);

                if (shouldShowPlots) {
                    const headers = ['Fazenda', 'Talhão', 'Área Total', 'Área Colhida', 'Saldo Área', 'Prod. Total', 'Prod. Colhida', 'Saldo Prod.'];
                    const columnsSize = [220, 100, 77, 77, 77, 77, 77, 77];
                    const grandTotal = { areaTotal: 0, areaColhida: 0, saldoArea: 0, prodTotal: 0, prodColhida: 0, saldoProd: 0 };

                    for (const farmKey in reportDataByFarm) {
                        const farmData = reportDataByFarm[farmKey];
                        const rows = farmData.plots.map(d => [ farmKey, d.talhao, formatNumber(d.areaTotal), formatNumber(d.areaColhida), formatNumber(d.saldoArea), formatNumber(d.prodTotal), formatNumber(d.prodColhida), formatNumber(d.saldoProd) ]);
                        const subtotalRow = [ 'Subtotal', '', formatNumber(farmData.subtotal.areaTotal), formatNumber(farmData.subtotal.areaColhida), formatNumber(farmData.subtotal.saldoArea), formatNumber(farmData.subtotal.prodTotal), formatNumber(farmData.subtotal.prodColhida), formatNumber(farmData.subtotal.saldoProd) ];
                        rows.push(subtotalRow);
                        Object.keys(grandTotal).forEach(key => { grandTotal[key] += farmData.subtotal[key]; });

                        await doc.table({ headers, rows }, {
                            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
                            prepareRow: (row, i) => doc.font(row[0] === 'Subtotal' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8),
                            columnsSize: columnsSize
                        });
                        doc.moveDown();
                    }
                    if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
                    const grandTotalRow = [ 'Total Geral', '', formatNumber(grandTotal.areaTotal), formatNumber(grandTotal.areaColhida), formatNumber(grandTotal.saldoArea), formatNumber(grandTotal.prodTotal), formatNumber(grandTotal.prodColhida), formatNumber(grandTotal.saldoProd) ];
                    await doc.table({ headers, rows: [grandTotalRow] }, { hideHeader: true, prepareRow: (row, i) => doc.font('Helvetica-Bold').fontSize(9), columnsSize: columnsSize });
                } else {
                    // Summary View
                    const headers = ['Fazenda', 'Área Total', 'Área Colhida', 'Saldo Área', 'Prod. Total', 'Prod. Colhida', 'Saldo Prod.'];
                    const columnsSize = [240, 90, 90, 90, 90, 90, 90];
                    const rows = [];
                    const grandTotal = { areaTotal: 0, areaColhida: 0, saldoArea: 0, prodTotal: 0, prodColhida: 0, saldoProd: 0 };
                    for (const farmKey in reportDataByFarm) {
                        const subtotal = reportDataByFarm[farmKey].subtotal;
                        rows.push([ farmKey, formatNumber(subtotal.areaTotal), formatNumber(subtotal.areaColhida), formatNumber(subtotal.saldoArea), formatNumber(subtotal.prodTotal), formatNumber(subtotal.prodColhida), formatNumber(subtotal.saldoProd) ]);
                        Object.keys(grandTotal).forEach(key => { grandTotal[key] += subtotal[key]; });
                    }
                    const grandTotalRow = [ 'Total Geral', formatNumber(grandTotal.areaTotal), formatNumber(grandTotal.areaColhida), formatNumber(grandTotal.saldoArea), formatNumber(grandTotal.prodTotal), formatNumber(grandTotal.prodColhida), formatNumber(grandTotal.saldoProd) ];
                    rows.push(grandTotalRow);
                    await doc.table({ headers, rows }, {
                        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
                        prepareRow: (row, i) => doc.font(row[0] === 'Total Geral' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8),
                        columnsSize: columnsSize
                    });
                }

                generatePdfFooter(doc, generatedBy);
                doc.end();

            } else if (format === 'csv') {
                let records = [];
                let headers = [];

                if (shouldShowPlots) {
                    headers = [
                        { id: 'fazenda', title: 'Fazenda' }, { id: 'talhao', title: 'Talhão' },
                        { id: 'areaTotal', title: 'Area Total (ha)' }, { id: 'areaColhida', title: 'Area Colhida (ha)' }, { id: 'saldoArea', title: 'Saldo Area (ha)' },
                        { id: 'prodTotal', title: 'Prod. Total (ton)' }, { id: 'prodColhida', title: 'Prod. Colhida (ton)' }, { id: 'saldoProd', title: 'Saldo Prod. (ton)' }
                    ];
                    for (const farmKey in reportDataByFarm) {
                        reportDataByFarm[farmKey].plots.forEach(plot => {
                            records.push({ fazenda: farmKey, talhao: plot.talhao, areaTotal: plot.areaTotal.toFixed(2), areaColhida: plot.areaColhida.toFixed(2), saldoArea: plot.saldoArea.toFixed(2), prodTotal: plot.prodTotal.toFixed(2), prodColhida: plot.prodColhida.toFixed(2), saldoProd: plot.saldoProd.toFixed(2) });
                        });
                    }
                } else {
                    headers = [
                        { id: 'fazenda', title: 'Fazenda' },
                        { id: 'areaTotal', title: 'Area Total (ha)' }, { id: 'areaColhida', title: 'Area Colhida (ha)' }, { id: 'saldoArea', title: 'Saldo Area (ha)' },
                        { id: 'prodTotal', title: 'Prod. Total (ton)' }, { id: 'prodColhida', title: 'Prod. Colhida (ton)' }, { id: 'saldoProd', title: 'Saldo Prod. (ton)' }
                    ];
                    for (const farmKey in reportDataByFarm) {
                        const subtotal = reportDataByFarm[farmKey].subtotal;
                        records.push({ fazenda: farmKey, areaTotal: subtotal.areaTotal.toFixed(2), areaColhida: subtotal.areaColhida.toFixed(2), saldoArea: subtotal.saldoArea.toFixed(2), prodTotal: subtotal.prodTotal.toFixed(2), prodColhida: subtotal.prodColhida.toFixed(2), saldoProd: subtotal.saldoProd.toFixed(2) });
                    }
                }

                const filePath = path.join(os.tmpdir(), `falta_colher_${Date.now()}.csv`);
                const csvWriter = createObjectCsvWriter({ path: filePath, header: headers });
                await csvWriter.writeRecords(records);
                res.download(filePath);

            } else {
                res.status(400).send('Formato de relatório inválido.');
            }

        } catch (error) {
            console.error("Erro ao gerar relatório de o que falta colher:", error);
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        }
    });

    app.get('/reports/perda/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_perda.pdf`);
        doc.pipe(res);

        try {
            const filters = req.query;
            const data = await getFilteredData('perdas', filters);
            const isDetailed = filters.tipoRelatorio === 'B';
            const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';

            if (data.length === 0) {
                await generatePdfHeader(doc, title);
                doc.text('Nenhum dado encontrado para os filtros selecionados.');
                generatePdfFooter(doc, filters.generatedBy);
                doc.end();
                return;
            }
            
            await generatePdfHeader(doc, title);

            if (isDetailed) { // Modelo B - Detalhado
                const groupedData = data.reduce((acc, p) => {
                    const key = `${p.codigo} - ${p.fazenda}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(p);
                    return acc;
                }, {});

                for (const fazendaKey of Object.keys(groupedData).sort()) {
                    doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, { underline: true });
                    doc.moveDown(0.5);

                    const farmData = groupedData[fazendaKey];
                    const table = {
                        headers: ['Data', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço', 'Total'],
                        rows: farmData.map(p => [p.data, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.canaInteira), formatNumber(p.tolete), formatNumber(p.toco), formatNumber(p.ponta), formatNumber(p.estilhaco), formatNumber(p.pedaco), formatNumber(p.total)])
                    };
                    await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
                    doc.moveDown();
                }
            } else { // Modelo A - Resumido
                const table = {
                    headers: ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'],
                    rows: data.map(p => [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.total)])
                };
                await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
            }

            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF de Perda:", error);
            if (!res.headersSent) {
                res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            } else {
                doc.end();
            }
        }
    });

    app.get('/reports/perda/csv', async (req, res) => {
        try {
            const filters = req.query;
            const data = await getFilteredData('perdas', filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const isDetailed = filters.tipoRelatorio === 'B';
            const filePath = path.join(os.tmpdir(), `perda_${Date.now()}.csv`);
            let header, records;

            if (isDetailed) {
                header = [
                    {id: 'data', title: 'Data'}, {id: 'fazenda', title: 'Fazenda'}, {id: 'talhao', title: 'Talhão'}, {id: 'frenteServico', title: 'Frente'},
                    {id: 'turno', title: 'Turno'}, {id: 'operador', title: 'Operador'}, {id: 'canaInteira', title: 'C.Inteira'}, {id: 'tolete', title: 'Tolete'},
                    {id: 'toco', title: 'Toco'}, {id: 'ponta', title: 'Ponta'}, {id: 'estilhaco', title: 'Estilhaço'}, {id: 'pedaco', title: 'Pedaço'}, {id: 'total', title: 'Total'}
                ];
                records = data.map(p => ({ ...p, fazenda: `${p.codigo} - ${p.fazenda}` }));
            } else {
                header = [
                    {id: 'data', title: 'Data'}, {id: 'fazenda', title: 'Fazenda'}, {id: 'talhao', title: 'Talhão'}, {id: 'frenteServico', title: 'Frente'},
                    {id: 'turno', title: 'Turno'}, {id: 'operador', title: 'Operador'}, {id: 'total', title: 'Total'}
                ];
                records = data.map(p => ({ data: p.data, fazenda: `${p.codigo} - ${p.fazenda}`, talhao: p.talhao, frenteServico: p.frenteServico, turno: p.turno, operador: p.operador, total: p.total }));
            }
            
            const csvWriter = createObjectCsvWriter({ path: filePath, header });
            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
    });

    app.get('/reports/colheita/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_colheita_custom.pdf`);
        doc.pipe(res);

        try {
            const { planId, selectedColumns, generatedBy } = req.query;
            const selectedCols = JSON.parse(selectedColumns || '{}');

            if (!planId) {
                await generatePdfHeader(doc, 'Relatório Customizado de Colheita');
                doc.text('Nenhum plano de colheita selecionado.');
                generatePdfFooter(doc, generatedBy);
                doc.end();
                return;
            }

            const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
            if (!harvestPlanDoc.exists) {
                await generatePdfHeader(doc, 'Relatório Customizado de Colheita');
                doc.text('Plano de colheita não encontrado.');
                generatePdfFooter(doc, generatedBy);
                doc.end();
                return;
            }

            const harvestPlan = harvestPlanDoc.data();
            const fazendasSnapshot = await db.collection('fazendas').get();
            const fazendasData = {};
            fazendasSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                fazendasData[data.code] = { id: docSnap.id, ...data };
            });

            const title = `Relatório de Colheita - ${harvestPlan.frontName}`;
            await generatePdfHeader(doc, title);

            const allPossibleHeaders = [
                { property: 'seq', header: 'Seq.' },
                { property: 'fazenda', header: 'Fazenda' },
                { property: 'talhoes', header: 'Talhões' },
                { property: 'area', header: 'Área (ha)' },
                { property: 'producao', header: 'Prod. (ton)' },
                { property: 'variedade', header: 'Variedade' },
                { property: 'idade', header: 'Idade (m)' },
                { property: 'atr', header: 'ATR' },
                { property: 'maturador', header: 'Matur.' },
                { property: 'diasAplicacao', header: 'Dias Aplic.' },
                { property: 'distancia', header: 'KM' },
                { property: 'entrada', header: 'Entrada' },
                { property: 'saida', header: 'Saída' }
            ];

            const fixedInitial = ['seq', 'fazenda', 'area', 'producao'];
            const fixedFinal = ['entrada', 'saida'];
            
            let activeHeaders = fixedInitial.map(p => allPossibleHeaders.find(h => h.property === p));
            allPossibleHeaders.forEach(h => {
                if (selectedCols[h.property] && !fixedInitial.includes(h.property) && !fixedFinal.includes(h.property)) {
                    activeHeaders.push(h);
                }
            });
            activeHeaders.push(...fixedFinal.map(p => allPossibleHeaders.find(h => h.property === p)));

            const rows = [];
            let grandTotalProducao = 0;
            let grandTotalArea = 0;
            let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
            const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
            const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

            harvestPlan.sequence.forEach((group, i) => {
                const isGroupClosed = group.plots.every(p => closedTalhaoIds.has(p.talhaoId));
                if (!isGroupClosed) {
                    grandTotalProducao += group.totalProducao;
                    grandTotalArea += group.totalArea;
                }

                const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
                const dataEntrada = new Date(currentDate.getTime());
                let dataSaida = new Date(dataEntrada.getTime());
                dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));

                if (!isGroupClosed) {
                    currentDate = new Date(dataSaida.getTime());
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                let totalAgeInDays = 0, plotsWithDate = 0, totalDistancia = 0, plotsWithDistancia = 0;
                const allVarieties = new Set();
                group.plots.forEach(plot => {
                    const farm = fazendasData[group.fazendaCodigo];
                    const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                    if (talhao) {
                        if (talhao.dataUltimaColheita) {
                            const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
                            if (!isNaN(dataUltima)) {
                                totalAgeInDays += Math.abs(dataEntrada - dataUltima);
                                plotsWithDate++;
                            }
                        }
                        if (talhao.variedade) allVarieties.add(talhao.variedade);
                        if (typeof talhao.distancia === 'number') {
                            totalDistancia += talhao.distancia;
                            plotsWithDistancia++;
                        }
                    }
                });
                const idadeMediaMeses = plotsWithDate > 0 ? ((totalAgeInDays / plotsWithDate) / (1000 * 60 * 60 * 24 * 30)).toFixed(1) : 'N/A';
                const avgDistancia = plotsWithDistancia > 0 ? formatNumber(totalDistancia / plotsWithDistancia) : 'N/A';
                let diasAplicacao = 'N/A';
                if (group.maturadorDate) {
                    try {
                        const today = new Date();
                        const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
                        if (applicationDate <= today) {
                            diasAplicacao = Math.floor((today - applicationDate) / (1000 * 60 * 60 * 24));
                        }
                    } catch (e) { /* ignore */ }
                }

                const rowData = {
                    seq: i + 1,
                    fazenda: `${group.fazendaCodigo} - ${group.fazendaName} ${isGroupClosed ? '(ENCERRADO)' : ''}`,
                    talhoes: group.plots.map(p => p.talhaoName).join(', '),
                    area: formatNumber(group.totalArea),
                    producao: formatNumber(group.totalProducao),
                    variedade: Array.from(allVarieties).join(', ') || 'N/A',
                    idade: idadeMediaMeses,
                    atr: group.atr || 'N/A',
                    maturador: group.maturador || 'N/A',
                    diasAplicacao: diasAplicacao,
                    distancia: avgDistancia,
                    entrada: dataEntrada.toLocaleDateString('pt-BR'),
                    saida: dataSaida.toLocaleDateString('pt-BR')
                };
                rows.push(activeHeaders.map(h => rowData[h.property]));
            });
            
            const table = {
                headers: activeHeaders,
                rows: rows
            };
            await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });

            generatePdfFooter(doc, generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro no PDF de Colheita:", error);
            if (!res.headersSent) {
                res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            } else {
                doc.end();
            }
        }
    });

    app.get('/reports/colheita/mensal/csv', async (req, res) => {
        try {
            const { planId } = req.query;
            if (!planId) return res.status(400).send('Nenhum plano de colheita selecionado.');

            const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
            if (!harvestPlanDoc.exists) return res.status(404).send('Plano de colheita não encontrado.');

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

    app.get('/reports/colheita/mensal/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'portrait', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_previsao_mensal.pdf`);
        doc.pipe(res);

        try {
            const { planId, generatedBy } = req.query;
            if (!planId) throw new Error('Nenhum plano de colheita selecionado.');

            const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
            if (!harvestPlanDoc.exists) throw new Error('Plano de colheita não encontrado.');

            const harvestPlan = harvestPlanDoc.data();
            const monthlyTotals = {};
            let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
            const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
            const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

            harvestPlan.sequence.forEach(group => {
                if (group.plots.every(p => closedTalhaoIds.has(p.talhaoId))) return;

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

            await generatePdfHeader(doc, `Relatório de Previsão Mensal - ${harvestPlan.frontName}`);

            const rows = Object.keys(monthlyTotals).sort().map(monthKey => {
                const [year, month] = monthKey.split('-');
                const monthName = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
                return [
                    `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`,
                    monthlyTotals[monthKey].toFixed(2)
                ];
            });

            const table = {
                headers: ['Mês/Ano', 'Produção Total (ton)'],
                rows: rows
            };

            await doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
                prepareRow: (row, i) => doc.font('Helvetica').fontSize(9),
            });

            generatePdfFooter(doc, generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF de Previsão Mensal:", error);
            if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            else doc.end();
        }
    });

    app.get('/reports/monitoramento/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_monitoramento.pdf`);
        doc.pipe(res);

        try {
            const { inicio, fim, fazendaCodigo, generatedBy } = req.query;
            let query = db.collection('armadilhas').where('status', '==', 'Coletada');

            if (inicio) query = query.where('dataColeta', '>=', new Date(inicio));
            if (fim) query = query.where('dataColeta', '<=', new Date(fim));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            const title = 'Relatório de Monitoramento de Armadilhas';
            await generatePdfHeader(doc, title);

            if (data.length === 0) {
                doc.text('Nenhuma armadilha coletada encontrada para os filtros selecionados.');
                generatePdfFooter(doc, generatedBy);
                return doc.end();
            }

            const geojsonData = await getShapefileData();
            
            const enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                return {
                    ...trap,
                    fazendaNome: talhaoProps?.NM_IMOVEL || 'N/A',
                    fazendaCodigoShape: talhaoProps?.CD_FAZENDA || 'N/A',
                    talhaoNome: talhaoProps?.CD_TALHAO || 'N/A'
                };
            });

            let finalData = enrichedData;
            if (fazendaCodigo) {
                finalData = enrichedData.filter(d => d.fazendaCodigoShape === fazendaCodigo);
            }

            const table = {
                headers: ['Fazenda', 'Talhão', 'Data Instalação', 'Data Coleta', 'Qtd. Mariposas'],
                rows: finalData.map(trap => [
                    `${trap.fazendaCodigoShape} - ${trap.fazendaNome}`,
                    trap.talhaoNome,
                    trap.dataInstalacao.toDate().toLocaleString('pt-BR'),
                    trap.dataColeta.toDate().toLocaleString('pt-BR'),
                    trap.contagemMariposas || 0
                ])
            };

            await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });

            generatePdfFooter(doc, generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF de Monitoramento:", error);
            if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            else doc.end();
        }
    });

    app.get('/reports/armadilhas/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_armadilhas.pdf`);
        doc.pipe(res);

        try {
            const { inicio, fim, fazendaCodigo, generatedBy } = req.query;
            let query = db.collection('armadilhas').where('status', '==', 'Coletada');
            
            if (inicio) query = query.where('dataColeta', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataColeta', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            const title = 'Relatório de Armadilhas Coletadas';

            if (data.length === 0) {
                await generatePdfHeader(doc, title);
                doc.text('Nenhuma armadilha coletada encontrada para os filtros selecionados.');
                generatePdfFooter(doc, generatedBy);
                return doc.end();
            }

            const usersSnapshot = await db.collection('users').get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });

            const geojsonData = await getShapefileData();
            
            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                const dataInstalacao = trap.dataInstalacao.toDate();
                const dataColeta = trap.dataColeta.toDate();
                const diffTime = Math.abs(dataColeta - dataInstalacao);
                const diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return {
                    ...trap,
                    fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                    fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fundoAgricola || 'N/A',
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacaoFmt: dataInstalacao.toLocaleDateString('pt-BR'),
                    dataColetaFmt: dataColeta.toLocaleDateString('pt-BR'),
                    diasEmCampo: diasEmCampo,
                    instaladoPorNome: usersMap[trap.instaladoPor] || 'Desconhecido',
                    coletadoPorNome: usersMap[trap.coletadoPor] || 'Desconhecido',
                };
            });

            if (fazendaCodigo) {
                const farm = await db.collection('fazendas').where('code', '==', fazendaCodigo).limit(1).get();
                if (!farm.empty) {
                    const farmName = farm.docs[0].data().name;
                    enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
                } else {
                    enrichedData = [];
                }
            }

            await generatePdfHeader(doc, title);

            const table = {
                headers: ['Fundo Agrícola', 'Fazenda', 'Talhão', 'Data Inst.', 'Data Coleta', 'Dias Campo', 'Qtd. Mariposas', 'Instalado Por', 'Coletado Por', 'Obs.'],
                rows: enrichedData.map(trap => [
                    trap.fundoAgricola,
                    trap.fazendaNome,
                    trap.talhaoNome,
                    trap.dataInstalacaoFmt,
                    trap.dataColetaFmt,
                    trap.diasEmCampo,
                    trap.contagemMariposas || 0,
                    trap.instaladoPorNome,
                    trap.coletadoPorNome,
                    trap.observacoes || ''
                ])
            };

            await doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
                prepareRow: () => doc.font('Helvetica').fontSize(8),
            });

            generatePdfFooter(doc, generatedBy);
            doc.end();

        } catch (error) {
            console.error("Erro ao gerar PDF de Armadilhas:", error);
            if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            else doc.end();
        }
    });

    app.get('/reports/armadilhas/csv', async (req, res) => {
        try {
            const { inicio, fim, fazendaCodigo } = req.query;
            let query = db.collection('armadilhas').where('status', '==', 'Coletada');
            
            if (inicio) query = query.where('dataColeta', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataColeta', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

            const usersSnapshot = await db.collection('users').get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });

            const geojsonData = await getShapefileData();

            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                const dataInstalacao = trap.dataInstalacao.toDate();
                const dataColeta = trap.dataColeta.toDate();
                const diffTime = Math.abs(dataColeta - dataInstalacao);
                const diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return {
                    fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fundoAgricola || 'N/A',
                    fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacao: dataInstalacao.toLocaleDateString('pt-BR'),
                    dataColeta: dataColeta.toLocaleDateString('pt-BR'),
                    diasEmCampo: diasEmCampo,
                    contagemMariposas: trap.contagemMariposas || 0,
                    instaladoPor: usersMap[trap.instaladoPor] || 'Desconhecido',
                    coletadoPor: usersMap[trap.coletadoPor] || 'Desconhecido',
                    observacoes: trap.observacoes || ''
                };
            });
            
            if (fazendaCodigo) {
                const farm = await db.collection('fazendas').where('code', '==', fazendaCodigo).limit(1).get();
                if (!farm.empty) {
                    const farmName = farm.docs[0].data().name;
                    enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
                } else {
                    enrichedData = [];
                }
            }

            const filePath = path.join(os.tmpdir(), `armadilhas_report_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'fundoAgricola', title: 'Fundo Agrícola' },
                    { id: 'fazendaNome', title: 'Fazenda' },
                    { id: 'talhaoNome', title: 'Talhão' },
                    { id: 'dataInstalacao', title: 'Data Instalação' },
                    { id: 'dataColeta', title: 'Data Coleta' },
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


    app.get('/reports/armadilhas-ativas/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_armadilhas_instaladas.pdf`);
        doc.pipe(res);

        try {
            const { inicio, fim, fazendaCodigo, generatedBy } = req.query;
            let query = db.collection('armadilhas').where('status', '==', 'Ativa');
            
            if (inicio) query = query.where('dataInstalacao', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataInstalacao', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            const title = 'Relatório de Armadilhas Instaladas (Ativas)';

            if (data.length === 0) {
                await generatePdfHeader(doc, title);
                doc.text('Nenhuma armadilha ativa encontrada para os filtros selecionados.');
                generatePdfFooter(doc, generatedBy);
                return doc.end();
            }

            const usersSnapshot = await db.collection('users').get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });
            
            const geojsonData = await getShapefileData();

            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                const dataInstalacao = trap.dataInstalacao.toDate();
                const diffTime = Math.abs(new Date() - dataInstalacao);
                const diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const previsaoRetirada = new Date(dataInstalacao);
                previsaoRetirada.setDate(previsaoRetirada.getDate() + 7);

                return {
                    ...trap,
                    fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                    fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fundoAgricola || 'N/A',
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacaoFmt: dataInstalacao.toLocaleDateString('pt-BR'),
                    previsaoRetiradaFmt: previsaoRetirada.toLocaleDateString('pt-BR'),
                    diasEmCampo: diasEmCampo,
                    instaladoPorNome: usersMap[trap.instaladoPor] || 'Desconhecido',
                };
            });

            if (fazendaCodigo) {
                const farm = await db.collection('fazendas').where('code', '==', fazendaCodigo).limit(1).get();
                if (!farm.empty) {
                    const farmName = farm.docs[0].data().name;
                    enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
                } else {
                    enrichedData = [];
                }
            }

            await generatePdfHeader(doc, title);

            const table = {
                headers: ['Fundo Agrícola', 'Fazenda', 'Talhão', 'Data Inst.', 'Previsão Retirada', 'Dias Campo', 'Instalado Por', 'Obs.'],
                rows: enrichedData.map(trap => [
                    trap.fundoAgricola,
                    trap.fazendaNome,
                    trap.talhaoNome,
                    trap.dataInstalacaoFmt,
                    trap.previsaoRetiradaFmt,
                    trap.diasEmCampo,
                    trap.instaladoPorNome,
                    trap.observacoes || ''
                ])
            };

            await doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
                prepareRow: () => doc.font('Helvetica').fontSize(8),
            });

            generatePdfFooter(doc, generatedBy);
            doc.end();

        } catch (error) {
            console.error("Erro ao gerar PDF de Armadilhas Ativas:", error);
            if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            else doc.end();
        }
    });

    app.get('/reports/ordem-de-corte/:id/pdf', async (req, res) => {
        const { id } = req.params;
        const { generatedBy } = req.query;
        const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ordem_de_corte_${id.substring(0,6)}.pdf`);
        doc.pipe(res);

        try {
            const orderDoc = await db.collection('cuttingOrders').doc(id).get();
            if (!orderDoc.exists) {
                throw new Error("Ordem de corte não encontrada.");
            }
            const order = orderDoc.data();
            const orderNumber = order.sequentialId ? `OC-${order.sequentialId}` : `OC-${orderDoc.id.substring(0, 8).toUpperCase()}`;
            const frontName = order.frontName || `Frente para ${orderNumber}`;

            // Header
            await generatePdfHeader(doc, 'Ordem de Corte');
            doc.font('Helvetica-Bold').fontSize(16).text(orderNumber, { align: 'right' });
            doc.moveDown(1.5);

            // Details Section
            doc.font('Helvetica-Bold').fontSize(11).text('Detalhes da Operação', { underline: true });
            doc.moveDown(0.5);

            const detailsTable = {
                headers: [], // No headers for this layout
                rows: [
                    ['Frente de Colheita:', frontName, 'Status:', { text: order.status, font: 'Helvetica-Bold' }],
                    ['Fazenda:', `${order.fazendaCodigo} - ${order.fazendaName}`, 'Período de Corte:', `${new Date(order.startDate + 'T03:00:00Z').toLocaleDateString('pt-BR')} a ${new Date(order.endDate + 'T03:00:00Z').toLocaleDateString('pt-BR')}`],
                    ['ATR Previsto:', order.atr, 'Produção Estimada:', `${formatNumber(order.totalProducao || 0)} ton`],
                    ['Área Total:', `${formatNumber(order.totalArea || 0)} ha`, '', '']
                ]
            };
            await doc.table(detailsTable, { hideHeader: true });
            doc.moveDown(2);

            // Plots Section
            doc.font('Helvetica-Bold').fontSize(11).text('Talhões Incluídos', { underline: true });
            doc.moveDown(0.5);

            const plotsTable = {
                headers: ['Nome do Talhão'],
                rows: (order.plots || []).map(p => [p.talhaoName])
            };
            await doc.table(plotsTable, {
                prepareHeader: () => doc.font('Helvetica-Bold'),
                prepareRow: (row, i) => doc.font('Helvetica'),
            });
            doc.moveDown(2);

            // Footer
            generatePdfFooter(doc, generatedBy);
            doc.end();

        } catch (error) {
            console.error("Erro ao gerar PDF da Ordem de Corte:", error);
            if (!res.headersSent) {
                doc.fontSize(12).text(`Erro ao gerar o relatório: ${error.message}`);
                doc.end();
            }
        }
    });

    app.get('/reports/armadilhas-ativas/csv', async (req, res) => {
        try {
            const { inicio, fim, fazendaCodigo } = req.query;
            let query = db.collection('armadilhas').where('status', '==', 'Ativa');
            
            if (inicio) query = query.where('dataInstalacao', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataInstalacao', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

            const usersSnapshot = await db.collection('users').get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });

            const geojsonData = await getShapefileData();

            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                const dataInstalacao = trap.dataInstalacao.toDate();
                const diffTime = Math.abs(new Date() - dataInstalacao);
                const diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const previsaoRetirada = new Date(dataInstalacao);
                previsaoRetirada.setDate(previsaoRetirada.getDate() + 7);

                return {
                    fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fundoAgricola || 'N/A',
                    fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacao: dataInstalacao.toLocaleDateString('pt-BR'),
                    previsaoRetirada: previsaoRetirada.toLocaleDateString('pt-BR'),
                    diasEmCampo: diasEmCampo,
                    instaladoPor: usersMap[trap.instaladoPor] || 'Desconhecido',
                    observacoes: trap.observacoes || ''
                };
            });
            
            if (fazendaCodigo) {
                const farm = await db.collection('fazendas').where('code', '==', fazendaCodigo).limit(1).get();
                if (!farm.empty) {
                    const farmName = farm.docs[0].data().name;
                    enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
                } else {
                    enrichedData = [];
                }
            }

            const filePath = path.join(os.tmpdir(), `armadilhas_instaladas_report_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'fundoAgricola', title: 'Fundo Agrícola' },
                    { id: 'fazendaNome', title: 'Fazenda' },
                    { id: 'talhaoNome', title: 'Talhão' },
                    { id: 'dataInstalacao', title: 'Data Instalação' },
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

} catch (error) {
    console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
    app.use((req, res) => res.status(500).send('Erro de configuração do servidor.'));
}

app.listen(port, () => {
    console.log(`Servidor de relatórios rodando na porta ${port}`);
});
