// server.js - Backend com Geração de PDF e Upload de Shapefile

require('dotenv').config();
const express = require('express');
const { db, storage, admin } = require('./services/firebase');
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

const app = express();
const port = process.env.PORT || 3001;

const corsOptions = {
    origin: 'https://agrovetor.store',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

try {
    const bucket = storage.bucket();
    console.log('Firebase Admin SDK inicializado com sucesso e conectado ao bucket.');

    // --- INICIALIZAÇÃO DA IA (GEMINI) ---
    const geminiApiKey = process.env.GEMINI_API_KEY;
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
    app.post('/upload-shapefile', async (req, res) => {
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
    app.post('/api/upload/historical-report', async (req, res) => {
        const { reportData: originalReportData, companyId } = req.body;
        if (!originalReportData) {
            return res.status(400).json({ message: 'Nenhum dado de relatório foi enviado.' });
        }
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
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
                            companyId: companyId // Adiciona o ID da empresa ao registo
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

    app.post('/api/delete/historical-data', async (req, res) => {
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

    app.post('/api/track', async (req, res) => {
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
                companyId: companyId, // Adiciona o ID da empresa
                location: new admin.firestore.GeoPoint(parseFloat(latitude), parseFloat(longitude)),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            res.status(200).send({ message: 'Localização registrada com sucesso.' });
        } catch (error) {
            console.error("Erro ao registrar localização:", error);
            res.status(500).json({ message: 'Erro no servidor ao registrar localização.' });
        }
    });

    app.get('/api/history', async (req, res) => {
        const { userId, startDate, endDate, companyId } = req.query;

        if (!userId || !startDate || !endDate) {
            return res.status(400).json({ message: 'userId, startDate e endDate são obrigatórios.' });
        }
        if (!companyId) {
            return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
        }

        try {
            const query = db.collection('locationHistory')
                .where('companyId', '==', companyId) // Adiciona filtro de empresa
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

            // Ordena os resultados manualmente pelo timestamp
            history.sort((a, b) => a.timestamp - b.timestamp);

            res.status(200).json(history);
        } catch (error) {
            console.error("Erro ao buscar histórico de localização:", error);
            res.status(500).json({ message: 'Erro no servidor ao buscar histórico.' });
        }
    });

    // --- FUNÇÕES AUXILIARES ---

    const formatNumber = (num) => {
        if (typeof num !== 'number' || isNaN(num)) {
            return num;
        }
        return parseFloat(num.toFixed(2)).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const sortByDateAndFazenda = (a, b) => {
        const dateComparison = new Date(a.data) - new Date(b.data);
        if (dateComparison !== 0) {
            return dateComparison;
        }
        // Fallback para o código da fazenda (ordem numérica)
        const codeA = parseInt(a.codigo, 10) || 0;
        const codeB = parseInt(b.codigo, 10) || 0;
        return codeA - codeB;
    };

    const safeToDate = (dateInput) => {
        if (!dateInput) return null;
        // Se for um objeto Timestamp do Firestore, use toDate()
        if (dateInput && typeof dateInput.toDate === 'function') {
            return dateInput.toDate();
        }
        // Se já for um objeto Date do JS
        if (dateInput instanceof Date) {
            return dateInput;
        }
        // Se for uma string ou número, tenta criar uma nova Data
        const date = new Date(dateInput);
        if (!isNaN(date.getTime())) {
            return date;
        }
        return null; // Retorna nulo se não conseguir converter
    };

    const getFilteredData = async (collectionName, filters) => {
        // Validação de Segurança: Garante que o companyId foi fornecido.
        if (!filters.companyId) {
            console.error("Tentativa de acesso a getFilteredData sem companyId.");
            return []; // Retorna vazio para evitar qualquer vazamento de dados.
        }

        // A consulta agora busca APENAS os dados da empresa especificada.
        let query = db.collection(collectionName).where('companyId', '==', filters.companyId);

        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });
        if (filters.inicio) {
            data = data.filter(d => d.data >= filters.inicio);
        }
        if (filters.fim) {
            data = data.filter(d => d.data <= filters.fim);
        }

        let farmCodesToFilter = null;

        if (filters.fazendaCodigo && filters.fazendaCodigo !== '') {
            farmCodesToFilter = [filters.fazendaCodigo];
        } else if (filters.tipos) {
            const selectedTypes = filters.tipos.split(',').filter(t => t);
            if (selectedTypes.length > 0) {
                // Para fazendas, também precisamos considerar as antigas sem companyId
                const companyFarmsQuery = db.collection('fazendas').where('companyId', '==', filters.companyId);
                const legacyFarmsQuery = db.collection('fazendas').where('companyId', '==', null);
                
                const [companyFarmsSnapshot, legacyFarmsSnapshot] = await Promise.all([
                    companyFarmsQuery.get(),
                    legacyFarmsQuery.get()
                ]);

                let allFarms = [];
                companyFarmsSnapshot.forEach(doc => allFarms.push(doc.data()));
                legacyFarmsSnapshot.forEach(doc => allFarms.push(doc.data()));

                const matchingFarmCodes = allFarms
                    .filter(farm => farm.types && farm.types.some(t => selectedTypes.includes(t)))
                    .map(farm => farm.code);

                if (matchingFarmCodes.length > 0) {
                    farmCodesToFilter = matchingFarmCodes;
                } else {
                    return []; // Se o filtro de tipo não retornar nenhuma fazenda, não há dados a serem mostrados.
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
        
        return filteredData.sort(sortByDateAndFazenda);
    };

    const generatePdfHeader = async (doc, title, companyId) => {
        try {
            let logoBase64 = null;
            // 1. Tenta carregar o logo da empresa específica.
            if (companyId) {
                const configDoc = await db.collection('config').doc(companyId).get();
                if (configDoc.exists && configDoc.data().logoBase64) {
                    logoBase64 = configDoc.data().logoBase64;
                }
            }

            // 2. Se não houver logo específico, busca o da empresa mais antiga (principal).
            if (!logoBase64) {
                const oldestCompanyQuery = await db.collection('companies').orderBy('createdAt', 'asc').limit(1).get();
                if (!oldestCompanyQuery.empty) {
                    const oldestCompanyId = oldestCompanyQuery.docs[0].id;
                    const defaultConfigDoc = await db.collection('config').doc(oldestCompanyId).get();
                    if (defaultConfigDoc.exists && defaultConfigDoc.data().logoBase64) {
                        logoBase64 = defaultConfigDoc.data().logoBase64;
                    }
                }
            }

            // 3. Se um logo foi encontrado (específico ou padrão), desenha-o.
            if (logoBase64) {
                doc.image(logoBase64, doc.page.margins.left, 15, { width: 40 });
            }

        } catch (error) {
            console.error("Não foi possível carregar o logotipo:", error.message);
        }
        
        doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
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

    const drawRow = (doc, rowData, y, isHeader = false, isFooter = false, customWidths, textPadding = 5, rowHeight = 18, columnHeadersConfig = [], isClosed = false) => {
        const startX = doc.page.margins.left;
        const fontSize = 8;
        
        if (isHeader || isFooter) {
            doc.font('Helvetica-Bold').fontSize(fontSize);
            doc.rect(startX, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
            doc.fillColor('black');
        } else {
            doc.font('Helvetica').fontSize(fontSize);
            if (isClosed) {
                doc.rect(startX, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, rowHeight).fillAndStroke('#f0f0f0', '#f0f0f0');
                doc.fillColor('#999');
            }
        }
        
        let currentX = startX;
        let maxRowHeight = rowHeight;

        rowData.forEach((cell, i) => {
            let columnId = null;
            if (Array.isArray(columnHeadersConfig) && i < columnHeadersConfig.length && columnHeadersConfig[i]) {
                columnId = columnHeadersConfig[i].id;
            }

            const cellWidth = customWidths[i] - (textPadding * 2);
            const textOptions = { width: cellWidth, align: 'left', continued: false };

            if (['talhoes', 'variedade'].includes(columnId)) {
                textOptions.lineBreak = true;
                textOptions.lineGap = 2;
            } else {
                textOptions.lineBreak = false;
            }
            
            const textHeight = doc.heightOfString(String(cell), textOptions);
            maxRowHeight = Math.max(maxRowHeight, textHeight + textPadding * 2);

            doc.text(String(cell), currentX + textPadding, y + textPadding, textOptions);
            currentX += customWidths[i];
        });
        return y + maxRowHeight;
    };

    const checkPageBreak = async (doc, y, title, neededSpace = 40) => {
        if (y > doc.page.height - doc.page.margins.bottom - neededSpace) {
            doc.addPage();
            return await generatePdfHeader(doc, title);
        }
        return y;
    };

    // --- [NOVO] FUNÇÕES AUXILIARES PARA MONITORAMENTO ---
    let cachedShapefiles = {}; // Alterado para um objeto para cache por empresa
    let lastFetchTimes = {};   // Alterado para um objeto para cache por empresa

    const getShapefileData = async (companyId) => {
        if (!companyId) {
            throw new Error('O ID da empresa é obrigatório para obter dados do shapefile.');
        }
        const now = new Date();
        // Cache em memória por 5 minutos para evitar downloads repetidos por empresa
        if (cachedShapefiles[companyId] && lastFetchTimes[companyId] && (now - lastFetchTimes[companyId] < 5 * 60 * 1000)) {
            return cachedShapefiles[companyId];
        }

        const shapefileDoc = await db.collection('config').doc(companyId).get();
        if (!shapefileDoc.exists || !shapefileDoc.data().shapefileURL) {
            // Não lança um erro, apenas retorna nulo para que o relatório não quebre se o shapefile não existir.
            console.warn(`Shapefile não encontrado para a empresa ${companyId}.`);
            return null;
        }
        const url = shapefileDoc.data().shapefileURL;
        
        const response = await axios({ url, responseType: 'arraybuffer' });
        const geojson = await shp(response.data);
        
        cachedShapefiles[companyId] = geojson;
        lastFetchTimes[companyId] = now;
        return geojson;
    };

    const findTalhaoForTrap = (trap, geojsonData) => {
        const point = [trap.longitude, trap.latitude];
        for (const feature of geojsonData.features) {
            if (feature.geometry) {
                if (feature.geometry.type === 'Polygon') {
                    if (pointInPolygon(point, feature.geometry.coordinates[0])) {
                        return feature.properties;
                    }
                } else if (feature.geometry.type === 'MultiPolygon') {
                    for (const polygon of feature.geometry.coordinates) {
                        if (pointInPolygon(point, polygon[0])) {
                            return feature.properties;
                        }
                    }
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

    const getPlantioData = async (filters) => {
        if (!filters.companyId) {
            console.error("Attempt to access getPlantioData without companyId.");
            return [];
        }

        let query = db.collection('apontamentosPlantio').where('companyId', '==', filters.companyId);

        if (filters.inicio) {
            query = query.where('date', '>=', filters.inicio);
        }
        if (filters.fim) {
            query = query.where('date', '<=', filters.fim);
        }
        if (filters.frenteId) {
            query = query.where('frenteDePlantioId', '==', filters.frenteId);
        }
        if (filters.cultura) {
            query = query.where('culture', '==', filters.cultura);
        }

        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });

        let farmCodesToFilter = null;
        if (filters.tipos) {
            const selectedTypes = filters.tipos.split(',').filter(t => t);
            if (selectedTypes.length > 0) {
                const farmsQuery = db.collection('fazendas').where('companyId', '==', filters.companyId).where('types', 'array-contains-any', selectedTypes);
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

        if(farmCodesToFilter){
            data = data.filter(d => farmCodesToFilter.includes(d.farmCode));
        }


        return data.sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    app.get('/reports/plantio/fazenda/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_fazenda.pdf');
        doc.pipe(res);

        try {
            const filters = req.query;
            const data = await getPlantioData(filters);
            const title = 'Relatório de Plantio por Fazenda';

            if (data.length === 0) {
                await generatePdfHeader(doc, title, filters.companyId);
                doc.text('Nenhum dado encontrado para os filtros selecionados.');
                generatePdfFooter(doc, filters.generatedBy);
                doc.end();
                return;
            }

            let currentY = await generatePdfHeader(doc, title, filters.companyId);

            const headers = ['Data', 'Fazenda', 'Prestador', 'Matrícula do Líder', 'Variedade Plantada', 'Talhão', 'Área Plant. (ha)', 'Chuva (mm)', 'Obs'];
            const columnWidths = [60, 200, 100, 80, 100, 60, 60, 60, 100];

            currentY = drawRow(doc, headers, currentY, true, false, columnWidths);

            let totalAreaGeral = 0;
            const dataByFarm = {};

            data.forEach(item => {
                item.records.forEach(record => {
                    if (!dataByFarm[item.farmName]) {
                        dataByFarm[item.farmName] = [];
                    }
                    dataByFarm[item.farmName].push({ ...item, ...record });
                });
            });

            for (const farmName of Object.keys(dataByFarm).sort()) {
                let totalAreaFarm = 0;
                const farmRecords = dataByFarm[farmName];
                farmRecords.sort((a,b) => new Date(a.date) - new Date(b.date));

                for (const record of farmRecords) {
                    currentY = await checkPageBreak(doc, currentY, title);
                    const row = [
                        record.date,
                        `${record.farmCode} - ${record.farmName}`,
                        record.provider,
                        record.leaderId,
                        record.variedade,
                        record.talhao,
                        formatNumber(record.area),
                        record.chuva || '',
                        record.obs || ''
                    ];
                    currentY = drawRow(doc, row, currentY, false, false, columnWidths);
                    totalAreaFarm += record.area;
                }

                currentY = await checkPageBreak(doc, currentY, title);
                const subtotalRow = ['', '', '', '', 'SUB TOTAL', '', formatNumber(totalAreaFarm), '', ''];
                currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidths);
                currentY += 10;
                totalAreaGeral += totalAreaFarm;
            }

            currentY = await checkPageBreak(doc, currentY, title);
            const totalRow = ['', '', '', '', 'TOTAL GERAL', '', formatNumber(totalAreaGeral), '', ''];
            drawRow(doc, totalRow, currentY, false, true, columnWidths);

            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF de Plantio por Fazenda:", error);
            if (!res.headersSent) {
                res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            } else {
                doc.end();
            }
        }
    });

    app.get('/reports/plantio/fazenda/csv', async (req, res) => {
        try {
            const filters = req.query;
            const data = await getPlantioData(filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `plantio_fazenda_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'date', title: 'Data' },
                    { id: 'farmName', title: 'Fazenda' },
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

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Plantio por Fazenda:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    const getClimaData = async (filters) => {
        if (!filters.companyId) {
            console.error("Attempt to access getClimaData without companyId.");
            return [];
        }

        let query = db.collection('clima').where('companyId', '==', filters.companyId);

        if (filters.inicio) {
            query = query.where('data', '>=', filters.inicio);
        }
        if (filters.fim) {
            query = query.where('data', '<=', filters.fim);
        }

        const snapshot = await query.get();
        let data = [];
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });

        if (filters.fazendaId) {
            data = data.filter(d => d.fazendaId === filters.fazendaId);
        }

        return data.sort((a, b) => new Date(a.data) - new Date(b.data));
    };

    app.get('/reports/clima/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=relatorio_climatologico.pdf');
        doc.pipe(res);

        try {
            const filters = req.query;
            const data = await getClimaData(filters);
            const title = 'Relatório Climatológico';

            if (data.length === 0) {
                await generatePdfHeader(doc, title, filters.companyId);
                doc.text('Nenhum dado encontrado para os filtros selecionados.');
                generatePdfFooter(doc, filters.generatedBy);
                doc.end();
                return;
            }

            let currentY = await generatePdfHeader(doc, title, filters.companyId);

            const headers = ['Data', 'Fazenda', 'Talhão', 'Temp. Máx (°C)', 'Temp. Mín (°C)', 'Umidade (%)', 'Pluviosidade (mm)', 'Vento (km/h)', 'Observações'];
            const columnWidths = [60, 140, 80, 80, 80, 80, 80, 80, 100];

            currentY = drawRow(doc, headers, currentY, true, false, columnWidths);

            let totalPluviosidade = 0;
            let totalTempMax = 0;
            let totalTempMin = 0;
            let totalUmidade = 0;
            let totalVento = 0;
            let count = 0;

            for (const item of data) {
                currentY = await checkPageBreak(doc, currentY, title);
                const row = [
                    item.data,
                    item.fazendaNome,
                    item.talhaoNome,
                    formatNumber(item.tempMax),
                    formatNumber(item.tempMin),
                    formatNumber(item.umidade),
                    formatNumber(item.pluviosidade),
                    formatNumber(item.vento),
                    item.obs || ''
                ];
                currentY = drawRow(doc, row, currentY, false, false, columnWidths);

                totalPluviosidade += item.pluviosidade || 0;
                totalTempMax += item.tempMax || 0;
                totalTempMin += item.tempMin || 0;
                totalUmidade += item.umidade || 0;
                totalVento += item.vento || 0;
                count++;
            }

            currentY = await checkPageBreak(doc, currentY, title);
            const summaryRow = [
                'TOTAIS/MÉDIAS', '', '',
                formatNumber(totalTempMax / count),
                formatNumber(totalTempMin / count),
                formatNumber(totalUmidade / count),
                formatNumber(totalPluviosidade),
                formatNumber(totalVento / count),
                ''
            ];
            drawRow(doc, summaryRow, currentY, false, true, columnWidths);

            // [INÍCIO] LÓGICA PARA ADICIONAR GRÁFICOS AO PDF
            if (filters.charts && filters.charts.length > '[]'.length) { // Check for non-empty array string
                try {
                    const charts = JSON.parse(filters.charts);
                    if (Array.isArray(charts) && charts.length > 0) {

                        // Adiciona uma nova página para o anexo de gráficos
                        doc.addPage({ layout: 'landscape', margin: 30 });
                        let chartY = await generatePdfHeader(doc, 'Anexo - Gráficos Climatológicos', filters.companyId);

                        const chartWidth = 450;
                        const chartHeight = 200; // Altura para cada gráfico
                        const marginX = (doc.page.width - chartWidth) / 2; // Centraliza
                        const spaceBetween = 20;

                        for (let i = 0; i < charts.length; i++) {
                            const chartImage = charts[i];

                            // Adiciona uma nova página a cada 2 gráficos
                            if (i > 0 && i % 2 === 0) {
                                doc.addPage({ layout: 'landscape', margin: 30 });
                                chartY = await generatePdfHeader(doc, 'Anexo - Gráficos Climatológicos', filters.companyId);
                            }

                            const yPos = (i % 2 === 0) ? chartY : chartY + chartHeight + spaceBetween;

                            // Verifica se há espaço, senão cria nova página (segurança)
                            if (yPos + chartHeight > doc.page.height - doc.page.margins.bottom) {
                                doc.addPage({ layout: 'landscape', margin: 30 });
                                chartY = await generatePdfHeader(doc, 'Anexo - Gráficos Climatológicos', filters.companyId);
                                doc.image(chartImage, marginX, chartY, {
                                    fit: [chartWidth, chartHeight],
                                    align: 'center'
                                });
                            } else {
                                doc.image(chartImage, marginX, yPos, {
                                    fit: [chartWidth, chartHeight],
                                    align: 'center'
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error("Erro ao processar e adicionar imagens de gráficos ao PDF:", e);
                    // A geração do PDF continua mesmo se os gráficos falharem.
                }
            }
            // [FIM] LÓGICA PARA ADICIONAR GRÁFICOS AO PDF


            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF Climatológico:", error);
            if (!res.headersSent) {
                res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            } else {
                doc.end();
            }
        }
    });

    app.get('/reports/clima/csv', async (req, res) => {
        try {
            const filters = req.query;
            const data = await getClimaData(filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `clima_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'data', title: 'Data' },
                    { id: 'fazendaNome', title: 'Fazenda' },
                    { id: 'talhaoNome', title: 'Talhão' },
                    { id: 'tempMax', title: 'Temperatura Máxima (°C)' },
                    { id: 'tempMin', title: 'Temperatura Mínima (°C)' },
                    { id: 'umidade', title: 'Umidade Relativa (%)' },
                    { id: 'pluviosidade', title: 'Pluviosidade (mm)' },
                    { id: 'vento', title: 'Velocidade do Vento (km/h)' },
                    { id: 'obs', title: 'Observações' }
                ]
            });

            await csvWriter.writeRecords(data);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Clima:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    app.get('/reports/plantio/talhao/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=relatorio_plantio_talhao.pdf');
        doc.pipe(res);

        try {
            const filters = req.query;
            const data = await getPlantioData(filters);
            const title = 'Relatório de Plantio por Talhão';

            if (data.length === 0) {
                await generatePdfHeader(doc, title, filters.companyId);
                doc.text('Nenhum dado encontrado para os filtros selecionados.');
                generatePdfFooter(doc, filters.generatedBy);
                doc.end();
                return;
            }

            let currentY = await generatePdfHeader(doc, title, filters.companyId);

            const headers = ['Data', 'Fazenda', 'Talhão', 'Variedade Plantada', 'Prestador', 'Área Plant. (ha)', 'Chuva (mm)', 'Obs'];
            const columnWidths = [60, 220, 100, 100, 100, 60, 60, 100];

            currentY = drawRow(doc, headers, currentY, true, false, columnWidths);

            let totalAreaGeral = 0;
            const allRecords = [];
            data.forEach(item => {
                item.records.forEach(record => {
                    allRecords.push({ ...item, ...record });
                });
            });

            allRecords.sort((a, b) => {
                const farmNameA = `${a.farmCode} - ${a.farmName}`;
                const farmNameB = `${b.farmCode} - ${b.farmName}`;
                if (farmNameA < farmNameB) return -1;
                if (farmNameA > farmNameB) return 1;
                return new Date(a.date) - new Date(b.date);
            });

            for (const record of allRecords) {
                    currentY = await checkPageBreak(doc, currentY, title);
                    const row = [
                        record.date,
                        `${record.farmCode} - ${record.farmName}`,
                        record.talhao,
                        record.variedade,
                        record.provider,
                        formatNumber(record.area),
                        record.chuva || '',
                        record.obs || ''
                    ];
                    currentY = drawRow(doc, row, currentY, false, false, columnWidths);
                    totalAreaGeral += record.area;
            }

            currentY = await checkPageBreak(doc, currentY, title);
            const totalRow = ['', '', '', '', '', 'Total Geral', formatNumber(totalAreaGeral), '', ''];
            drawRow(doc, totalRow, currentY, false, true, columnWidths);

            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
        } catch (error) {
            console.error("Erro ao gerar PDF de Plantio por Talhão:", error);
            if (!res.headersSent) {
                res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            } else {
                doc.end();
            }
        }
    });

    app.get('/reports/plantio/talhao/csv', async (req, res) => {
        try {
            const filters = req.query;
            const data = await getPlantioData(filters);
            if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

            const filePath = path.join(os.tmpdir(), `plantio_talhao_${Date.now()}.csv`);
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: [
                    { id: 'date', title: 'Data' },
                    { id: 'farmName', title: 'Fazenda' },
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

            await csvWriter.writeRecords(records);
            res.download(filePath);
        } catch (error) {
            console.error("Erro ao gerar CSV de Plantio por Talhão:", error);
            res.status(500).send('Erro ao gerar relatório.');
        }
    });

    // --- ROTAS DE RELATÓRIOS ---
    const reportRoutes = require('./routes/reportRoutes');
    app.use('/reports', reportRoutes);


    app.get('/reports/monitoramento/pdf', async (req, res) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_monitoramento.pdf`);
        doc.pipe(res);

        try {
            const { inicio, fim, fazendaCodigo, generatedBy, companyId } = req.query;
            if (!companyId) {
                // Renderiza um PDF de erro se o companyId não for fornecido
                await generatePdfHeader(doc, 'Erro');
                doc.text('O ID da empresa não foi fornecido.');
                doc.end();
                return;
            }
            let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Coletada');

            if (inicio) query = query.where('dataColeta', '>=', new Date(inicio));
            if (fim) query = query.where('dataColeta', '<=', new Date(fim));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            const title = 'Relatório de Monitoramento de Armadilhas';
            let currentY = await generatePdfHeader(doc, title, companyId);

            if (data.length === 0) {
                doc.text('Nenhuma armadilha coletada encontrada para os filtros selecionados.');
                generatePdfFooter(doc, generatedBy);
                return doc.end();
            }

            const geojsonData = await getShapefileData(companyId);
            
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

            const headers = ['Fazenda', 'Talhão', 'Data Instalação', 'Data Coleta', 'Qtd. Mariposas'];
            const columnWidths = [200, 100, 120, 120, 120];
            const rowHeight = 18;
            const textPadding = 5;

            currentY = drawRow(doc, headers, currentY, true, false, columnWidths, textPadding, rowHeight);

            for (const trap of finalData) {
                currentY = await checkPageBreak(doc, currentY, title);
                const rowData = [
                    `${trap.fazendaCodigoShape} - ${trap.fazendaNome}`,
                    trap.talhaoNome,
                    trap.dataInstalacao.toDate().toLocaleString('pt-BR'),
                    trap.dataColeta.toDate().toLocaleString('pt-BR'),
                    trap.contagemMariposas || 0
                ];
                currentY = drawRow(doc, rowData, currentY, false, false, columnWidths, textPadding, rowHeight);
            }

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
            const { inicio, fim, fazendaCodigo, generatedBy, companyId } = req.query;
            if (!companyId) {
                await generatePdfHeader(doc, 'Erro');
                doc.text('O ID da empresa não foi fornecido.');
                doc.end();
                return;
            }
            let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Coletada');
            
            if (inicio) query = query.where('dataColeta', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataColeta', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            const title = 'Relatório de Armadilhas Coletadas';

            if (data.length === 0) {
                await generatePdfHeader(doc, title, companyId);
                doc.text('Nenhuma armadilha coletada encontrada para os filtros selecionados.');
                generatePdfFooter(doc, generatedBy);
                return doc.end();
            }

            const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });

            const geojsonData = await getShapefileData(companyId);
            
            let enrichedData = data.map(trap => {
                const talhaoProps = geojsonData ? findTalhaoForTrap(trap, geojsonData) : null;
                const dataInstalacao = safeToDate(trap.dataInstalacao);
                const dataColeta = safeToDate(trap.dataColeta);

                let diasEmCampo = 'N/A';
                if (dataInstalacao && dataColeta) {
                    const diffTime = Math.abs(dataColeta - dataInstalacao);
                    diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                const fazendaNome = findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A';
                const fundoAgricola = findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fazendaCode || 'N/A';
                const talhaoNome = findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A';


                return {
                    ...trap,
                    fazendaNome: fazendaNome,
                    fundoAgricola: fundoAgricola,
                    talhaoNome: talhaoNome,
                    dataInstalacaoFmt: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                    dataColetaFmt: dataColeta ? dataColeta.toLocaleDateString('pt-BR') : 'N/A',
                    diasEmCampo: diasEmCampo,
                    instaladoPorNome: usersMap[trap.instaladoPor] || 'Desconhecido',
                    coletadoPorNome: usersMap[trap.coletadoPor] || 'Desconhecido',
                };
            });

            if (fazendaCodigo) {
                const farmQuery = db.collection('fazendas').where('companyId', '==', companyId).where('code', '==', fazendaCodigo).limit(1);
                const farm = await farmQuery.get();
                if (!farm.empty) {
                    const farmName = farm.docs[0].data().name;
                    enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
                } else {
                    enrichedData = [];
                }
            }

            let currentY = await generatePdfHeader(doc, title);

            const headers = ['Fundo Agrícola', 'Fazenda', 'Talhão', 'Data Inst.', 'Data Coleta', 'Dias Campo', 'Qtd. Mariposas', 'Instalado Por', 'Coletado Por', 'Obs.'];
            const columnWidths = [90, 120, 60, 65, 65, 60, 75, 80, 80, 87];
            const rowHeight = 18;
            const textPadding = 5;

            currentY = drawRow(doc, headers, currentY, true, false, columnWidths, textPadding, rowHeight);

            for (const trap of enrichedData) {
                currentY = await checkPageBreak(doc, currentY, title);
                const rowData = [
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
                ];
                currentY = drawRow(doc, rowData, currentY, false, false, columnWidths, textPadding, rowHeight);
            }

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

            const geojsonData = await getShapefileData(companyId);

            let enrichedData = data.map(trap => {
                const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                const dataInstalacao = safeToDate(trap.dataInstalacao);
                const dataColeta = safeToDate(trap.dataColeta);

                let diasEmCampo = 'N/A';
                if (dataInstalacao && dataColeta) {
                    const diffTime = Math.abs(dataColeta - dataInstalacao);
                    diasEmCampo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                return {
                    fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fundoAgricola || 'N/A',
                    fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
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
                const farmQuery = db.collection('fazendas').where('companyId', '==', companyId).where('code', '==', fazendaCodigo).limit(1);
                const farm = await farmQuery.get();
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
            const { inicio, fim, fazendaCodigo, generatedBy, companyId } = req.query;
            if (!companyId) {
                await generatePdfHeader(doc, 'Erro');
                doc.text('O ID da empresa não foi fornecido.');
                doc.end();
                return;
            }
            let query = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Ativa');
            
            if (inicio) query = query.where('dataInstalacao', '>=', admin.firestore.Timestamp.fromDate(new Date(inicio + 'T00:00:00')));
            if (fim) query = query.where('dataInstalacao', '<=', admin.firestore.Timestamp.fromDate(new Date(fim + 'T23:59:59')));

            const snapshot = await query.get();
            let data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

            const title = 'Relatório de Armadilhas Instaladas (Ativas)';

            if (data.length === 0) {
                await generatePdfHeader(doc, title, companyId);
                doc.text('Nenhuma armadilha ativa encontrada para os filtros selecionados.');
                generatePdfFooter(doc, generatedBy);
                return doc.end();
            }

            const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
            const usersMap = {};
            usersSnapshot.forEach(doc => {
                usersMap[doc.id] = doc.data().username || doc.data().email;
            });
            
            const geojsonData = await getShapefileData(companyId);

            let enrichedData = data.map(trap => {
                const talhaoProps = geojsonData ? findTalhaoForTrap(trap, geojsonData) : null;
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

                const fazendaNome = findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A';
                const fundoAgricola = findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fazendaCode || 'N/A';
                const talhaoNome = findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A';


                return {
                    ...trap,
                    fazendaNome: fazendaNome,
                    fundoAgricola: fundoAgricola,
                    talhaoNome: talhaoNome,
                    dataInstalacaoFmt: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                    previsaoRetiradaFmt: previsaoRetiradaFmt,
                    diasEmCampo: diasEmCampo,
                    instaladoPorNome: usersMap[trap.instaladoPor] || 'Desconhecido',
                };
            });

            if (fazendaCodigo) {
                const farmQuery = db.collection('fazendas').where('companyId', '==', companyId).where('code', '==', fazendaCodigo).limit(1);
                const farm = await farmQuery.get();
                if (!farm.empty) {
                    const farmName = farm.docs[0].data().name;
                    enrichedData = enrichedData.filter(d => d.fazendaNome === farmName);
                } else {
                    enrichedData = [];
                }
            }

            let currentY = await generatePdfHeader(doc, title, companyId);

            const headers = ['Fundo Agrícola', 'Fazenda', 'Talhão', 'Data Inst.', 'Previsão Retirada', 'Dias Campo', 'Instalado Por', 'Obs.'];
            const columnWidths = [90, 140, 80, 80, 80, 65, 90, 157];
            const rowHeight = 18;
            const textPadding = 5;

            currentY = drawRow(doc, headers, currentY, true, false, columnWidths, textPadding, rowHeight);

            for (const trap of enrichedData) {
                currentY = await checkPageBreak(doc, currentY, title);
                const rowData = [
                    trap.fundoAgricola,
                    trap.fazendaNome,
                    trap.talhaoNome,
                    trap.dataInstalacaoFmt,
                    trap.previsaoRetiradaFmt,
                    trap.diasEmCampo,
                    trap.instaladoPorNome,
                    trap.observacoes || ''
                ];
                currentY = drawRow(doc, rowData, currentY, false, false, columnWidths, textPadding, rowHeight);
            }

            generatePdfFooter(doc, generatedBy);
            doc.end();

        } catch (error) {
            console.error("Erro ao gerar PDF de Armadilhas Ativas:", error);
            if (!res.headersSent) res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
            else doc.end();
        }
    });

    app.get('/reports/armadilhas-ativas/csv', async (req, res) => {
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

            const geojsonData = await getShapefileData(companyId);

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

                return {
                    fundoAgricola: findShapefileProp(talhaoProps, ['FUNDO_AGR']) || trap.fundoAgricola || 'N/A',
                    fazendaNome: findShapefileProp(talhaoProps, ['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) || trap.fazendaNome || 'N/A',
                    talhaoNome: findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A',
                    dataInstalacao: dataInstalacao ? dataInstalacao.toLocaleDateString('pt-BR') : 'N/A',
                    previsaoRetirada: previsaoRetiradaFmt,
                    diasEmCampo: diasEmCampo,
                    instaladoPor: usersMap[trap.instaladoPor] || 'Desconhecido',
                    observacoes: trap.observacoes || ''
                };
            });
            
            if (fazendaCodigo) {
                const farmQuery = db.collection('fazendas').where('companyId', '==', companyId).where('code', '==', fazendaCodigo).limit(1);
                const farm = await farmQuery.get();
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