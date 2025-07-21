// server.js - Backend com Relatórios Melhorados

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit-table');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const axios = require('axios'); // Nova dependência para buscar a imagem do logo

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
    
    return data;
  };

  // Nova função para buscar o logo e desenhar o cabeçalho do PDF
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
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' });
    doc.moveDown(2); // Espaço extra após o cabeçalho
  };


  // --- ROTAS DE RELATÓRIO DE BROCAMENTO ---

  app.get('/reports/brocamento/pdf', async (req, res) => {
    try {
      const filters = req.query;
      const data = await getFilteredData('registros', filters);
      if (data.length === 0) return res.status(404).send('Nenhum dado encontrado para os filtros selecionados.');

      const isModelB = filters.tipoRelatorio === 'B';
      const title = isModelB ? 'Relatório de Brocamento por Fazenda' : 'Relatório Geral de Brocamento';
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
      doc.pipe(res);

      await generatePdfHeader(doc, title);

      const headers = ['Data', 'Talhão', 'Corte', 'Entrenós', 'Base', 'Meio', 'Topo', 'Brocado', 'Brocamento (%)'];
      
      // Totais gerais
      let grandTotalEntrenos = 0;
      let grandTotalBrocado = 0;

      if (!isModelB) { // Modelo A
        const rows = data.map(r => [r.data, r.talhao, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento]);
        grandTotalEntrenos = data.reduce((sum, r) => sum + r.entrenos, 0);
        grandTotalBrocado = data.reduce((sum, r) => sum + r.brocado, 0);
        
        const table = { headers, rows };
        await doc.table(table, { prepareHeader: () => doc.font('Helvetica-Bold'), prepareRow: () => doc.font('Helvetica') });

      } else { // Modelo B
        const groupedData = data.reduce((acc, reg) => {
          const key = `${reg.codigo} - ${reg.fazenda}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push(reg);
          return acc;
        }, {});

        for (const fazendaKey of Object.keys(groupedData).sort()) {
          doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, { continued: false });
          doc.moveDown(0.5);

          const farmData = groupedData[fazendaKey];
          const rows = farmData.map(r => [r.data, r.talhao, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento]);
          
          const subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
          const subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
          grandTotalEntrenos += subTotalEntrenos;
          grandTotalBrocado += subTotalBrocado;
          const subTotalPercent = subTotalEntrenos > 0 ? ((subTotalBrocado / subTotalEntrenos) * 100).toFixed(2) + '%' : '0.00%';

          const table = {
            headers,
            rows,
            footers: [
                ['', '', 'Subtotal', subTotalEntrenos, '', '', '', subTotalBrocado, subTotalPercent]
            ]
          };
          await doc.table(table, { 
              prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
              prepareRow: () => doc.font('Helvetica').fontSize(8),
              prepareFooter: () => doc.font('Helvetica-Bold').fontSize(8),
          });
          doc.moveDown();
        }
      }

      // Adiciona o Total Geral no final do documento
      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text('Resumo Geral do Período');
      const totalPercent = grandTotalEntrenos > 0 ? ((grandTotalBrocado / grandTotalEntrenos) * 100).toFixed(2) + '%' : '0.00%';
      const summaryTable = {
          headers: ['Total Entrenós', 'Total Brocado', 'Brocamento Ponderado (%)'],
          rows: [
              [grandTotalEntrenos, grandTotalBrocado, totalPercent]
          ]
      };
      await doc.table(summaryTable, { width: 400 });

      // Finaliza o PDF
      doc.end();
    } catch (error) { 
        console.error("Erro no PDF de Brocamento:", error);
        res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
    }
  });

  // ... (outras rotas permanecem iguais por enquanto)

} catch (error) {
  console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
  app.use((req, res) => res.status(500).send('Erro de configuração do servidor.'));
}

app.listen(port, () => {
  console.log(`Servidor de relatórios rodando na porta ${port}`);
});
