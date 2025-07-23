// server.js - Backend com Geração de PDF e Upload de Logo

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const axios = require('axios');

// [CORREÇÃO CRÍTICA]: Inicializa pdfkit-table para estender PDFDocument
require('pdfkit-table')(PDFDocument); 

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


  // --- FUNÇÕES AUXILIARES E OUTRAS ROTAS ---

  const getFilteredData = async (collectionName, filters) => {
    console.log(`[getFilteredData - ${collectionName}] Iniciando busca com filtros:`, filters);
    let queryRef = db.collection(collectionName);
    
    if (filters.inicio) {
      queryRef = queryRef.where('data', '>=', filters.inicio);
      console.log(`[getFilteredData - ${collectionName}] Aplicando filtro Firestore: data >= ${filters.inicio}`);
    }
    if (filters.fim) {
      queryRef = queryRef.where('data', '<=', filters.fim);
      console.log(`[getFilteredData - ${collectionName}] Aplicando filtro Firestore: data <= ${filters.fim}`);
    }
    
    let data = [];
    try {
        const snapshot = await queryRef.get();
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        console.log(`[getFilteredData - ${collectionName}] Dados brutos do Firestore (${data.length} registros). Exemplo de ID: ${data.length > 0 ? data[0].id : 'N/A'}`);
        if (data.length > 0) {
            console.log(`[getFilteredData - ${collectionName}] Exemplo de registro (data, codigo, talhao, matricula, frenteServico):`, data[0].data, data[0].codigo, data[0].talhao, data[0].matricula, data[0].frenteServico);
        }
    } catch (firestoreError) {
        console.error(`[getFilteredData - ${collectionName}] ERRO na consulta ao Firestore:`, firestoreError.code, firestoreError.message);
        console.error(`[getFilteredData - ${collectionName}] Se for "failed-precondition", verifique os índices no console do Firebase.`);
        return []; 
    }

    let currentDataLength = data.length;

    if (filters.fazendaCodigo) {
      data = data.filter(d => d.codigo === filters.fazendaCodigo);
      console.log(`[getFilteredData - ${collectionName}] Filtrado por fazendaCodigo (${filters.fazendaCodigo}). Registros restantes: ${data.length} (antes: ${currentDataLength})`);
      currentDataLength = data.length;
    }
    if (filters.matricula) {
      data = data.filter(d => d.matricula === filters.matricula);
      console.log(`[getFilteredData - ${collectionName}] Filtrado por matricula (${filters.matricula}). Registros restantes: ${data.length} (antes: ${currentDataLength})`);
      currentDataLength = data.length;
    }
    if (filters.talhao) {
      data = data.filter(d => d.talhao && d.talhao.toLowerCase().includes(filters.talhao.toLowerCase()));
      console.log(`[getFilteredData - ${collectionName}] Filtrado por talhao (${filters.talhao}). Registros restantes: ${data.length} (antes: ${currentDataLength})`);
      currentDataLength = data.length;
    }
    if (filters.frenteServico) {
      data = data.filter(d => d.frenteServico && d.frenteServico.toLowerCase().includes(filters.frenteServico.toLowerCase()));
      console.log(`[getFilteredData - ${collectionName}] Filtrado por frenteServico (${filters.frenteServico}). Registros restantes: ${data.length} (antes: ${currentDataLength})`);
      currentDataLength = data.length;
    }
    
    data.sort((a, b) => new Date(a.data) - new Date(b.data));
    console.log(`[getFilteredData - ${collectionName}] Retornando ${data.length} registros finais após todas as filtragens.`);
    return data;
  };

  const generatePdfHeader = async (doc, title, generatedBy = 'N/A') => {
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
    doc.fontSize(10).font('Helvetica').text(`Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' });
    doc.moveDown(2);
    return doc.y;
  };

  // Função para adicionar o rodapé
  const addPdfFooter = (doc, generatedBy) => {
    doc.save(); 

    const bottomMargin = doc.page.margins.bottom;
    const pageHeight = doc.page.height;
    const footerY = pageHeight - bottomMargin + 10; 

    doc.lineCap('butt')
       .lineWidth(0.5)
       .moveTo(doc.page.margins.left, footerY - 5)
       .lineTo(doc.page.width - doc.page.margins.right, footerY - 5)
       .stroke();

    doc.fontSize(8).font('Helvetica');

    doc.text(
      `Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`,
      doc.page.margins.left,
      footerY,
      { align: 'left', width: (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 } 
    );

    doc.text(
      `Página ${doc.page.number}`, 
      (doc.page.width / 2) + doc.page.margins.left, 
      footerY,
      { align: 'right', width: (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 } 
    );

    doc.restore(); 
  };

  // [CORREÇÃO]: Funções auxiliares para o relatório de colheita - Movidas para o escopo global
  const calculateAverageAge = (group, startDate, allFazendas) => {
    let totalAgeInDays = 0;
    let plotsWithDate = 0;
    // allFazendas é um array de objetos fazenda, precisamos encontrar pelo código
    const farm = allFazendas.find(f => f.code === group.fazendaCodigo);
    if (!farm) return 'N/A';

    group.plots.forEach(plot => {
        const talhao = farm.talhoes.find(t => t.id === plot.talhaoId);
        if (talhao && talhao.dataUltimaColheita && startDate) {
            const dataInicioPlano = new Date(startDate + 'T03:00:00Z');
            const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
            if (!isNaN(dataInicioPlano) && !isNaN(dataUltima)) {
                totalAgeInDays += Math.abs(dataInicioPlano - dataUltima);
                plotsWithDate++;
            }
        }
    });

    if (plotsWithDate > 0) {
        const avgDiffTime = totalAgeInDays / plotsWithDate;
        const avgDiffDays = Math.ceil(avgDiffTime / (1000 * 60 * 60 * 24));
        return (avgDiffDays / 30).toFixed(1);
    }
    return 'N/A';
  };

  const calculateMaturadorDays = (group) => {
    if (!group.maturadorDate) {
        return 'N/A';
    }
    try {
        const today = new Date();
        const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
        const diffTime = today - applicationDate;
        if (diffTime < 0) return 0;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (e) {
        return 'N/A';
    }
  };


  app.get('/reports/brocamento/pdf', async (req, res) => {
    console.log('[brocamento/pdf] Requisição recebida.');
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_brocamento.pdf');
    doc.pipe(res); 

    const filters = req.query;
    const generatedBy = filters.generatedBy || 'N/A'; 

    doc.on('pageAdded', () => {
      addPdfFooter(doc, generatedBy);
    });

    try {
      const data = await getFilteredData('registros', filters);
      console.log(`[brocamento/pdf] Dados obtidos para relatório: ${data.length} registros.`);
      
      if (data.length === 0) {
        await generatePdfHeader(doc, 'Relatório de Inspeção de Broca', generatedBy); 
        doc.text('Nenhum dado encontrado para os filtros selecionados.');
      } else {
        const fazendasSnapshot = await db.collection('fazendas').get();
        const fazendasData = {};
        fazendasSnapshot.forEach(docSnap => {
          fazendasData[docSnap.data().code] = docSnap.data();
        });
        console.log('[brocamento/pdf] Fazendas Data carregada.');

        const enrichedData = data.map(reg => {
            const farm = fazendasData[reg.codigo];
            const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === reg.talhao.toUpperCase());
            return { ...reg, variedade: talhao?.variedade || 'N/A' };
        });
        console.log(`[brocamento/pdf] Dados enriquecidos: ${enrichedData.length} registros.`);

        const isModelB = filters.tipoRelatorio === 'B';
        const title = 'Relatório de Inspeção de Broca';
        
        let currentY = await generatePdfHeader(doc, title, generatedBy); 
        
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
        
        const checkPageBreak = async (y, neededSpace = rowHeight) => {
          if (y > doc.page.height - doc.page.margins.bottom - neededSpace) { 
              doc.addPage();
              return await generatePdfHeader(doc, title, generatedBy); 
          }
          return y;
        };
        
        if (!isModelB) { // Modelo A
          console.log('[brocamento/pdf] Gerando Modelo A. Headers:', headers);
          currentY = drawRow(headers, currentY, true, false, columnWidthsA);
          for(const r of enrichedData) {
              console.log('[brocamento/pdf] Desenhando linha de dados (Modelo A):', r.id);
              currentY = await checkPageBreak(currentY);
              currentY = drawRow([`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.variedade, r.corte, r.entrenos, r.base, r.meio, r.topo, r.brocado, r.brocamento], currentY, false, false, columnWidthsA);
          }
        } else { // Modelo B
          console.log('[brocamento/pdf] Gerando Modelo B.');
          const groupedData = enrichedData.reduce((acc, reg) => {
            const key = `${reg.codigo} - ${reg.fazenda}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(reg);
            return acc;
          }, {});
          console.log('[brocamento/pdf] Dados agrupados para Modelo B.');

          for (const fazendaKey of Object.keys(groupedData).sort()) {
            console.log('[brocamento/pdf] Processando fazenda:', fazendaKey);
            currentY = await checkPageBreak(currentY, 40);
            doc.y = currentY;
            doc.fontSize(12).font('Helvetica-Bold').text(fazendaKey, doc.page.margins.left, currentY, { align: 'left' });
            currentY = doc.y + 5;

            currentY = await checkPageBreak(currentY);
            currentY = drawRow(headers.slice(1), currentY, true, false, columnWidthsB);

            const farmData = groupedData[fazendaKey];
            for(const r of farmData) {
                console.log('[brocamento/pdf] Desenhando linha de dados (Modelo B):', r.id);
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
            console.log('[brocamento/pdf] Desenhando subtotal para fazenda:', fazendaKey);
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
          console.log('[brocamento/pdf] Desenhando total geral (Modelo A).');
          drawRow(totalRowData, currentY, false, true, columnWidthsA);
        } else {
          const totalRowDataB = ['', '', '', 'Total Geral', grandTotalEntrenos, grandTotalBase, grandTotalMeio, grandTotalTopo, grandTotalBrocado, totalPercent];
          console.log('[brocamento/pdf] Desenhando total geral (Modelo B).');
          drawRow(totalRowDataB, currentY, false, true, columnWidthsB);
        }
      }
      console.log('[brocamento/pdf] Finalizando documento.');
      doc.end(); 
    } catch (error) { 
        console.error("[brocamento/pdf] ERRO CRÍTICO ao gerar PDF:", error);
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
    console.log('[perda/pdf] Requisição recebida.');
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_perda.pdf`);
    doc.pipe(res);

    const filters = req.query;
    const generatedBy = filters.generatedBy || 'N/A'; 

    doc.on('pageAdded', () => {
      addPdfFooter(doc, generatedBy);
    });

    try {
      const data = await getFilteredData('perdas', filters);
      console.log(`[perda/pdf] Dados obtidos para relatório: ${data.length} registros.`);

      if (data.length === 0) {
        await generatePdfHeader(doc, 'Relatório de Perda', generatedBy); 
        doc.text('Nenhum dado encontrado.');
      } else {
        const isDetailed = filters.tipoRelatorio === 'B';
        const title = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
        
        await generatePdfHeader(doc, title, generatedBy); 

        let headers, rows;
        if (isDetailed) {
          headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'C.Int.', 'Tol.', 'Toco', 'Ponta', 'Est.', 'Ped.', 'Total'];
          rows = data.map(p => [
            p.data, 
            `${p.codigo} - ${p.fazenda}`, 
            p.talhao, 
            p.frenteServico, 
            p.turno, 
            p.operador, 
            p.canaInteira, 
            p.tolete, 
            p.toco, 
            p.ponta, 
            p.estilhaco, 
            p.pedaco, 
            p.total
          ]);
          console.log('[perda/pdf] Gerando Modelo Detalhado. Headers:', headers);
          console.log('[perda/pdf] Primeiras 5 linhas de dados (rows):', JSON.stringify(rows.slice(0, 5)));

          // [CORREÇÃO]: Usando doc.table para gerar a tabela
          await doc.table({ 
              headers: [headers], 
              rows,
              columnStyles: {
                  0: { width: 50 },  // Data
                  1: { width: 80 },  // Fazenda
                  2: { width: 60 },  // Talhão
                  3: { width: 60 },  // Frente
                  4: { width: 35 },  // Turno
                  5: { width: 70 },  // Operador
                  6: { width: 40 },  // Cana Inteira
                  7: { width: 35 },  // Tolete
                  8: { width: 35 },  // Toco
                  9: { width: 35 },  // Ponta
                  10: { width: 35 }, // Estilhaço
                  11: { width: 35 }, // Pedaço
                  12: { width: 40 }  // Total
              },
              styles: { 
                  fontSize: 8,
                  overflow: 'linebreak' 
              },
              headStyles: { 
                  fillColor: [46, 125, 50], 
                  textColor: 255, 
                  font: 'Helvetica-Bold'
              },
              alternateRowStyles: { 
                  fillColor: [245, 245, 245] 
              },
              prepareHeader: () => doc.font('Helvetica-Bold'),
              prepareRow: () => doc.font('Helvetica'),
          });
          console.log('[perda/pdf] Tabela detalhada gerada.');
        } else {
          headers = ['Data', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Total'];
          rows = data.map(p => [
            p.data, 
            `${p.codigo} - ${p.fazenda}`, 
            p.talhao, 
            p.frenteServico, 
            p.turno, 
            p.operador, 
            p.total
          ]);
          console.log('[perda/pdf] Gerando Modelo Resumido. Headers:', headers);
          console.log('[perda/pdf] Primeiras 5 linhas de dados (rows):', JSON.stringify(rows.slice(0, 5)));

          // [CORREÇÃO]: Usando doc.table para gerar a tabela
          await doc.table({ 
              headers: [headers], 
              rows,
              columnStyles: {
                  0: { width: 60 },   // Data
                  1: { width: 100 },  // Fazenda
                  2: { width: 80 },   // Talhão
                  3: { width: 80 },   // Frente
                  4: { width: 40 },   // Turno
                  5: { width: 100 },  // Operador
                  6: { width: 50 }    // Total
              },
              styles: { 
                  fontSize: 9, 
                  overflow: 'linebreak'
              },
              headStyles: { 
                  fillColor: [46, 125, 50], 
                  textColor: 255, 
                  font: 'Helvetica-Bold'
              },
              alternateRowStyles: { 
                  fillColor: [245, 245, 245] 
              },
              prepareHeader: () => doc.font('Helvetica-Bold'),
              prepareRow: () => doc.font('Helvetica'),
          });
          console.log('[perda/pdf] Tabela resumida gerada.');
        }
      }
      console.log('[perda/pdf] Finalizando documento.');
      doc.end(); 
    } catch (error) { 
        console.error("[perda/pdf] ERRO CRÍTICO ao gerar PDF:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`); 
        } else {
            doc.end(); 
        }
    }
  });

  app.get('/reports/perda/csv', async (req, res) => {
    try {
      const data = await getFilteredData('perdas', req.query);
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

  // Geração de Relatório de Colheita Customizado (PDF)
  app.get('/reports/colheita/pdf', async (req, res) => {
    console.log('[colheita/pdf] Requisição recebida.');
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_colheita_custom.pdf`);
    doc.pipe(res);

    const filters = req.query;
    const generatedBy = filters.generatedBy || 'N/A';
    const planId = filters.planId;
    const selectedColumns = JSON.parse(filters.selectedColumns || '{}'); 
    console.log('[colheita/pdf] Filters:', filters);
    console.log('[colheita/pdf] planId:', planId);
    console.log('[colheita/pdf] selectedColumns:', selectedColumns);


    doc.on('pageAdded', () => {
      addPdfFooter(doc, generatedBy);
    });

    try {
      if (!planId) {
        console.log('[colheita/pdf] Erro: planId não fornecido.');
        await generatePdfHeader(doc, 'Relatório de Colheita Customizado', generatedBy);
        doc.text('ID do plano de colheita não fornecido.');
        doc.end();
        return;
      }

      const planDoc = await db.collection('harvestPlans').doc(planId).get();
      if (!planDoc.exists) {
        console.log('[colheita/pdf] Erro: Plano de colheita não encontrado.');
        await generatePdfHeader(doc, 'Relatório de Colheita Customizado', generatedBy);
        doc.text('Plano de colheita não encontrado.');
        doc.end();
        return;
      }

      const harvestPlanData = planDoc.data();
      console.log('[colheita/pdf] Dados do plano de colheita:', JSON.stringify(harvestPlanData));

      const allFazendasSnapshot = await db.collection('fazendas').get();
      const allFazendasData = {};
      allFazendasSnapshot.forEach(docSnap => {
          allFazendasData[docSnap.id] = docSnap.data();
      });
      console.log('[colheita/pdf] Dados de todas as fazendas carregados.');

      const title = `Plano de Colheita - ${harvestPlanData.frontName}`;
      await generatePdfHeader(doc, title, generatedBy);

      // Construir cabeçalhos dinamicamente
      const baseHeaders = ['Seq.', 'Fazenda', 'Talhões', 'Área (ha)', 'Prod. (ton)'];
      const dynamicHeaders = [];
      if (selectedColumns.variedade) dynamicHeaders.push('Variedade');
      if (selectedColumns.idade) dynamicHeaders.push('Idade (m)');
      if (selectedColumns.atr) dynamicHeaders.push('ATR');
      if (selectedColumns.maturador) dynamicHeaders.push('Maturador');
      if (selectedColumns.diasAplicacao) dynamicHeaders.push('Dias Aplic.');
      const finalHeaders = ['Entrada', 'Saída'];

      const fullHeaders = [...baseHeaders, ...dynamicHeaders, ...finalHeaders];
      console.log('[colheita/pdf] Cabeçalhos finais:', fullHeaders);

      const body = [];
      let currentDate = harvestPlanData.startDate ? new Date(harvestPlanData.startDate + 'T03:00:00Z') : new Date();
      const dailyTon = parseFloat(harvestPlanData.dailyRate) || 1;

      if (!harvestPlanData.sequence || harvestPlanData.sequence.length === 0) {
        console.log('[colheita/pdf] Plano de colheita sem sequência definida.');
        doc.text('Este plano de colheita não possui sequência definida.');
      } else {
        harvestPlanData.sequence.forEach((group, index) => {
            const diasNecessarios = dailyTon > 0 ? group.totalProducao / dailyTon : 0;
            const dataEntrada = new Date(currentDate.getTime());
            currentDate.setDate(currentDate.getDate() + diasNecessarios);
            const dataSaida = new Date(currentDate.getTime());

            const baseRow = [
                index + 1,
                `${group.fazendaCodigo} - ${group.fazendaName}`,
                group.plots.map(p => p.talhaoName).join(', '),
                group.totalArea.toFixed(2),
                group.totalProducao.toFixed(2),
            ];

            const dynamicRow = [];
            if (selectedColumns.variedade) {
                const farm = Object.values(allFazendasData).find(f => f.code === group.fazendaCodigo);
                let varieties = new Set();
                if (farm && farm.talhoes) {
                    group.plots.forEach(plot => {
                        const talhao = farm.talhoes.find(t => t.id === plot.talhaoId);
                        if (talhao?.variedade) varieties.add(talhao.variedade);
                    });
                }
                dynamicRow.push(Array.from(varieties).join(', '));
            }
            if (selectedColumns.idade) dynamicRow.push(calculateAverageAge(group, harvestPlanData.startDate, Object.values(allFazendasData)));
            if (selectedColumns.atr) dynamicRow.push(group.atr || 'N/A');
            if (selectedColumns.maturador) dynamicRow.push(group.maturador || 'N/A');
            if (selectedColumns.diasAplicacao) dynamicRow.push(calculateMaturadorDays(group));
            
            const finalRowData = [
                dataEntrada.toLocaleDateString('pt-BR'),
                dataSaida.toLocaleDateString('pt-BR')
            ];
            
            body.push([...baseRow, ...dynamicRow, ...finalRowData]);
            currentDate.setDate(currentDate.getDate() + 1);
        });
        console.log('[colheita/pdf] Corpo da tabela gerado. Total de linhas:', body.length);
        if (body.length > 0) {
            console.log('[colheita/pdf] Exemplo de linha:', JSON.stringify(body[0]));
        }

        // [CORREÇÃO]: Usando doc.table para gerar a tabela
        await doc.table({ 
            headers: [fullHeaders], 
            rows: body,
            styles: { 
                fontSize: 8, 
                overflow: 'linebreak' 
            },
            headStyles: { 
                fillColor: [46, 125, 50], 
                textColor: 255, 
                font: 'Helvetica-Bold'
            },
            alternateRowStyles: { 
                fillColor: [245, 245, 245] 
            },
            columnStyles: {
                0: { width: 30 }, // Seq.
                1: { width: 80 }, // Fazenda
                2: { width: 100 }, // Talhões
                3: { width: 50 }, // Área
                4: { width: 50 }, // Produção
            },
            prepareHeader: () => doc.font('Helvetica-Bold'),
            prepareRow: () => doc.font('Helvetica'),
        });

        console.log('[colheita/pdf] Tabela de colheita gerada.');
      }
      doc.end();
    } catch (error) {
      console.error("[colheita/pdf] ERRO CRÍTICO ao gerar PDF:", error);
      if (!res.headersSent) {
          res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
      } else {
          doc.end();
      }
    }
  });

  // Geração de Relatório de Colheita Customizado (CSV)
  app.get('/reports/colheita/csv', async (req, res) => {
    console.log('[colheita/csv] Requisição recebida.');
    try {
      const filters = req.query;
      const planId = filters.planId;
      const selectedColumns = JSON.parse(filters.selectedColumns || '{}');
      console.log('[colheita/csv] Filters:', filters);
      console.log('[colheita/csv] planId:', planId);
      console.log('[colheita/csv] selectedColumns:', selectedColumns);


      if (!planId) {
        console.log('[colheita/csv] Erro: planId não fornecido.');
        return res.status(400).send('ID do plano de colheita não fornecido.');
      }

      const planDoc = await db.collection('harvestPlans').doc(planId).get();
      if (!planDoc.exists) {
        console.log('[colheita/csv] Erro: Plano de colheita não encontrado.');
        return res.status(404).send('Plano de colheita não encontrado.');
      }

      const harvestPlanData = planDoc.data();
      console.log('[colheita/csv] Dados do plano de colheita:', JSON.stringify(harvestPlanData));

      const allFazendasSnapshot = await db.collection('fazendas').get();
      const allFazendasData = {};
      allFazendasSnapshot.forEach(docSnap => {
          allFazendasData[docSnap.id] = docSnap.data();
      });
      console.log('[colheita/csv] Dados de todas as fazendas carregados.');


      // Construir cabeçalhos dinamicamente para CSV
      const baseHeaders = ['Seq.', 'Fazenda', 'Talhões', 'Área (ha)', 'Prod. (ton)'];
      const dynamicHeaders = [];
      if (selectedColumns.variedade) dynamicHeaders.push('Variedade');
      if (selectedColumns.idade) dynamicHeaders.push('Idade (m)');
      if (selectedColumns.atr) dynamicHeaders.push('ATR');
      if (selectedColumns.maturador) dynamicHeaders.push('Maturador');
      if (selectedColumns.diasAplicacao) dynamicHeaders.push('Dias Aplic.');
      const finalHeaders = ['Entrada', 'Saída'];

      const fullHeaders = [...baseHeaders, ...dynamicHeaders, ...finalHeaders];
      console.log('[colheita/csv] Cabeçalhos CSV:', fullHeaders);

      const records = [];
      let currentDate = harvestPlanData.startDate ? new Date(harvestPlanData.startDate + 'T03:00:00Z') : new Date();
      const dailyTon = parseFloat(harvestPlanData.dailyRate) || 1;

      if (!harvestPlanData.sequence || harvestPlanData.sequence.length === 0) {
        console.log('[colheita/csv] Plano de colheita sem sequência definida.');
        const filePath = path.join(os.tmpdir(), `relatorio_colheita_custom_${Date.now()}.csv`);
        const csvWriter = createObjectCsvWriter({
          path: filePath,
          header: fullHeaders.map(h => ({ id: h, title: h })) 
        });
        await csvWriter.writeRecords([]); 
        res.download(filePath);
        return;
      }

      harvestPlanData.sequence.forEach((group, index) => {
          const diasNecessarios = dailyTon > 0 ? group.totalProducao / dailyTon : 0;
          const dataEntrada = new Date(currentDate.getTime());
          currentDate.setDate(currentDate.getDate() + diasNecessarios);
          const dataSaida = new Date(currentDate.getTime());

          const record = {
              'Seq.': index + 1,
              'Fazenda': `${group.fazendaCodigo} - ${group.fazendaName}`,
              'Talhões': group.plots.map(p => p.talhaoName).join(', '),
              'Área (ha)': group.totalArea.toFixed(2),
              'Prod. (ton)': group.totalProducao.toFixed(2),
          };

          if (selectedColumns.variedade) {
              const farm = Object.values(allFazendasData).find(f => f.code === group.fazendaCodigo);
              let varieties = new Set();
              if (farm && farm.talhoes) {
                  group.plots.forEach(plot => {
                      const talhao = farm.talhoes.find(t => t.id === plot.talhaoId);
                      if (talhao?.variedade) varieties.add(talhao.variedade);
                  });
              }
              record['Variedade'] = Array.from(varieties).join(', ');
          }
          if (selectedColumns.idade) record['Idade (m)'] = calculateAverageAge(group, harvestPlanData.startDate, Object.values(allFazendasData));
          if (selectedColumns.atr) record['ATR'] = group.atr || 'N/A';
          if (selectedColumns.maturador) record['Maturador'] = group.maturador || 'N/A';
          if (selectedColumns.diasAplicacao) record['Dias Aplic.'] = calculateMaturadorDays(group);
          
          record['Entrada'] = dataEntrada.toLocaleDateString('pt-BR');
          record['Saída'] = dataSaida.toLocaleDateString('pt-BR');
          
          records.push(record);
          currentDate.setDate(currentDate.getDate() + 1);
      });
      console.log('[colheita/csv] Registros CSV gerados. Total:', records.length);
      if (records.length > 0) {
          console.log('[colheita/csv] Exemplo de registro CSV:', JSON.stringify(records[0]));
      }


      const filePath = path.join(os.tmpdir(), `relatorio_colheita_custom_${Date.now()}.csv`);
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: fullHeaders.map(h => ({ id: h, title: h })) 
      });
      await csvWriter.writeRecords(records);
      res.download(filePath);
      console.log('[colheita/csv] CSV enviado para download.');

    } catch (error) { 
      console.error("[colheita/csv] ERRO CRÍTICO ao gerar CSV:", error);
      res.status(500).send(`Erro ao gerar relatório CSV: ${error.message}`); 
    }
  });


} catch (error) {
  console.error("ERRO CRÍTICO AO INICIALIZAR FIREBASE:", error);
  app.use((req, res) => res.status(500).send('Erro de configuração do servidor.'));
}

app.listen(port, () => {
  console.log(`Servidor de relatórios rodando na porta ${port}`);
});
