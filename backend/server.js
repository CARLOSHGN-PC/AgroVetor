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
app.use(express.json({ limit: '10mb' }));

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
  
  // [CORREÇÃO] Função de rodapé agora é chamada para cada página
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

        doc.fontSize(8).font('Helvetica')
           .text(`Página ${i + 1} de ${pageCount}`, 
                 0, 
                 footerY, 
                 { align: 'right', width: doc.page.width - doc.page.margins.right });
    }
  };


  const drawRow = (doc, rowData, y, isHeader = false, isFooter = false, customWidths, textPadding = 5, rowHeight = 18, columnHeadersConfig = []) => {
    const startX = doc.page.margins.left;
    const fontSize = 8;
    
    if (isHeader || isFooter) {
        doc.font('Helvetica-Bold').fontSize(fontSize);
        doc.rect(startX, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
        doc.fillColor('black');
    } else {
        doc.font('Helvetica').fontSize(fontSize);
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

      for (let i = 0; i < harvestPlan.sequence.length; i++) {
        const group = harvestPlan.sequence[i];
        grandTotalProducao += group.totalProducao;
        grandTotalArea += group.totalArea;

        const diasNecessarios = dailyTon > 0 ? Math.ceil(group.totalProducao / dailyTon) : 0;
        const dataEntrada = new Date(currentDate.getTime());
        
        let dataSaida = new Date(dataEntrada.getTime());
        dataSaida.setDate(dataSaida.getDate() + (diasNecessarios > 0 ? diasNecessarios - 1 : 0));

        currentDate = new Date(dataSaida.getTime());
        currentDate.setDate(currentDate.getDate() + 1);

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
        currentY = drawRow(doc, rowData, currentY, false, false, finalColumnWidths, textPadding, rowHeight, finalHeaders); 
      }

      currentY = await checkPageBreak(doc, currentY, title, 40);
      doc.y = currentY;
      
      const totalRowData = new Array(finalHeaders.length).fill('');
      const fazendaIndex = finalHeaders.findIndex(h => h.id === 'fazenda');
      const areaIndex = finalHeaders.findIndex(h => h.id === 'area');
      const prodIndex = finalHeaders.findIndex(h => h.id === 'producao');

      if (fazendaIndex !== -1) {
          totalRowData[fazendaIndex] = 'Total Geral';
      } else {
          totalRowData[1] = 'Total Geral';
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
        { id: 'entrada', title: 'Entrada' },
        { id: 'saida', title: 'Saída' }
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
                default: record[header.id] = '';
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
