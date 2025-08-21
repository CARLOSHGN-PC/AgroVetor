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

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        throw new Error('A variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON não está definida.');
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
 
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "agrovetor-v2.appspot.com" // Certifique-se que este é o nome correto do seu bucket
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

    // ROTA PARA INGESTÃO INTELIGENTE DE RELATÓRIO HISTÓRICO
    app.post('/api/upload/historical-report', async (req, res) => {
        if (!model) {
            return res.status(503).json({ message: "Esta funcionalidade de IA está temporariamente desativada." });
        }
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
                // 0x50, 0x4B are the hex codes for 'P' and 'K'
                if (buffer && buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
                    const workbook = xlsx.read(buffer, { type: 'buffer' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];

                    // Converte a planilha para um array de arrays
                    const dataAsJson = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                    // Constrói a string CSV com ';' como separador para manter a consistência
                    reportText = dataAsJson.map(row =>
                        row.map(cell => {
                            const cellStr = String(cell);
                            // Se a célula contém ';' ou '"', a envolve em aspas duplas
                            if (cellStr.includes(';') || cellStr.includes('"')) {
                                return `"${cellStr.replace(/"/g, '""')}"`;
                            }
                            return cell;
                        }).join(';')
                    ).join('\n');

                } else {
                    // Assume que é um arquivo de texto (csv, txt)
                    reportText = buffer.toString('utf8');
                }
            } else {
                // Fallback para o caso de receber texto puro
                reportText = originalReportData;
            }

            // 1. Pega uma amostra do CSV para a IA analisar
            const lines = reportText.split('\n');
            const sample = lines.slice(0, 5).join('\n'); // Header + 4 linhas

            // 2. Pede para a IA mapear as colunas
            const mappingPrompt = `
                Sua tarefa é analisar uma amostra de um relatório de colheita em CSV e criar um mapeamento JSON das colunas.
                O objetivo é mapear os cabeçalhos do relatório para um formato padrão. O separador é ';'.

                Os campos padrão que eu preciso são:
                'codigoFazenda', 'nomeFazenda', 'talhao', 'safra', 'variedade', 'atrRealizado', 'tchRealizado', e, se possível, 'toneladas' e 'area' para calcular o TCH.

                Se a coluna 'tchRealizado' (Toneladas de Cana por Hectare) não existir, mas colunas para 'toneladas' e 'area' existirem, mapeie-as para que eu possa calcular o TCH (toneladas / area).

                **Exemplo Principal (Formato do Cliente):**
                Amostra: "Ano;Propriedade;Fazenda;Prev. Corte (Qz/Mês);Talhão;Área Ha (Colheita);Corte;Parte;Tmp. Cana;Encerramento;Estim. Corte;Estim. Ton;Real Cortado;Cortado Ton;Terceiros;Terceiros;ATR;Variedade Cana;Distância (Km);Muda;Replan;Irrigado"
                Resposta JSON esperada: { "Ano": "safra", "Fazenda": "nomeFazenda", "Talhão": "talhao", "Área Ha (Colheita)": "area", "Cortado Ton": "toneladas", "ATR": "atrRealizado", "Variedade Cana": "variedade" }

                **Exemplo 2 (Formato Simples):**
                Amostra: "COD;FAZENDA;TALHÃO;VARIEDADE;CORTE;TCH;ATR"
                Resposta JSON esperada: { "COD": "codigoFazenda", "FAZENDA": "nomeFazenda", "TALHÃO": "talhao", "VARIEDADE": "variedade", "TCH": "tchRealizado", "ATR": "atrRealizado" }

                **Exemplo 3 (Nomes Abreviados):**
                Amostra: "Cod Faz;Talhão;Area (ha);Ton. Entregue;Safra;ATR"
                Resposta JSON esperada: { "Cod Faz": "codigoFazenda", "Talhão": "talhao", "Area (ha)": "area", "Ton. Entregue": "toneladas", "Safra": "safra", "ATR": "atrRealizado" }

                Ignore colunas que não parecem relevantes para o cálculo de produtividade (ex: 'Propriedade', 'Muda', 'Replan'). Se houver colunas duplicadas como 'Terceiros', ignore-as.
                Agora, analise a amostra real abaixo e forneça apenas o objeto JSON correspondente, sem nenhum texto adicional.

                **Amostra Real:**
                ${sample}
            `;

            const mappingResult = await model.generateContent(mappingPrompt);
            const mappingResponse = await mappingResult.response;
            let mappingText = mappingResponse.text().replace(/```json/g, '').replace(/```/g, '').trim();

            let columnMapping;
            try {
                columnMapping = JSON.parse(mappingText);
            } catch (e) {
                console.error("Erro: A IA retornou um JSON inválido para o mapeamento de colunas.", mappingText);
                return res.status(500).json({ message: "A IA não conseguiu entender a estrutura das colunas do seu relatório. Verifique se o arquivo é um CSV válido com cabeçalhos." });
            }

            if (!columnMapping || Object.keys(columnMapping).length === 0) {
                console.error("Erro: O mapeamento de colunas da IA está vazio ou inválido.", columnMapping);
                return res.status(500).json({ message: "A IA não conseguiu identificar colunas válidas no seu relatório." });
            }

            // 3. Processa o CSV completo com o mapeamento da IA
            const records = [];
            const stream = Readable.from(reportText); // Usar o texto processado
            stream.pipe(csv({ separator: ';', mapHeaders: ({ header }) => columnMapping[header] || null }))
                .on('data', (data) => records.push(data))
                .on('end', async () => {
                    // 4. Salva em batches no Firestore
                    const batchSize = 400;
                    for (let i = 0; i < records.length; i += batchSize) {
                        const batch = db.batch();
                        const chunk = records.slice(i, i + batchSize);

                        chunk.forEach(record => {
                            // Calcula TCH se necessário
                            if (!record.tchRealizado && record.toneladas && record.area) {
                                record.tchRealizado = parseFloat(record.toneladas) / parseFloat(record.area);
                            }
                            // Limpa e formata os dados
                            const finalRecord = {
                                codigoFazenda: record.codigoFazenda || null,
                                talhao: record.talhao || null,
                                safra: record.safra || null,
                                variedade: record.variedade || null,
                                toneladas: parseFloat(String(record.toneladas).replace(',', '.')) || 0,
                                atrRealizado: parseFloat(String(record.atrRealizado).replace(',', '.')) || 0,
                                tchRealizado: parseFloat(String(record.tchRealizado).replace(',', '.')) || 0,
                                importedAt: new Date(),
                            };
                            const docRef = db.collection('historicalHarvests').doc();
                            batch.set(docRef, finalRecord);
                        });
                        await batch.commit();
                    }
                    res.status(200).json({ message: `${records.length} registros históricos importados e processados com sucesso pela IA!` });
                });

        } catch (error) {
            console.error("Erro na ingestão inteligente de relatório:", error);
            res.status(500).json({ message: 'Erro no servidor ao processar o relatório com a IA.' });
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
            const historyQuery = await db.collection('historicalHarvests')
                .where('codigoFazenda', '==', codigoFazenda)
                .get();

            if (historyQuery.empty) {
                return res.status(200).json({ predicted_atr: 0, message: "Sem histórico para esta fazenda." });
            }

            let totalAtrPonderado = 0;
            let totalToneladas = 0;

            historyQuery.forEach(doc => {
                const data = doc.data();
                const atr = parseFloat(String(data.atrRealizado).replace(',', '.')) || 0;
                const toneladas = parseFloat(String(data.toneladas).replace(',', '.')) || 0;
                if (atr > 0 && toneladas > 0) {
                    totalAtrPonderado += atr * toneladas;
                    totalToneladas += toneladas;
                }
            });

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
            
            let currentY = await generatePdfHeader(doc, title);

            const headersA = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
            const columnWidthsA = [160, 60, 60, 100, 80, 60, 45, 45, 45, 55, 62];
            const headersB = ['Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
            const columnWidthsB = [75, 80, 160, 90, 75, 50, 50, 50, 70, 77];

            const headersAConfig = headersA.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
            const headersBConfig = headersB.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));


            if (!isModelB) { // Modelo A
                currentY = drawRow(doc, headersA, currentY, true, false, columnWidthsA, 5, 18, headersAConfig);
                for(const r of enrichedData) {
                    currentY = await checkPageBreak(doc, currentY, title);
                    currentY = drawRow(doc, [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsA, 5, 18, headersAConfig);
                }
            } else { // Modelo B
                const groupedData = enrichedData.reduce((acc, reg) => {
                    const key = `${reg.codigo} - ${reg.fazenda}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(reg);
                    return acc;
                }, {});

                for (const fazendaKey of Object.keys(groupedData).sort()) {
                    currentY = await checkPageBreak(doc, currentY, title, 40);
                    doc.y = currentY;
                    doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
                    currentY = doc.y + 5;

                    currentY = await checkPageBreak(doc, currentY, title);
                    currentY = drawRow(doc, headersB, currentY, true, false, columnWidthsB, 5, 18, headersBConfig);

                    const farmData = groupedData[fazendaKey];
                    for(const r of farmData) {
                        currentY = await checkPageBreak(doc, currentY, title);
                        currentY = drawRow(doc, [r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsB, 5, 18, headersBConfig);
                    }
                    
                    const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
                    const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
                    const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
                    const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
                    const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
                    const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';
                    
                    const subtotalRow = ['', '', '', 'Sub Total', subTotalEntrenos, subTotalBase, subTotalMeio, subTotalTopo, subTotalBrocado, subTotalPercent];
                    currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidthsB, 5, 18, headersBConfig);
                    currentY += 10;
                }
            }
            
            const grandTotalEntrenos = enrichedData.reduce((sum, r) => sum + r.entrenos, 0);
            const grandTotalBrocado = enrichedData.reduce((sum, r) => sum + r.brocado, 0);
            const grandTotalBase = enrichedData.reduce((sum, r) => sum + r.base, 0);
            const grandTotalMeio = enrichedData.reduce((sum, r) => sum + r.meio, 0);
            const grandTotalTopo = enrichedData.reduce((sum, r) => sum + r.topo, 0);
            const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

            currentY = await checkPageBreak(doc, currentY, title, 40);
            doc.y = currentY;
            
            if (!isModelB) {
                const totalRowData = ['', '', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
                drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, 5, 18, headersAConfig);
            } else {
                const totalRowDataB = ['', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
                drawRow(doc, totalRowDataB, currentY, false, true, columnWidthsB, 5, 18, headersBConfig);
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
            
            let currentY = await generatePdfHeader(doc, title);

            const headersA = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
            const columnWidthsA = [80, 160, 80, 100, 60, 120, 80];
            const headersB = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaco', 'Pedaco', 'Total'];
            const columnWidthsB = [60, 120, 60, 70, 40, 90, 50, 50, 40, 40, 50, 50, 50];

            const headersAConfig = headersA.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
            const headersBConfig = headersB.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
            
            const rowHeight = 18;
            const textPadding = 5;

            if (!isDetailed) { // Modelo A - Resumido
                currentY = drawRow(doc, headersA, currentY, true, false, columnWidthsA, textPadding, rowHeight, headersAConfig);
                for(const p of data) {
                    currentY = await checkPageBreak(doc, currentY, title);
                    currentY = drawRow(doc, [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.total)], currentY, false, false, columnWidthsA, textPadding, rowHeight, headersAConfig);
                }
            } else { // Modelo B - Detalhado
                const groupedData = data.reduce((acc, p) => {
                    const key = `${p.codigo} - ${p.fazenda}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(p);
                    return acc;
                }, {});

                for (const fazendaKey of Object.keys(groupedData).sort()) {
                    currentY = await checkPageBreak(doc, currentY, title, 40);
                    doc.y = currentY;
                    doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
                    currentY = doc.y + 5;

                    currentY = await checkPageBreak(doc, currentY, title);
                    currentY = drawRow(doc, headersB, currentY, true, false, columnWidthsB, textPadding, rowHeight, headersBConfig);

                    const farmData = groupedData[fazendaKey];
                    for(const p of farmData) {
                        currentY = await checkPageBreak(doc, currentY, title);
                        currentY = drawRow(doc, [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, formatNumber(p.canaInteira), formatNumber(p.tolete), formatNumber(p.toco), formatNumber(p.ponta), formatNumber(p.estilhaco), formatNumber(p.pedaco), formatNumber(p.total)], currentY, false, false, columnWidthsB, textPadding, rowHeight, headersBConfig);
                    }
                    
                    const subTotalCanaInteira = farmData.reduce((sum, p) => sum + p.canaInteira, 0);
                    const subTotalTolete = farmData.reduce((sum, p) => sum + p.tolete, 0);
                    const subTotalToco = farmData.reduce((sum, p) => sum + p.toco, 0);
                    const subTotalPonta = farmData.reduce((sum, p) => sum + p.ponta, 0);
                    const subTotalEstilhaco = farmData.reduce((sum, p) => sum + p.estilhaco, 0);
                    const subTotalPedaco = farmData.reduce((sum, p) => sum + p.pedaco, 0);
                    const subTotal = farmData.reduce((sum, p) => sum + p.total, 0);

                    const subtotalRow = ['', '', '', '', '', 'Sub Total', formatNumber(subTotalCanaInteira), formatNumber(subTotalTolete), formatNumber(subTotalToco), formatNumber(subTotalPonta), formatNumber(subTotalEstilhaco), formatNumber(subTotalPedaco), formatNumber(subTotal)];
                    currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidthsB, textPadding, rowHeight, headersBConfig);
                    currentY += 10;
                }
            }
            
            const grandTotalCanaInteira = data.reduce((sum, p) => sum + p.canaInteira, 0);
            const grandTotalTolete = data.reduce((sum, p) => sum + p.tolete, 0);
            const grandTotalToco = data.reduce((sum, p) => sum + p.toco, 0);
            const grandTotalPonta = data.reduce((sum, p) => sum + p.ponta, 0);
            const grandTotalEstilhaco = data.reduce((sum, p) => sum + p.estilhaco, 0);
            const grandTotalPedaco = data.reduce((sum, p) => sum + p.pedaco, 0);
            const grandTotal = data.reduce((sum, p) => sum + p.total, 0);

            currentY = await checkPageBreak(doc, currentY, title, 40);
            doc.y = currentY;

            if (!isDetailed) {
                const totalRowData = ['', '', '', '', '', 'Total Geral', formatNumber(grandTotal)];
                drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, textPadding, rowHeight, headersAConfig);
            } else {
                const totalRowData = ['', '', '', '', '', 'Total Geral', formatNumber(grandTotalCanaInteira), formatNumber(grandTotalTolete), formatNumber(grandTotalToco), formatNumber(grandTotalPonta), formatNumber(grandTotalEstilhaco), formatNumber(grandTotalPedaco), formatNumber(grandTotal)];
                drawRow(doc, totalRowData, currentY, false, true, columnWidthsB, textPadding, rowHeight, headersBConfig);
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
            let currentY = await generatePdfHeader(doc, title);

            const allPossibleHeadersConfig = [
                { id: 'seq', title: 'Seq.', minWidth: 35 },
                { id: 'fazenda', title: 'Fazenda', minWidth: 120 },
                { id: 'talhoes', title: 'Talhões', minWidth: 160 },
                { id: 'area', title: 'Área (ha)', minWidth: 50 },
                { id: 'producao', title: 'Prod. (ton)', minWidth: 60 },
                { id: 'variedade', title: 'Variedade', minWidth: 130 },
                { id: 'idade', title: 'Idade (m)', minWidth: 55 },
                { id: 'atr', title: 'ATR', minWidth: 40 },
                { id: 'maturador', title: 'Matur.', minWidth: 60 },
                { id: 'diasAplicacao', title: 'Dias Aplic.', minWidth: 70 },
                { id: 'distancia', title: 'KM', minWidth: 40 },
                { id: 'entrada', title: 'Entrada', minWidth: 65 },
                { id: 'saida', title: 'Saída', minWidth: 65 }
            ];

            let finalHeaders = [];
            const initialFixedHeaders = ['seq', 'fazenda', 'area', 'producao'];
            const finalFixedHeaders = ['entrada', 'saida'];
            
            initialFixedHeaders.forEach(id => {
                const header = allPossibleHeadersConfig.find(h => h.id === id);
                if (header) finalHeaders.push(header);
            });

            if (selectedCols['talhoes']) {
                const header = allPossibleHeadersConfig.find(h => h.id === 'talhoes');
                if (header) finalHeaders.push(header);
            }

            allPossibleHeadersConfig.forEach(header => {
                if (selectedCols[header.id] && !initialFixedHeaders.includes(header.id) && !finalFixedHeaders.includes(header.id) && header.id !== 'talhoes') {
                    finalHeaders.push(header);
                }
            });

            finalFixedHeaders.forEach(id => {
                const header = allPossibleHeadersConfig.find(h => h.id === id);
                if (header) finalHeaders.push(header);
            });

            const headersText = finalHeaders.map(h => h.title);

            const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            let totalMinWidth = 0;
            let flexibleColumnsCount = 0;

            finalHeaders.forEach(header => {
                totalMinWidth += header.minWidth;
                if (['fazenda', 'talhoes', 'variedade'].includes(header.id)) {
                    flexibleColumnsCount++;
                }
            });

            let remainingWidth = pageWidth - totalMinWidth;
            let flexibleColumnExtraWidth = flexibleColumnsCount > 0 ? remainingWidth / flexibleColumnsCount : 0;

            let finalColumnWidths = finalHeaders.map(header => {
                let width = header.minWidth;
                if (['fazenda', 'talhoes', 'variedade'].includes(header.id)) {
                    width += flexibleColumnExtraWidth;
                }
                return width;
            });

            const currentTotalWidth = finalColumnWidths.reduce((sum, w) => sum + w, 0);
            const difference = pageWidth - currentTotalWidth;
            if (difference !== 0 && flexibleColumnsCount > 0) {
                const firstFlexibleIndex = finalHeaders.findIndex(h => ['fazenda', 'talhoes', 'variedade'].includes(h.id));
                if (firstFlexibleIndex !== -1) {
                    finalColumnWidths[firstFlexibleIndex] += difference;
                }
            }


            const rowHeight = 18;
            const textPadding = 5;

            currentY = drawRow(doc, headersText, currentY, true, false, finalColumnWidths, textPadding, rowHeight, finalHeaders);

            let grandTotalProducao = 0;
            let grandTotalArea = 0;
            let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
            const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;
            const closedTalhaoIds = new Set(harvestPlan.closedTalhaoIds || []);

            for (let i = 0; i < harvestPlan.sequence.length; i++) {
                const group = harvestPlan.sequence[i];
                
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

                let totalAgeInDays = 0, plotsWithDate = 0;
                let totalDistancia = 0, plotsWithDistancia = 0;
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
                const avgDistancia = plotsWithDistancia > 0 ? (totalDistancia / plotsWithDistancia).toFixed(2) : 'N/A';
                
                let diasAplicacao = 'N/A';
                if (group.maturadorDate) {
                    try {
                        const today = new Date();
                        const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
                        const diffTime = today - applicationDate;
                        if (diffTime >= 0) {
                            diasAplicacao = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        }
                    } catch (e) { diasAplicacao = 'N/A'; }
                }

                const rowDataMap = {
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
                
                const rowData = finalHeaders.map(h => rowDataMap[h.id]);

                currentY = await checkPageBreak(doc, currentY, title);
                currentY = drawRow(doc, rowData, currentY, false, false, finalColumnWidths, textPadding, rowHeight, finalHeaders, isGroupClosed);
            }

            currentY = await checkPageBreak(doc, currentY, title, 40);
            doc.y = currentY;
            
            const totalRowData = new Array(finalHeaders.length).fill('');
            const fazendaIndex = finalHeaders.findIndex(h => h.id === 'fazenda');
            const areaIndex = finalHeaders.findIndex(h => h.id === 'area');
            const prodIndex = finalHeaders.findIndex(h => h.id === 'producao');

            if (fazendaIndex !== -1) {
                totalRowData[fazendaIndex] = 'Total Geral (Ativo)';
            } else {
                totalRowData[1] = 'Total Geral (Ativo)';
            }

            if (areaIndex !== -1) {
                totalRowData[areaIndex] = formatNumber(grandTotalArea);
            }
            if (prodIndex !== -1) {
                totalRowData[prodIndex] = formatNumber(grandTotalProducao);
            }

            drawRow(doc, totalRowData, currentY, false, true, finalColumnWidths, textPadding, rowHeight, finalHeaders);

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
            let currentY = await generatePdfHeader(doc, title);

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

            let currentY = await generatePdfHeader(doc, title);

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
