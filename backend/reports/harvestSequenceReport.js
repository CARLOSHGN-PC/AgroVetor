const xlsx = require('xlsx');
const { setupDoc, generatePdfHeader, generatePdfFooter, drawTable, getLogoBase64 } = require('../utils/pdfGenerator');

const normalizeStatus = (value) => String(value || 'planejado').toLowerCase();

const buildHarvestSequenceRows = async (db, filters = {}) => {
  const companyId = filters.companyId;
  if (!companyId) throw new Error('companyId é obrigatório.');

  const plansSnap = await db.collection('harvestPlans').where('companyId', '==', companyId).get();
  const rows = [];

  plansSnap.forEach((docSnap) => {
    const plan = docSnap.data() || {};
    (plan.sequence || []).forEach((group, index) => {
      const seqNum = Number(group.sequenciaNumero) || index + 1;
      const seqCor = group.corDaSequencia || group.sequenciaCor || '#ff9800';
      const statusGrupo = normalizeStatus(group.status || 'planejado');
      if (filters.fazendaCodigo && String(group.fazendaCodigo) !== String(filters.fazendaCodigo)) return;
      if (filters.sequenciaNumero && Number(filters.sequenciaNumero) !== seqNum) return;

      (group.plots || []).forEach((plot) => {
        const rowStatus = normalizeStatus(plot.status || statusGrupo);
        if (filters.status && normalizeStatus(filters.status) !== rowStatus) return;
        rows.push({
          planId: docSnap.id,
          sequencia: `Sequência ${seqNum}`,
          sequenciaNumero: seqNum,
          cor: seqCor,
          fazenda: `${group.fazendaCodigo || ''} - ${group.fazendaName || ''}`.trim(),
          fazendaCodigo: group.fazendaCodigo || '',
          talhao: plot.talhaoCodigoOuNumero || plot.talhaoName || '',
          polygonKey: plot.polygonKey || plot.talhaoCodigoOuNumero || plot.talhaoName || '',
          status: rowStatus,
          dataInicio: plan.startDate || '',
          frente: plan.frontName || '',
        });
      });
    });
  });

  rows.sort((a,b) => a.sequenciaNumero - b.sequenciaNumero || String(a.fazenda).localeCompare(String(b.fazenda), 'pt-BR'));
  return rows;
};

const generateHarvestSequenceTablePdf = async (req, res, db) => {
  const filters = { ...(req.query || {}), ...(req.body || {}) };
  const rows = await buildHarvestSequenceRows(db, filters);
  const doc = setupDoc();
  const logoBase64 = await getLogoBase64(db, filters.companyId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_sequencia_colheita_tabela.pdf');
  doc.pipe(res);

  const title = 'Relatório de Sequência de Colheita (Tabela)';
  const headers = ['Sequência', 'Cor', 'Fazenda', 'Talhão', 'Status', 'Data'];
  const tableRows = rows.map(r => [r.sequencia, r.cor, r.fazenda, r.talhao, r.status, r.dataInicio]);
  await generatePdfHeader(doc, title, logoBase64);
  await drawTable(doc, headers, tableRows, title, logoBase64, 120);
  generatePdfFooter(doc, filters.generatedBy || 'Sistema');
  doc.end();
};

const generateHarvestSequenceMapPdf = async (req, res, db) => {
  const filters = { ...(req.query || {}), ...(req.body || {}) };
  const rows = await buildHarvestSequenceRows(db, filters);
  const doc = setupDoc();
  const logoBase64 = await getLogoBase64(db, filters.companyId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_sequencia_colheita_mapa.pdf');
  doc.pipe(res);

  let y = await generatePdfHeader(doc, 'Relatório de Sequência de Colheita (Mapa)', logoBase64);
  doc.fontSize(10).text('Visualização esquemática por sequência (Seq + Talhão):', 50, y + 10);
  y += 35;
  rows.forEach((row, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 60;
    }
    doc.fillColor(row.cor || '#999').rect(50, y, 18, 18).fill();
    doc.fillColor('#000').fontSize(10).text(`${row.sequencia} • ${row.talhao} • ${row.fazenda} • ${row.status}`, 75, y + 4);
    y += 24;
  });

  generatePdfFooter(doc, filters.generatedBy || 'Sistema');
  doc.end();
};

const generateHarvestSequenceTableXlsx = async (req, res, db) => {
  const filters = { ...(req.query || {}), ...(req.body || {}) };
  const rows = await buildHarvestSequenceRows(db, filters);
  const wb = xlsx.utils.book_new();
  const data = rows.map(r => ({
    Sequencia: r.sequencia,
    Cor: r.cor,
    Fazenda: r.fazenda,
    Talhao: r.talhao,
    PolygonKey: r.polygonKey,
    Status: r.status,
    DataInicio: r.dataInicio,
    Frente: r.frente,
  }));
  const ws = xlsx.utils.json_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, 'SequenciaColheita');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_sequencia_colheita_tabela.xlsx');
  res.send(buffer);
};

module.exports = {
  buildHarvestSequenceRows,
  generateHarvestSequenceTablePdf,
  generateHarvestSequenceMapPdf,
  generateHarvestSequenceTableXlsx,
};
