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
    storageBucket: "agrovetor-v2.firebaseapp.com" 
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
    doc.fontSize(10).font('Helvetica').text(`Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' });
    doc.moveDown(2);
    return doc.y;
  };

  // Função auxiliar para desenhar linhas da tabela
  const drawRow = (doc, rowData, y, isHeader = false, isFooter = false, customWidths, textPadding = 5, rowHeight = 18) => {
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
    rowData.forEach((cell, i) => {
        // Garante que o valor é uma string antes de passar para doc.text
        doc.text(String(cell), currentX + textPadding, y + 5, { width: customWidths[i] - (textPadding * 2), align: 'left'});
        currentX += customWidths[i];
    });
    return y + rowHeight;
  };
  
  // Função auxiliar para verificar quebra de página
  const checkPageBreak = async (doc, y, title, generatedBy, neededSpace = 40) => {
    if (y > doc.page.height - doc.page.margins.bottom - neededSpace) {
        doc.addPage();
        return await generatePdfHeader(doc, title, generatedBy);
    }
    return y;
  };

  // Função para parsear data DD/MM/YYYY para YYYY-MM-DD
  const parseDateDDMMYYYY = (dateString) => {
      if (!dateString) return null;
      const parts = String(dateString).split('/'); // Garante que é string
      if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateString; 
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

      const headers = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
      // Larguras originais que o usuário confirmou estarem corretas para o relatório de broca
      const columnWidthsA = [160, 60, 60, 100, 80, 60, 45, 45, 45, 55, 62]; 
      const columnWidthsB = [75, 80, 160, 90, 75, 50, 50, 50, 70, 77];

      const rowHeight = 18;
      
      if (!isModelB) { // Modelo A
        currentY = drawRow(doc, headers, currentY, true, false, columnWidthsA, 5, rowHeight);
        for(const r of enrichedData) {
            currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, rowHeight);
            currentY = drawRow(doc, [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsA, 5, rowHeight);
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

          currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, rowHeight);
          currentY = drawRow(doc, headers.slice(1), currentY, true, false, columnWidthsB, 5, rowHeight);

          const farmData = groupedData[fazendaKey];
          for(const r of farmData) {
              currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, rowHeight);
              currentY = drawRow(doc, [r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsB, 5, rowHeight);
          }
          
          const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
          const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
          const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
          const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
          const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
          const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';
          
          const subtotalRow = ['', '', '', '', subTotalEntrenos, subTotalBase, subTotalMeio, subTotalTopo, subTotalBrocado, subTotalPercent];
          currentY = drawRow(doc, subtotalRow, currentY, false, true, columnWidthsB, 5, rowHeight);
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
        const totalRowData = ['', '', '', '', '', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
        drawRow(doc, totalRowData, currentY, false, true, columnWidthsA, 5, rowHeight);
      } else {
        const totalRowDataB = ['', '', '', '', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
        drawRow(doc, totalRowDataB, currentY, false, true, columnWidthsB, 5, rowHeight);
      }

      doc.end();
    } catch (error) { 
        console.error("Erro no PDF de Brocamento:", error);
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
        ],
        // Adicionado para garantir compatibilidade com Excel no Brasil
        separator: ';', 
        withBOM: true 
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

      const rowHeight = 18;
      const textPadding = 5;

      let headers, columnWidths;
      // Revertendo para as larguras originais do seu código para Perda
      if (isDetailed) {
        headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço', 'Total'];
        columnWidths = [60, 100, 70, 70, 40, 90, 50, 50, 40, 40, 50, 50, 50]; 
      } else {
        headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
        columnWidths = [80, 150, 100, 100, 60, 150, 80]; 
      }
      
      currentY = drawRow(doc, headers, currentY, true, false, columnWidths, textPadding, rowHeight);

      let grandTotal = 0;

      for (const p of data) {
        currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, rowHeight);
        let rowData;
        if (isDetailed) {
          rowData = [
            String(p.data), 
            String(`${p.codigo} - ${p.fazenda}`), 
            String(p.talhao), 
            String(p.frenteServico), 
            String(p.turno), 
            String(p.operador), 
            String(p.canaInteira), 
            String(p.tolete), 
            String(p.toco), 
            String(p.ponta), 
            String(p.estilhaco), 
            String(p.pedaco), 
            String(p.total)
          ];
        } else {
          rowData = [
            String(p.data), 
            String(`${p.codigo} - ${p.fazenda}`), 
            String(p.talhao), 
            String(p.frenteServico), 
            String(p.turno), 
            String(p.operador), 
            String(p.total)
          ];
        }
        grandTotal += p.total;
        currentY = drawRow(doc, rowData, currentY, false, false, columnWidths, textPadding, rowHeight);
      }

      // Totais Gerais
      currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, 40);
      doc.y = currentY;

      let totalRowData;
      if (isDetailed) {
        // Ajustado para alinhar com as colunas do modelo detalhado
        totalRowData = ['', '', '', '', '', '', '', '', '', '', '', 'Total Geral', String(grandTotal.toFixed(2))];
      } else {
        // Ajustado para alinhar com as colunas do modelo resumido
        totalRowData = ['', '', '', '', '', 'Total Geral', String(grandTotal.toFixed(2))];
      }
      drawRow(doc, totalRowData, currentY, false, true, columnWidths, textPadding, rowHeight);

      doc.end();
    } catch (error) { 
        console.error("Erro no PDF de Perda:", error);
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
      
      const csvWriter = createObjectCsvWriter({ 
        path: filePath, 
        header, 
        // Adicionado para garantir compatibilidade com Excel no Brasil
        separator: ';', 
        withBOM: true 
      });
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
        console.error('Erro: Nenhum planId fornecido para o relatório de colheita.');
        await generatePdfHeader(doc, 'Relatório Customizado de Colheita', generatedBy);
        doc.text('Nenhum plano de colheita selecionado.');
        doc.end();
        return;
      }

      const harvestPlanDoc = await db.collection('harvestPlans').doc(planId).get();
      if (!harvestPlanDoc.exists) {
        console.error(`Erro: Plano de colheita com ID ${planId} não encontrado.`);
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

      // Definindo todos os cabeçalhos possíveis e suas larguras fixas
      // Largura total disponível: 297mm - 60mm (margens) = 237mm = ~671 pontos
      const allPossibleHeadersConfig = [
        { id: 'seq', title: 'Seq.', width: 25 },
        { id: 'fazenda', title: 'Fazenda', width: 90 },
        { id: 'talhoes', title: 'Talhões', width: 110 },
        { id: 'area', title: 'Área (ha)', width: 55 },
        { id: 'producao', title: 'Prod. (ton)', width: 55 },
        { id: 'variedade', title: 'Variedade', width: 75 },
        { id: 'idade', title: 'Idade Média (meses)', width: 45 },
        { id: 'atr', title: 'ATR', width: 35 },
        { id: 'maturador', title: 'Maturador', width: 75 },
        { id: 'diasAplicacao', title: 'Dias Aplic.', width: 55 },
        { id: 'entrada', title: 'Entrada', width: 55 },
        { id: 'saida', title: 'Saída', width: 55 }
      ];

      // Construir os cabeçalhos finais e suas larguras com base na seleção do usuário
      let finalHeaders = [];
      let finalColumnWidths = [];

      // Adiciona os cabeçalhos fixos iniciais
      const initialFixedHeaders = ['seq', 'fazenda', 'talhoes', 'area', 'producao'];
      initialFixedHeaders.forEach(id => {
          const header = allPossibleHeadersConfig.find(h => h.id === id);
          if (header) {
              finalHeaders.push(header);
              finalColumnWidths.push(header.width);
          }
      });

      // Adiciona os cabeçalhos opcionais selecionados
      allPossibleHeadersConfig.forEach(header => {
          if (selectedCols[header.id] && !initialFixedHeaders.includes(header.id) && header.id !== 'entrada' && header.id !== 'saida') {
              finalHeaders.push(header);
              finalColumnWidths.push(header.width);
          }
      });

      // Adiciona os cabeçalhos fixos finais (Entrada e Saída)
      const finalFixedHeaders = ['entrada', 'saida'];
      finalFixedHeaders.forEach(id => {
          const header = allPossibleHeadersConfig.find(h => h.id === id);
          if (header) {
              finalHeaders.push(header);
              finalColumnWidths.push(header.width);
          }
      });
      
      const headersText = finalHeaders.map(h => h.title);

      const rowHeight = 18;
      const textPadding = 5;

      currentY = drawRow(doc, headersText, currentY, true, false, finalColumnWidths, textPadding, rowHeight);

      let grandTotalProducao = 0;
      let grandTotalArea = 0;
      let currentDate = new Date(harvestPlan.startDate + 'T03:00:00Z');
      const dailyTon = parseFloat(harvestPlan.dailyRate) || 1;

      for (let i = 0; i < harvestPlan.sequence.length; i++) {
        const group = harvestPlan.sequence[i];
        
        grandTotalProducao += group.totalProducao;
        grandTotalArea += group.totalArea;

        const diasNecessarios = dailyTon > 0 ? group.totalProducao / dailyTon : 0;
        const dataEntrada = new Date(currentDate.getTime());
        currentDate.setDate(currentDate.getDate() + diasNecessarios);
        const dataSaida = new Date(currentDate.getTime());

        // Calcula Idade Média e Dias de Aplicação
        let totalAgeInDays = 0;
        let plotsWithDate = 0;
        const allVarieties = new Set();
        
        const farm = fazendasData[group.fazendaCodigo];

        // Criar um mapa de talhões para busca eficiente por ID ou nome
        const talhaoMap = new Map();
        if (farm && farm.talhoes) {
            farm.talhoes.forEach(t => {
                talhaoMap.set(t.id, t); // Mapeia por ID (número)
                talhaoMap.set(String(t.id), t); // Mapeia por ID (string, para segurança)
                talhaoMap.set(t.name.toUpperCase().trim(), t); // Mapeia por nome (maiúsculas e sem espaços extras)
            });
        }

        group.plots.forEach(plot => {
            let talhao = null;
            // Tenta encontrar por ID (número ou string)
            if (talhaoMap.has(plot.talhaoId)) {
                talhao = talhaoMap.get(plot.talhaoId);
            } else if (talhaoMap.has(String(plot.talhaoId))) { // Explicitamente tenta versão string
                talhao = talhaoMap.get(String(plot.talhaoId));
            }
            // Se não encontrou por ID, tenta por nome (normalizado)
            if (!talhao && plot.talhaoName) {
                talhao = talhaoMap.get(plot.talhaoName.toUpperCase().trim());
            }

            if (talhao) {
                if (talhao.dataUltimaColheita) {
                    const formattedDate = parseDateDDMMYYYY(String(talhao.dataUltimaColheita)); // Garante que é string
                    const dataUltima = new Date(formattedDate + 'T03:00:00Z'); 
                    if (!isNaN(dataUltima.getTime())) { // Verifica se a data é válida
                        totalAgeInDays += Math.abs(dataEntrada.getTime() - dataUltima.getTime());
                        plotsWithDate++;
                    } else {
                        console.warn(`WARN: dataUltimaColheita inválida ou formato inesperado para talhão ${talhao.name} (ID: ${talhao.id}): ${talhao.dataUltimaColheita}`);
                    }
                }
                if (talhao.variedade) {
                    allVarieties.add(talhao.variedade);
                }
            } else {
                console.warn(`WARN: Talhão "${plot.talhaoName}" (ID: ${plot.talhaoId}) na Fazenda ${group.fazendaCodigo} NÃO ENCONTRADO NO CADASTRO DE FAZENDAS. Usando valores padrão.`);
            }
        });

        const idadeMediaMeses = plotsWithDate > 0 ? (Math.ceil(totalAgeInDays / plotsWithDate / (1000 * 60 * 60 * 24)) / 30).toFixed(1) : 'N/A';
        
        let diasAplicacao = 'N/A';
        if (group.maturadorDate) {
            try {
                const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
                // Calcula a diferença em relação à data de entrada do grupo no plano, não à data atual
                const diffTime = dataEntrada.getTime() - applicationDate.getTime();
                if (diffTime >= 0) { 
                    diasAplicacao = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                }
            } catch (e) {
                diasAplicacao = 'N/A';
            }
        }

        const rowDataMap = {
            seq: String(i + 1), 
            fazenda: String(`${group.fazendaCodigo} - ${group.fazendaName}`), 
            talhoes: String(group.plots.map(p => p.talhaoName).join(', ')), 
            area: String(group.totalArea.toFixed(2)), 
            producao: String(group.totalProducao.toFixed(2)), 
            variedade: String(Array.from(allVarieties).join(', ') || 'N/A'), 
            idade: String(idadeMediaMeses), 
            atr: String(group.atr || 'N/A'), 
            maturador: String(group.maturador || 'N/A'), 
            diasAplicacao: String(diasAplicacao), 
            entrada: String(dataEntrada.toLocaleDateString('pt-BR')), 
            saida: String(dataSaida.toLocaleDateString('pt-BR')) 
        };
        
        const rowData = finalHeaders.map(h => rowDataMap[h.id]);

        currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, rowHeight);
        currentY = drawRow(doc, rowData, currentY, false, false, finalColumnWidths, textPadding, rowHeight);
      }

      // Totais Gerais
      currentY = await checkPageBreak(doc, currentY, title, filters.generatedBy, 40);
      doc.y = currentY;
      
      const totalRowData = Array(finalHeaders.length).fill('');
      totalRowData[finalHeaders.findIndex(h => h.id === 'fazenda')] = 'Total Geral';
      totalRowData[finalHeaders.findIndex(h => h.id === 'area')] = String(grandTotalArea.toFixed(2)); 
      totalRowData[finalHeaders.findIndex(h => h.id === 'producao')] = String(grandTotalProducao.toFixed(2)); 

      drawRow(doc, totalRowData, currentY, false, true, finalColumnWidths, textPadding, rowHeight);

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
        { id: 'entrada', title: 'Entrada' }, 
        { id: 'saida', title: 'Saída' }    
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
        const diasNecessarios = dailyTon > 0 ? group.totalProducao / dailyTon : 0;
        const dataEntrada = new Date(currentDate.getTime());
        currentDate.setDate(currentDate.getDate() + diasNecessarios);
        const dataSaida = new Date(currentDate.getTime());

        // Calcula Idade Média e Dias de Aplicação
        let totalAgeInDays = 0;
        let plotsWithDate = 0;
        const allVarieties = new Set();
        
        const farm = fazendasData[group.fazendaCodigo];

        const talhaoMap = new Map();
        if (farm && farm.talhoes) {
            farm.talhoes.forEach(t => {
                talhaoMap.set(t.id, t);
                talhaoMap.set(String(t.id), t); 
                talhaoMap.set(t.name.toUpperCase().trim(), t);
            });
        }

        group.plots.forEach(plot => {
            let talhao = null;
            if (talhaoMap.has(plot.talhaoId)) {
                talhao = talhaoMap.get(plot.talhaoId);
            } else if (talhaoMap.has(String(plot.talhaoId))) {
                talhao = talhaoMap.get(String(plot.talhaoId));
            }
            if (!talhao && plot.talhaoName) {
                talhao = talhaoMap.get(plot.talhaoName.toUpperCase().trim());
            }

            if (talhao) {
                if (talhao.dataUltimaColheita) {
                    const formattedDate = parseDateDDMMYYYY(String(talhao.dataUltimaColheita));
                    const dataUltima = new Date(formattedDate + 'T03:00:00Z');
                    if (!isNaN(dataUltima.getTime())) {
                        totalAgeInDays += Math.abs(dataEntrada.getTime() - dataUltima.getTime());
                        plotsWithDate++;
                    }
                }
                if (talhao.variedade) {
                    allVarieties.add(talhao.variedade);
                }
            }
        });

        const idadeMediaMeses = plotsWithDate > 0 ? (Math.ceil(totalAgeInDays / plotsWithDate / (1000 * 60 * 60 * 24)) / 30).toFixed(1) : 'N/A';
        
        let diasAplicacao = 'N/A';
        if (group.maturadorDate) {
            try {
                const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
                // Calcula a diferença em relação à data de entrada do grupo no plano, não à data atual
                const diffTime = dataEntrada.getTime() - applicationDate.getTime();
                if (diffTime >= 0) { 
                    diasAplicacao = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                }
            } catch (e) {
                diasAplicacao = 'N/A';
            }
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
                case 'entrada': record.entrada = dataEntrada.toLocaleDateString('pt-BR'); break;
                case 'saida': record.saida = dataSaida.toLocaleDateString('pt-BR'); break;
                default: record[header.id] = ''; // Fallback for any unexpected header
            }
        });
        records.push(record);
      });

      const csvWriter = createObjectCsvWriter({ 
        path: filePath, 
        header: finalHeaders, 
        // Adicionado para garantir compatibilidade com Excel no Brasil
        separator: ';', 
        withBOM: true 
      });
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
