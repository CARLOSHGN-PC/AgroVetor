// server.js - Backend para Geração de Relatórios (Pronto para Deploy)

// 1. Importação das dependências
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit-table');
const { createObjectCsvWriter } = require('csv-writer');

// 2. Inicialização do App Express
const app = express();
// A porta será fornecida pelo ambiente de deploy (Render), ou 3001 para testes locais
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// 3. Configuração Segura do Firebase Admin SDK
// A chave de serviço será lida da variável de ambiente, não de um arquivo!
try {
  // Converte a string da variável de ambiente de volta para um objeto JSON
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();
  console.log('Firebase Admin SDK inicializado com sucesso.');

  // --- Rota de Teste (Health Check) ---
  app.get('/', (req, res) => {
    res.status(200).send('Servidor de relatórios AgroVetor está online e conectado ao Firebase!');
  });


  // --- FUNÇÕES AUXILIARES ---
  const getFilteredData = async (collectionName, filters) => {
      let query = db.collection(collectionName);
      if (filters.inicio) query = query.where('data', '>=', filters.inicio);
      if (filters.fim) query = query.where('data', '<=', filters.fim);
      if (filters.codigo) query = query.where('codigo', '==', filters.codigo);
      // Adicione outros filtros conforme necessário
      const snapshot = await query.get();
      const data = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      return data;
  };

  // --- ROTAS DA API DE RELATÓRIOS ---

  // Rota para Relatório de Brocamento em PDF
  app.get('/reports/brocamento/pdf', async (req, res) => {
      try {
          console.log('Recebida requisição para relatório de brocamento PDF com filtros:', req.query);
          const filters = {
              inicio: req.query.inicio,
              fim: req.query.fim,
              codigo: req.query.fazendaCodigo // Usamos 'codigo' no banco
          };

          const data = await getFilteredData('registros', filters);
          if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');

          const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
          doc.pipe(res);
          doc.fontSize(18).text('Relatório Geral de Brocamento', { align: 'center' });
          doc.fontSize(10).text(`Período: ${filters.inicio} a ${filters.fim}`, { align: 'center' });
          doc.moveDown();

          const table = {
              headers: ['Data', 'Fazenda', 'Talhão', 'Corte', 'Entrenós', 'Brocado', 'Brocamento (%)'],
              rows: data.map(r => [ r.data, `${r.codigo} - ${r.fazenda}`, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento ]),
          };
          await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });
          doc.end();
      } catch (error) {
          console.error('Erro ao gerar relatório de brocamento PDF:', error);
          res.status(500).send('Erro interno ao gerar o relatório.');
      }
  });

  // Rota para Relatório de Brocamento em CSV
  app.get('/reports/brocamento/csv', async (req, res) => {
      try {
          console.log('Recebida requisição para relatório de brocamento CSV com filtros:', req.query);
          const filters = { inicio: req.query.inicio, fim: req.query.fim, codigo: req.query.fazendaCodigo };
          const data = await getFilteredData('registros', filters);
          if (data.length === 0) return res.status(404).send('Nenhum dado encontrado.');

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.csv');

          const csvWriter = createObjectCsvWriter({
              path: 'relatorio_brocamento.csv', // Arquivo temporário
              header: [
                  {id: 'fazenda', title: 'Fazenda'}, {id: 'data', title: 'Data'}, {id: 'talhao', title: 'Talhão'},
                  {id: 'corte', title: 'Corte'}, {id: 'entrenos', title: 'Entrenós'}, {id: 'brocado', title: 'Brocado'},
                  {id: 'brocamento', title: 'Brocamento (%)'}
              ]
          });
          const records = data.map(r => ({ ...r, fazenda: `${r.codigo} - ${r.fazenda}` }));
          await csvWriter.writeRecords(records);
          res.sendFile(path.join(__dirname, 'relatorio_brocamento.csv'));
      } catch (error) {
          console.error('Erro ao gerar relatório de brocamento CSV:', error);
          res.status(500).send('Erro interno ao gerar o relatório.');
      }
  });

  // TODO: Adicionar as rotas para os relatórios de Perda (PDF e CSV) aqui, seguindo a mesma lógica.

} catch (error) {
  console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
  // Se não conseguir inicializar o Firebase, retorna erro para todas as rotas
  app.use((req, res, next) => {
    res.status(500).send('Erro de configuração do servidor. A chave do Firebase não foi configurada corretamente.');
  });
}

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
  console.log(`Servidor de relatórios rodando na porta ${port}`);
});
