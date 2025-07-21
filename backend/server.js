// server.js - Backend com Correção Definitiva de Layout e Totais

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit-table');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  console.log('Firebase Admin SDK inicializado com sucesso.');

  app.get('/', (req, res) => {
    res.status(200).send('Servidor de relatórios AgroVetor está online e conectado ao Firebase!');
  });

  // --- FUNÇÕES AUXILIARES ---

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
      if (configDoc.exists && configDoc.data().logoUrl) {
        const logoUrl = configDoc.data().logoUrl;
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(response.data, 'binary');
        doc.image(logoBuffer, 30, 25, { width: 100 });
      }
    } catch (error) {
      console.error("Não foi possível carregar o logotipo:", error.message);
    }
    
    doc.fontSize(18).text(title, { align: 'center', valign: 'center' });
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, doc.page.width - 180, 30, { align: 'right', width: 150 });
    doc.moveDown(3);
  };

  // --- ROTA DE BROCAMENTO PDF (LÓGICA CORRIGIDA) ---
  app.get('/reports/brocamento/pdf', async (req, res) => {
    try {
      const filters = req.query;
      const data = await getFilteredData('registros', filters);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');
      
      const fazendasSnapshot = await db.collection('fazendas').get();
      const fazendasData = {};
      fazendasSnapshot.forEach(doc => {
        fazendasData[doc.data().code] = doc.data();
      });

      const enrichedData = data.map(reg => {
          const farm = fazendasData[reg.codigo];
          const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === reg.talhao.toUpperCase());
          return { ...reg, variedade: talhao?.variedade || 'N/A' };
      });

      const isModelB = filters.tipoRelatorio === 'B';
      const title = 'Relatório de Inspeção de Broca';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
      doc.pipe(res);

      await generatePdfHeader(doc, title);

      const headers = ['Fazenda', 'Data', 'Talhão', 'Variedade', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', '% Broca'];
      const columnWidths = [140, 60, 60, 80, 40, 60, 40, 40, 40, 50, 60]; // Larguras definidas

      if (!isModelB) { // Modelo A
        const rows = enrichedData.map(r => [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento]);
        await doc.table({ headers, rows }, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
            prepareRow: () => doc.font('Helvetica').fontSize(8),
            columnsSize: columnWidths
        });
      } else { // Modelo B
        const groupedData = enrichedData.reduce((acc, reg) => {
          const key = `${reg.codigo} - ${reg.fazenda}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(reg);
          return acc;
        }, {});

        for (const fazendaKey of Object.keys(groupedData).sort()) {
          if (doc.y > doc.page.height - 150) {
              doc.addPage();
              await generatePdfHeader(doc, title);
          }

          doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, { continued: false });
          doc.moveDown(0.5);

          const farmData = groupedData[fazendaKey];
          const rows = farmData.map(r => [r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento]);
          
          await doc.table({
            headers: headers.slice(1),
            rows,
          }, { 
              prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
              prepareRow: () => doc.font('Helvetica').fontSize(8),
              columnsSize: columnWidths.slice(1)
          });

          const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
          const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
          const subTotalBase = farmData.reduce((sum, r) => sum + r.base, 0);
          const subTotalMeio = farmData.reduce((sum, r) => sum + r.meio, 0);
          const subTotalTopo = farmData.reduce((sum, r) => sum + r.topo, 0);
          const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';
          
          doc.font('Helvetica-Bold').fontSize(8).text(
            `SUBTOTAL:  BASE ${subTotalBase} | MEIO ${subTotalMeio} | TOPO ${subTotalTopo} | ENTRENÓS ${subTotalEntrenos} | BROCADO ${subTotalBrocado} | PONDERADO ${subTotalPercent}`,
            { align: 'right' }
          );
          doc.moveDown(2);
        }
      }
      
      const grandTotalEntrenos = enrichedData.reduce((sum, r) => sum + r.entrenos, 0);
      const grandTotalBrocado = enrichedData.reduce((sum, r) => sum + r.brocado, 0);
      const grandTotalBase = enrichedData.reduce((sum, r) => sum + r.base, 0);
      const grandTotalMeio = enrichedData.reduce((sum, r) => sum + r.meio, 0);
      const grandTotalTopo = enrichedData.reduce((sum, r) => sum + r.topo, 0);
      const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2).replace('.', ',') + '%' : '0,00%';

      if (doc.y > doc.page.height - 100) {
          doc.addPage();
          await generatePdfHeader(doc, title);
      }

      doc.moveDown(3);
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(
        `TOTAL GERAL:  BASE ${grandTotalBase} | MEIO ${grandTotalMeio} | TOPO ${grandTotalTopo} | ENTRENÓS ${grandTotalEntrenos} | BROCADO ${grandTotalBrocado} | PONDERADO ${totalPercent}`,
        { align: 'left' }
      );

      doc.end();
    } catch (error) { 
        console.error("Erro no PDF de Brocamento:", error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
    }
  });

  // --- OUTRAS ROTAS ---
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
    try {
      const filters = req.query;
      const data = await getFilteredData('perdas', filters);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

      const isDetailed = filters.tipoRelatorio === 'B';
      const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_perda.pdf`);
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      doc.pipe(res);
      await generatePdfHeader(doc, title);

      let headers, rows;
      if (isDetailed) {
        headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço', 'Total'];
        rows = data.map(p => [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.canaInteira, p.tolete, p.toco, p.ponta, p.estilhaco, p.pedaco, p.total]);
      } else {
        headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
        rows = data.map(p => [p.data, `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.total]);
      }
      
      await doc.table({ headers, rows }, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
      doc.end();
    } catch (error) { res.status(500).send('Erro ao gerar relatório.'); }
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
