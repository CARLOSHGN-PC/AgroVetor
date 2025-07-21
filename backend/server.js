// server.js - Backend para Geração de Relatórios (Versão Final e Completa)

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit-table');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');

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
    
    return data;
  };

  // --- ROTA DE BROCAMENTO PDF ---
  app.get('/reports/brocamento/pdf', async (req, res) => {
    try {
      const filters = req.query;
      const data = await getFilteredData('registros', filters);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

      const isModelB = filters.tipoRelatorio === 'B';
      const title = isModelB ? 'Relatório de Brocamento por Fazenda' : 'Relatório Geral de Brocamento';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      doc.pipe(res);
      doc.fontSize(18).text(title, { align: 'center' });
      doc.moveDown();

      if (!isModelB) {
        const table = {
          headers: ['Data', 'Fazenda', 'Talhão', 'Corte', 'Entrenós', 'Brocado', 'Brocamento (%)'],
          rows: data.map(r => [r.data, `${r.codigo} - ${r.fazenda}`, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento]),
        };
        await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
      } else {
        const groupedData = data.reduce((acc, reg) => {
          const key = `${reg.codigo} - ${reg.fazenda}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(reg);
          return acc;
        }, {});

        let finalY = doc.y;
        for (const fazendaKey of Object.keys(groupedData).sort()) {
          if (finalY > 480) { doc.addPage(); finalY = 30; } // Reinicia Y na nova página
          doc.y = finalY;
          doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, { continued: false });
          doc.moveDown(0.5);

          const farmData = groupedData[fazendaKey];
          const table = {
            headers: ['Data', 'Talhão', 'Corte', 'Entrenós', 'Brocado', 'Brocamento (%)'],
            rows: farmData.map(r => [r.data, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento])
          };
          await doc.table(table, { 
              prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
              prepareRow: () => doc.font('Helvetica').fontSize(8)
          });
          finalY = doc.y + 20;
        }
      }
      doc.end();
    } catch (error) { 
        console.error("Erro no PDF de Brocamento:", error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
    }
  });

  // --- ROTA DE BROCAMENTO CSV ---
  app.get('/reports/brocamento/csv', async (req, res) => {
    try {
      const data = await getFilteredData('registros', req.query);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');
      
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
    } catch (error) { 
        console.error("Erro no CSV de Brocamento:", error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
    }
  });

  // --- ROTA DE PERDA PDF ---
  app.get('/reports/perda/pdf', async (req, res) => {
    try {
      const filters = req.query;
      const data = await getFilteredData('perdas', filters);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

      const isDetailed = filters.tipoRelatorio === 'B';
      const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_perda.pdf`);
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      doc.pipe(res);
      doc.fontSize(18).text(title, { align: 'center' });
      doc.moveDown();

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
    } catch (error) { 
        console.error("Erro no PDF de Perda:", error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
    }
  });

  // --- ROTA DE PERDA CSV ---
  app.get('/reports/perda/csv', async (req, res) => {
    try {
      const filters = req.query;
      const data = await getFilteredData('perdas', filters);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

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
    } catch (error) { 
        console.error("Erro no CSV de Perda:", error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
    }
  });

} catch (error) {
  console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
  app.use((req, res) => res.status(500).send('Erro de configuração do servidor.'));
}

app.listen(port, () => {
  console.log(`Servidor de relatórios rodando na porta ${port}`);
});
