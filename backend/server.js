// server.js - Backend com Geração de PDF e Upload de Logo

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const axios = require('axios');
// Removido: const multer = require('multer'); // Não é mais necessário para upload de Base64

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumenta o limite para receber strings Base64 grandes

// Removido: const storage = multer.memoryStorage();
// Removido: const upload = multer({ storage: storage });

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ 
    credential: admin.credential.cert(serviceAccount),
    // O storageBucket não é mais usado diretamente pelo backend para upload/download de logo,
    // mas pode ser mantido se outras partes da sua aplicação o utilizarem.
    storageBucket: "agrovetor-v2.appspot.com" 
  });
  const db = admin.firestore();
  // Removido: const bucket = admin.storage().bucket();
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


  // --- FUNÇÕES AUXILIARES E OUTRAS ROTAS (com alterações para o logo) ---

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

  // [CORREÇÃO]: Função para adicionar o rodapé
  const addPdfFooter = (doc, generatedBy) => {
    const bottomMargin = doc.page.margins.bottom;
    const pageHeight = doc.page.height;
    // Posição Y para o rodapé, um pouco acima da margem inferior
    const footerY = pageHeight - bottomMargin + 10; 

    // Desenha uma linha horizontal fina acima do texto do rodapé
    doc.lineCap('butt')
       .lineWidth(0.5)
       .moveTo(doc.page.margins.left, footerY - 5)
       .lineTo(doc.page.width - doc.page.margins.right, footerY - 5)
       .stroke();

    doc.fontSize(8).font('Helvetica');

    // Texto "Gerado por" alinhado à esquerda
    doc.text(
      `Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`,
      doc.page.margins.left,
      footerY,
      { align: 'left', width: (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 } 
    );

    // Numeração da página alinhada à direita
    doc.text(
      `Página ${doc.page.number}`, 
      (doc.page.width / 2) + doc.page.margins.left, 
      footerY,
      { align: 'right', width: (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 } 
    );
  };


  app.get('/reports/brocamento/pdf', async (req, res) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
    doc.pipe(res); // Inicia o stream do PDF para a resposta

    const filters = req.query;
    const generatedBy = filters.generatedBy || 'N/A'; 

    // [CORREÇÃO]: Adiciona o evento para desenhar o rodapé em cada página
    doc.on('pageAdded', () => {
      addPdfFooter(doc, generatedBy);
    });

    try {
      const data = await getFilteredData('registros', filters);
      
      if (data.length === 0) {
        await generatePdfHeader(doc, 'Relatório de Inspeção de Broca');
        doc.text('Nenhum dado encontrado para os filtros selecionados.');
      } else {
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
        
        let currentY = await generatePdfHeader(doc, title); 

        const headers = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
        const columnWidthsA = [160, 60, 60, 100, 80, 60, 45, 45, 45, 55, 62]; 
        const columnWidthsB = [75, 80, 160, 90, 75, 50, 50, 50, 70, 77];

        const rowHeight = 18;
        const textPadding = 5;

        const drawRow = (rowData, y, isHeader = false, isFooter = false, customWidths) => {
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
              doc.text(String(cell), currentX + textPadding, y + 5, { width: customWidths[i] - (textPadding * 2), align: 'left'});
              currentX += customWidths[i];
          });
          return y + rowHeight;
        };
        
        // [CORREÇÃO]: Revertendo o ajuste de neededSpace para o padrão, o rodapé é desenhado *após* o conteúdo.
        const checkPageBreak = async (y, neededSpace = rowHeight) => {
          if (y > doc.page.height - doc.page.margins.bottom - neededSpace) { 
              doc.addPage();
              return await generatePdfHeader(doc, title); 
          }
          return y;
        };
        
        if (!isModelB) { // Modelo A
          currentY = drawRow(headers, currentY, true, false, columnWidthsA);
          for(const r of enrichedData) {
              currentY = await checkPageBreak(currentY);
              currentY = drawRow([`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsA);
          }
        } else { // Modelo B
          const groupedData = enrichedData.reduce((acc, reg) => {
            const key = `${reg.codigo} - ${reg.fazenda}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(reg);
            return acc;
          }, {});

          for (const fazendaKey of Object.keys(groupedData).sort()) {
            currentY = await checkPageBreak(currentY, 40);
            doc.y = currentY;
            doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
            currentY = doc.y + 5;

            currentY = await checkPageBreak(currentY);
            currentY = drawRow(headers.slice(1), currentY, true, false, columnWidthsB);

            const farmData = groupedData[fazendaKey];
            for(const r of farmData) {
                currentY = await checkPageBreak(currentY);
                currentY = drawRow([r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsB);
            }
            
            const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
            const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
            const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
            const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
            const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
            const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';
            
            const subtotalRow = ['', '', '', 'Sub Total', subTotalEntrenos, subTotalBase, subTotalMeio, subTotalTopo, subTotalBrocado, subTotalPercent];
            currentY = drawRow(subtotalRow, currentY, false, true, columnWidthsB);
            currentY += 10;
          }
        }
        
        const grandTotalEntrenos = enrichedData.reduce((sum, r) => sum + r.entrenos, 0);
        const grandTotalBrocado = enrichedData.reduce((sum, r) => sum + r.brocado, 0);
        const grandTotalBase = enrichedData.reduce((sum, r) => sum + r.base, 0);
        const grandTotalMeio = enrichedData.reduce((sum, r) => sum + r.meio, 0);
        const grandTotalTopo = enrichedData.reduce((sum, r) => sum + r.topo, 0);
        const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

        currentY = await checkPageBreak(currentY, 40);
        doc.y = currentY;
        
        if (!isModelB) {
          const totalRowData = ['', '', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
          drawRow(totalRowData, currentY, false, true, columnWidthsA);
        } else {
          const totalRowDataB = ['', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
          drawRow(totalRowDataB, currentY, false, true, columnWidthsB);
        }
      }
      doc.end(); // Finaliza o documento no final do try
    } catch (error) { 
        console.error("Erro no PDF de Brocamento:", error);
        // Se ocorrer um erro após o pipe, apenas finalize o documento para não travar a conexão
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
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_perda.pdf`);
    doc.pipe(res); // Inicia o stream do PDF para a resposta

    const filters = req.query;
    const generatedBy = filters.generatedBy || 'N/A'; 

    // [CORREÇÃO]: Adiciona o evento para desenhar o rodapé em cada página
    doc.on('pageAdded', () => {
      addPdfFooter(doc, generatedBy);
    });

    try {
      const data = await getFilteredData('perdas', filters);
      if (data.length === 0) {
        await generatePdfHeader(doc, 'Relatório de Perda');
        doc.text('Nenhum dado encontrado.');
      } else {
        const isDetailed = filters.tipoRelatorio === 'B';
        const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
        
        await generatePdfHeader(doc, title); 

        let headers, rows;
        if (isDetailed) {
          headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço', 'Total'];
          rows = data.map(p => [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.canaInteira, p.tolete, p.toco, p.ponta, p.estilhaco, p.pedaco, p.total]);
        } else {
          headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
          rows = data.map(p => [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.total]);
        }
        
        const { table } = require('pdfkit-table');
        await table(doc, { 
            headers, 
            rows,
            prepareHeader: () => doc.font('Helvetica-Bold'), 
            prepareRow: () => doc.font('Helvetica'),
        });
      }
      doc.end(); // Finaliza o documento no final do try
    } catch (error) { 
        console.error("Erro no PDF de Perda:", error);
        // Se ocorrer um erro após o pipe, apenas finalize o documento para não travar a conexão
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

} catch (error) {
  console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
  app.use((req, res) => res.status(500).send('Erro de configuração do servidor.'));
}

app.listen(port, () => {
  console.log(`Servidor de relatórios rodando na porta ${port}`);
});
