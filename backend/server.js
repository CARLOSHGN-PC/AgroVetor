// server.js - Backend com Geração de PDF e Upload de Logo

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumenta o limite para receber strings Base64 grandes

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ 
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "agrovetor-v2.appspot.com" 
  });
  const db = admin.firestore();
  console.log('Firebase Admin SDK inicializado com sucesso.');

  app.get('/', (req, res) => {
    res.status(200).send('Servidor de relatórios AgroVetor está online e conectado ao Firebase!');
  });

  // ROTA PARA UPLOAD DO LOGO (agora recebe Base64 diretamente)
  app.post('/upload-logo', async (req, res) => {
    const { logoBase64 } = req.body; // Espera a string Base64 no corpo da requisição

    if (!logoBase64) {
      return res.status(400).send({ message: 'Nenhum dado de imagem Base64 enviado.' });
    }

    try {
      // Salvar a string Base64 diretamente no Firestore
      await db.collection('config').doc('company').set({ logoBase64: logoBase64 }, { merge: true });
      res.status(200).send({ message: 'Logo carregado com sucesso!' });
    } catch (error) {
      console.error("Erro ao salvar logo Base64 no Firestore:", error);
      res.status(500).send({ message: `Erro no servidor ao carregar logo: ${error.message}` });
    }
  });


  // --- FUNÇÕES AUXILIARES E OUTRAS ROTAS ---

  const getFilteredData = async (collectionName, filters) => {
    let query = db.collection(collectionName);
    if (filters.inicio) query = query.where('data', '>=', filters.inicio);
    if (filters.fim) query = query.where('data', '<=', filters.fim);
    if (filters.fazendaCodigo) query = query.where('codigo', '==', filters.fazendaCodigo);
    if (filters.matricula) query = query.where('matricula', '==', filters.matricula);
    
    const snapshot = await query.get();
    let data = [];
    snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));

    if (filters.talhao) data = data.filter(d => d.talhao.toLowerCase().includes(filters.talhao.toLowerCase()));
    if (filters.frenteServico) data = data.filter(d => d.frenteServico.toLowerCase().includes(filters.frenteServico.toLowerCase()));
    
    return data.sort((a, b) => new Date(a.data) - new Date(b.data));
  };

  const generatePdfHeader = async (doc, title, generatedBy = 'N/A') => {
    try {
      const configDoc = await db.collection('config').doc('company').get();
      // Verifica se existe o campo 'logoBase64' e o utiliza
      if (configDoc.exists && configDoc.data().logoBase64) {
        const logoBase64 = configDoc.data().logoBase64;
        doc.image(logoBase64, doc.page.margins.left, 15, { width: 40 }); 
      }
    } catch (error) {
      console.error("Não foi possível carregar o logotipo Base64:", error.message);
    }
    
    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
    // Adicionado o nome do usuário para generatePdfHeader
    doc.fontSize(10).font('Helvetica').text(`Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' });
    doc.moveDown(2);
    return doc.y;
  };

  // Função auxiliar para desenhar linhas da tabela (agora mais robusta)
  const drawRow = (doc, rowData, y, isHeader = false, isFooter = false, customWidths, textPadding = 5, rowHeight = 18, columnHeadersConfig = []) => {
    const startX = doc.page.margins.left;
    const fontSize = 8;
    
    // Define o estilo da fonte para cabeçalho/rodapé ou corpo
    if (isHeader || isFooter) {
        doc.font('Helvetica-Bold').fontSize(fontSize);
        doc.rect(startX, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
        doc.fillColor('black');
    } else {
        doc.font('Helvetica').fontSize(fontSize);
    }
    
    let currentX = startX;
    let maxRowHeight = rowHeight; // Altura mínima da linha

    rowData.forEach((cell, i) => {
        let columnId = null;
        // Verifica se columnHeadersConfig é um array e se o índice existe
        if (Array.isArray(columnHeadersConfig) && i < columnHeadersConfig.length && columnHeadersConfig[i]) {
            columnId = columnHeadersConfig[i].id;
        }

        const cellWidth = customWidths[i] - (textPadding * 2);
        const textOptions = { width: cellWidth, align: 'left', continued: false };

        // Lógica de quebra de linha: permite apenas para colunas específicas
        if (['talhoes', 'variedade'].includes(columnId)) {
            textOptions.lineBreak = true; // Permite quebra de linha
            textOptions.lineGap = 2; // Pequeno espaço entre as linhas se houver quebra
        } else {
            textOptions.lineBreak = false; // Impede quebra de linha para outros textos (títulos e nomes)
        }
        
        // Calcula a altura necessária para o texto na célula
        const textHeight = doc.heightOfString(String(cell), textOptions);
        maxRowHeight = Math.max(maxRowHeight, textHeight + textPadding * 2); // Atualiza a altura máxima da linha

        doc.text(String(cell), currentX + textPadding, y + textPadding, textOptions);
        currentX += customWidths[i];
    });
    return y + maxRowHeight; // Retorna a altura da linha para a próxima posição Y
  };

  // Função auxiliar para verificar quebra de página
  const checkPageBreak = async (doc, y, title, generatedBy, neededSpace = 40) => {
    if (y > doc.page.height - doc.page.margins.bottom - neededSpace) {
        doc.addPage();
        return await generatePdfHeader(doc, title, generatedBy);
    }
    return y;
  };


  app.get('/reports/brocamento/pdf', async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
    doc.pipe(res);

    try {
      const filters = req.query;
      const data = await getFilteredData('registros', filters);
      if (data.length === 0) {
        await generatePdfHeader(doc, 'Relatório de Inspeção de Broca', filters.generatedBy);
        doc.text('Nenhum dado encontrado para os filtros selecionados.');
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
      const title = 'Relatório de Inspeção de Broca';
      
      let currentY = await generatePdfHeader(doc, title, filters.generatedBy);

      const headersA = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
      const columnWidthsA = [160, 60, 60, 100, 80, 60, 45, 45, 45, 55, 62]; 
      const headersB = ['Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
      const columnWidthsB = [75, 80, 160, 90, 75, 50, 50, 50, 70, 77];

      // Definir os cabeçalhos como objetos para a função drawRow
      const headersAConfig = headersA.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
      const headersBConfig = headersB.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));


      if (!isModelB) { // Modelo A
        currentY = drawRow(doc, headersA, currentY, true, false, columnWidthsA, 5, 18, headersAConfig); // Passar headersAConfig
        for(const r of enrichedData) {
            currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy);
            currentY = drawRow(doc, [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsA, 5, 18, headersAConfig); // Passar headersAConfig
        }
      } else { // Modelo B
        const groupedData = enrichedData.reduce((acc, reg) => {
          const key = `${reg.codigo} - ${reg.fazenda}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(reg);
          return acc;
        }, {});

        for (const fazendaKey of Object.keys(groupedData).sort()) {
          currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, 40);
          doc.y = currentY;
          doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
          currentY = doc.y + 5;

          currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy);
          currentY = drawRow(doc, headersB, currentY, true, false, columnWidthsB, 5, 18, headersBConfig); // Passar headersBConfig

          const farmData = groupedData[fazendaKey];
          for(const r of farmData) {
              currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy);
              currentY = drawRow(doc, [r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsB, 5, 18, headersBConfig); // Passar headersBConfig
          }
          
          const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
          const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
          const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
          const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
          const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
          const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';
          
          const subtotalRow = ['', '', '', 'Sub Total', subTotalEntrenos, subTotalBase, subTotalMeio, subTotalTopo, subTotalBrocado, subTotalPercent];
          currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidthsB, 5, 18, headersBConfig); // Passar headersBConfig
          currentY += 10;
        }
      }
      
      const grandTotalEntrenos = enrichedData.reduce((sum, r) => sum + r.entrenos, 0);
      const grandTotalBrocado = enrichedData.reduce((sum, r) => sum + r.brocado, 0);
      const grandTotalBase = enrichedData.reduce((sum, r) => sum + r.base, 0);
      const grandTotalMeio = enrichedData.reduce((sum, r) => sum + r.meio, 0);
      const grandTotalTopo = enrichedData.reduce((sum, r) => sum + r.topo, 0);
      const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

      currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, 40);
      doc.y = currentY;
      
      if (!isModelB) {
        const totalRowData = ['', '', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
        drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, 5, 18, headersAConfig); // Passar headersAConfig
      } else {
        const totalRowDataB = ['', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
        drawRow(doc, totalRowDataB, currentY, false, true, columnWidthsB, 5, 18, headersBConfig); // Passar headersBConfig
      }

      doc.end();
    } catch (error) { 
        console.error("Erro ao gerar PDF de Brocamento:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
        } else {
            doc.end(); // Garante que o stream seja fechado
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
      if (data.length === 0) {
        await generatePdfHeader(doc, 'Relatório de Perda', filters.generatedBy);
        doc.text('Nenhum dado encontrado para os filtros selecionados.');
        doc.end();
        return;
      }

      const isDetailed = filters.tipoRelatorio === 'B';
      const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
      
      let currentY = await generatePdfHeader(doc, title, filters.generatedBy);

      // Definindo os cabeçalhos e larguras para o relatório de perda
      const headersA = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
      const columnWidthsA = [80, 160, 80, 100, 60, 120, 80];
      const headersB = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaco', 'Pedaco', 'Total'];
      const columnWidthsB = [60, 120, 60, 70, 40, 90, 50, 50, 40, 40, 50, 50, 50];

      // Definir os cabeçalhos como objetos para a função drawRow
      const headersAConfig = headersA.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
      const headersBConfig = headersB.map(title => ({ id: title.toLowerCase().replace(/[^a-z0-9]/g, ''), title: title }));
      
      const rowHeight = 18;
      const textPadding = 5;

      if (!isDetailed) { // Modelo A - Resumido
        currentY = drawRow(doc, headersA, currentY, true, false, columnWidthsA, textPadding, rowHeight, headersAConfig);
        for(const p of data) {
            currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy);
            currentY = drawRow(doc, [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.total], currentY, false, false, columnWidthsA, textPadding, rowHeight, headersAConfig);
        }
      } else { // Modelo B - Detalhado
        const groupedData = data.reduce((acc, p) => {
          const key = `${p.codigo} - ${p.fazenda}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(p);
          return acc;
        }, {});

        for (const fazendaKey of Object.keys(groupedData).sort()) {
          currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, 40);
          doc.y = currentY;
          doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
          currentY = doc.y + 5;

          currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy);
          // Passar headersBConfig para a função drawRow, e ajustar os dados para não incluir a fazenda
          currentY = drawRow(doc, headersB, currentY, true, false, columnWidthsB, textPadding, rowHeight, headersBConfig);

          const farmData = groupedData[fazendaKey];
          for(const p of farmData) {
              currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy);
              currentY = drawRow(doc, [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.canaInteira, p.tolete, p.toco, p.ponta, p.estilhaco, p.pedaco, p.total], currentY, false, false, columnWidthsB, textPadding, rowHeight, headersBConfig);
          }
          
          const subTotalCanaInteira = farmData.reduce((sum, p) => sum + p.canaInteira, 0);
          const subTotalTolete = farmData.reduce((sum, p) => sum + p.tolete, 0);
          const subTotalToco = farmData.reduce((sum, p) => sum + p.toco, 0);
          const subTotalPonta = farmData.reduce((sum, p) => sum + p.ponta, 0);
          const subTotalEstilhaco = farmData.reduce((sum, p) => sum + p.estilhaco, 0);
          const subTotalPedaco = farmData.reduce((sum, p) => sum + p.pedaco, 0);
          const subTotal = farmData.reduce((sum, p) => sum + p.total, 0);

          const subtotalRow = ['', '', '', '', '', 'Sub Total', subTotalCanaInteira, subTotalTolete, subTotalToco, subTotalPonta, subTotalEstilhaco, subTotalPedaco, subTotal];
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

      currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, 40);
      doc.y = currentY;

      if (!isDetailed) {
        const totalRowData = ['', '', '', '', '', 'Total Geral', grandTotal];
        drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, textPadding, rowHeight, headersAConfig);
      } else {
        const totalRowData = ['', '', '', '', '', 'Total Geral', grandTotalCanaInteira, grandTotalTolete, grandTotalToco, grandTotalPonta, grandTotalEstilhaco, grandTotalPedaco, grandTotal];
        drawRow(doc, totalRowData, currentY, false, true, columnWidthsB, textPadding, rowHeight, headersBConfig);
      }

      doc.end();
    } catch (error) { 
        console.error("Erro ao gerar PDF de Perda:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
        } else {
            doc.end(); // Garante que o stream seja fechado
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
        await generatePdfHeader(doc, 'Relatório Customizado de Colheita', generatedBy);
        doc.text('Nenhum plano de colheita selecionado.');
        doc.end();
        return;
      }

      const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
      if (!harvestPlanDoc.exists) {
        await generatePdfHeader(doc, 'Relatório Customizado de Colheita', generatedBy);
        doc.text('Plano de colheita não encontrado.');
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
      let currentY = await generatePdfHeader(doc, title, generatedBy);

      // [CORREÇÃO] Ajuste nas larguras mínimas e títulos para evitar quebra de linha
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
          { id: 'diasAplicacao', title: 'Dias Aplic.', minWidth: 60 }, 
          { id: 'distancia', title: 'KM', minWidth: 40 },
          { id: 'entrada', title: 'Entrada', minWidth: 65 }, 
          { id: 'saida', title: 'Saída', minWidth: 65 }    
      ];

      // Filtra os cabeçalhos selecionados
      let finalHeaders = [];
      const initialFixedHeaders = ['seq', 'fazenda', 'talhoes', 'area', 'producao'];
      const finalFixedHeaders = ['entrada', 'saida'];

      initialFixedHeaders.forEach(id => {
          const header = allPossibleHeadersConfig.find(h => h.id === id);
          if (header) finalHeaders.push(header);
      });

      allPossibleHeadersConfig.forEach(header => {
          if (selectedCols[header.id] && !initialFixedHeaders.includes(header.id) && !finalFixedHeaders.includes(header.id)) {
              finalHeaders.push(header);
          }
      });

      finalFixedHeaders.forEach(id => {
          const header = allPossibleHeadersConfig.find(h => h.id === id);
          if (header) finalHeaders.push(header);
      });

      const headersText = finalHeaders.map(h => h.title);

      // Calcular larguras das colunas dinamicamente
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let totalMinWidth = 0;
      let flexibleColumnsCount = 0;

      finalHeaders.forEach(header => {
          totalMinWidth += header.minWidth;
          // Considerar 'fazenda', 'talhoes', 'variedade', 'maturador' como colunas flexíveis
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

      // Ajuste final para garantir que a soma das larguras seja exatamente `pageWidth`
      const currentTotalWidth = finalColumnWidths.reduce((sum, w) => sum + w, 0);
      const difference = pageWidth - currentTotalWidth;
      // Distribui a diferença (pequenos erros de arredondamento) na primeira coluna flexível
      if (difference !== 0 && flexibleColumnsCount > 0) {
          const firstFlexibleIndex = finalHeaders.findIndex(h => ['fazenda', 'talhoes', 'variedade'].includes(h.id));
          if (firstFlexibleIndex !== -1) {
              finalColumnWidths[firstFlexibleIndex] += difference;
          }
      }


      const rowHeight = 18;
      const textPadding = 5;

      // Desenhar cabeçalho da tabela
      currentY = drawRow(doc, headersText, currentY, true, false, finalColumnWidths, textPadding, rowHeight, finalHeaders);

      let grandTotalProducao = 0;
      let grandTotalArea = 0;
      let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
      const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;

      for (let i = 0; i < harvestPlan.sequence.length; i++) {
        const group = harvestPlan.sequence[i];
        grandTotalProducao += group.totalProducao;
        grandTotalArea += group.totalArea;

        const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
        const dataEntrada = new Date(currentDate.getTime());
        
        let dataSaida = new Date(dataEntrada.getTime());
        dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));

        // [CORREÇÃO] A data de início da próxima fazenda é o dia seguinte à saída da anterior
        currentDate = new Date(dataSaida.getTime());
        currentDate.setDate(currentDate.getDate() + 1);

        // Calcula Idade Média, Dias de Aplicação e Distância
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
            fazenda: `${group.fazendaCodigo} - ${group.fazendaName}`,
            talhoes: group.plots.map(p => p.talhaoName).join(', '),
            area: group.totalArea.toFixed(2),
            producao: group.totalProducao.toFixed(2),
            variedade: Array.from(allVarieties).join(', ') || 'N/A',
            idade: idadeMediaMeses,
            atr: group.atr || 'N/A',
            maturador: group.maturador || 'N/A',
            diasAplicacao: diasAplicacao,
            distancia: avgDistancia, // [CORREÇÃO] Adicionado o valor da distância
            entrada: dataEntrada.toLocaleDateString('pt-BR'),
            saida: dataSaida.toLocaleDateString('pt-BR')
        };
        
        const rowData = finalHeaders.map(h => rowDataMap[h.id]);

        currentY = await checkPageBreak(doc, currentY, title, generatedBy);
        currentY = drawRow(doc, rowData, currentY, false, false, finalColumnWidths, textPadding, rowHeight, finalHeaders); 
      }

      // [CORREÇÃO] Lógica de alinhamento do Total Geral
      currentY = await checkPageBreak(doc, currentY, title, generatedBy, 40);
      doc.y = currentY;
      
      const totalRowData = new Array(finalHeaders.length).fill('');
      const fazendaIndex = finalHeaders.findIndex(h => h.id === 'fazenda');
      const areaIndex = finalHeaders.findIndex(h => h.id === 'area');
      const prodIndex = finalHeaders.findIndex(h => h.id === 'producao');

      if (fazendaIndex !== -1) {
          totalRowData[fazendaIndex] = 'Total Geral';
      } else {
          totalRowData[1] = 'Total Geral'; // Fallback para a segunda coluna
      }

      if (areaIndex !== -1) {
          totalRowData[areaIndex] = grandTotalArea.toFixed(2);
      }
      if (prodIndex !== -1) {
          totalRowData[prodIndex] = grandTotalProducao.toFixed(2);
      }

      drawRow(doc, totalRowData, currentY, false, true, finalColumnWidths, textPadding, rowHeight, finalHeaders);

      doc.end();
    } catch (error) {
        console.error("Erro no PDF de Colheita:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end(); // Garante que o stream seja fechado
        }
    }
  });

  app.get('/reports/colheita/csv', async (req, res) => {
    try {
      const { planId, selectedColumns } = req.query;
      const selectedCols = JSON.parse(selectedColumns || '{}');

      if (!planId) return res.status(400).send('Nenhum plano de colheita selecionado.');

      const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
      if (!harvestPlanDoc.exists) return res.status(404).send('Plano de colheita não encontrado.');

      const harvestPlan = harvestPlanDoc.data();
      const fazendasSnapshot = await db.collection('fazendas').get();
      const fazendasData = {};
      fazendasSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        fazendasData[data.code] = { id: docSnap.id, ...data };
      });

      const filePath = path.join(os.tmpdir(), `colheita_${Date.now()}.csv`);
      
      // Define todos os cabeçalhos possíveis
      const allPossibleHeadersConfig = [
        { id: 'seq', title: 'Seq.' },
        { id: 'fazenda', title: 'Fazenda' },
        { id: 'talhoes', title: 'Talhões' },
        { id: 'area', title: 'Área (ha)' },
        { id: 'producao', title: 'Prod. (ton)' },
        { id: 'variedade', title: 'Variedade' },
        { id: 'idade', title: 'Idade Média (meses)' },
        { id: 'atr', title: 'ATR' },
        { id: 'maturador', title: 'Maturador Aplicado' },
        { id: 'diasAplicacao', title: 'Dias desde Aplicação' },
        { id: 'distancia', title: 'Distância (km)' },
        { id: 'entrada', title: 'Entrada' }, // Sempre no final
        { id: 'saida', title: 'Saída' }    // Sempre no final
      ];

      // Filtra e ordena os cabeçalhos para o CSV
      let finalHeaders = [];
      const tempOptionalHeaders = [];

      // Adiciona os cabeçalhos fixos iniciais
      const initialFixedHeaders = ['seq', 'fazenda', 'talhoes', 'area', 'producao'];
      initialFixedHeaders.forEach(id => {
          const header = allPossibleHeadersConfig.find(h => h.id === id);
          if (header) {
              finalHeaders.push(header);
          }
      });

      // Adiciona os cabeçalhos opcionais selecionados
      allPossibleHeadersConfig.forEach(header => {
          if (selectedCols[header.id] && !initialFixedHeaders.includes(header.id) && header.id !== 'entrada' && header.id !== 'saida') {
              tempOptionalHeaders.push(header);
          }
      });
      finalHeaders.push(...tempOptionalHeaders);

      // Adiciona os cabeçalhos fixos finais (Entrada e Saída)
      const finalFixedHeaders = ['entrada', 'saida'];
      finalFixedHeaders.forEach(id => {
          const header = allPossibleHeadersConfig.find(h => h.id === id);
          if (header) {
              finalHeaders.push(header);
          }
      });

      const records = [];
      let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
      const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;

      harvestPlan.sequence.forEach((group, index) => {
        const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
        const dataEntrada = new Date(currentDate.getTime());
        let dataSaida = new Date(dataEntrada.getTime());
        dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));
        currentDate = new Date(dataSaida.getTime());
        currentDate.setDate(currentDate.getDate() + 1);

        // Calcula Idade Média, Dias de Aplicação e Distância
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

        const record = {};
        // Popula o registro na ordem correta dos cabeçalhos finais
        finalHeaders.forEach(header => {
            switch(header.id) {
                case 'seq': record.seq = index + 1; break;
                case 'fazenda': record.fazenda = `${group.fazendaCodigo} - ${group.fazendaName}`; break;
                case 'talhoes': record.talhoes = group.plots.map(p => p.talhaoName).join(', '); break;
                case 'area': record.area = group.totalArea.toFixed(2); break;
                case 'producao': record.producao = group.totalProducao.toFixed(2); break;
                case 'variedade': record.variedade = Array.from(allVarieties).join(', ') || 'N/A'; break;
                case 'idade': record.idade = idadeMediaMeses; break;
                case 'atr': record.atr = group.atr || 'N/A'; break;
                case 'maturador': record.maturador = group.maturador || 'N/A'; break;
                case 'diasAplicacao': record.diasAplicacao = diasAplicacao; break;
                case 'distancia': record.distancia = avgDistancia; break;
                case 'entrada': record.entrada = dataEntrada.toLocaleDateString('pt-BR'); break;
                case 'saida': record.saida = dataSaida.toLocaleDateString('pt-BR'); break;
                default: record[header.id] = ''; // Fallback for any unexpected header
            }
        });
        records.push(record);
      });

      const csvWriter = createObjectCsvWriter({ path: filePath, header: finalHeaders });
      await csvWriter.writeRecords(records);
      res.download(filePath);
    } catch (error) {
      console.error("Erro ao gerar relatório CSV de Colheita:", error);
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
