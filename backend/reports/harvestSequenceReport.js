const PDFDocument = require('pdfkit');
const xlsx = require('xlsx');

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString().split('T')[0];
  try { return new Date(value).toISOString().split('T')[0]; } catch { return ''; }
}

function applyFilters(items, filters = {}) {
  return items.filter((item) => {
    if (filters.frente && item.frenteId !== filters.frente) return false;
    if (filters.fazenda && item.fazendaId !== filters.fazenda) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.variedade && !String(item.variedadeSnapshot || '').toLowerCase().includes(String(filters.variedade).toLowerCase())) return false;
    if (filters.periodStart && normalizeDate(item.dtPrevistaInicio) && normalizeDate(item.dtPrevistaInicio) < filters.periodStart) return false;
    if (filters.periodEnd && normalizeDate(item.dtPrevistaFim) && normalizeDate(item.dtPrevistaFim) > filters.periodEnd) return false;
    if (filters.onlyUnplanned && item.frenteId) return false;
    return true;
  });
}

async function fetchHarvestSequenceData(db, companyId, filters = {}) {
  const snap = await db.collection('harvest_plans').where('companyId', '==', companyId).limit(20).get();
  const plans = [];
  snap.forEach((doc) => plans.push({ id: doc.id, ...doc.data() }));
  const mergedItems = plans.flatMap((p) => Array.isArray(p.items) ? p.items.map((i) => ({ ...i, planId: p.id, periodStart: p.periodStart, periodEnd: p.periodEnd, safra: p.safra })) : []);
  const filtered = applyFilters(mergedItems, filters).sort((a, b) => String(a.frenteId || '').localeCompare(String(b.frenteId || '')) || Number(a.sequencia || 0) - Number(b.sequencia || 0));
  return filtered;
}

function generateHarvestSequenceTablePdf(res, rows, filters = {}) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_sequencia_colheita_tabela.pdf');
  doc.pipe(res);

  doc.fontSize(14).text('Relatório de Sequência de Colheita (Operacional)', { align: 'left' });
  doc.moveDown(0.5).fontSize(9).text(`Filtros: ${JSON.stringify(filters)}`);
  doc.moveDown(0.5);

  const headers = ['Frente', 'Seq', 'Fazenda', 'Talhão', 'Área', 'Variedade', 'Status', 'Prev. Início', 'Prev. Fim', 'Exec. Início', 'Exec. Fim', 'Obs.', 'Responsável'];
  doc.fontSize(8).text(headers.join(' | '));
  doc.moveDown(0.3);

  rows.forEach((r) => {
    const line = [
      r.frenteId || '-',
      r.sequencia ?? '-',
      r.fazendaId || '-',
      r.talhaoId || r.talhaoName || '-',
      Number(r.areaSnapshot || 0).toFixed(2),
      r.variedadeSnapshot || '-',
      r.status || '-',
      normalizeDate(r.dtPrevistaInicio),
      normalizeDate(r.dtPrevistaFim),
      normalizeDate(r.dtExecucaoInicio),
      normalizeDate(r.dtExecucaoFim),
      (r.observacao || '-').toString().slice(0, 40),
      r.responsavelId || '-',
    ].join(' | ');
    doc.text(line);
  });

  doc.end();
}

function generateHarvestSequenceTableExcel(res, rows) {
  const normalized = rows.map((r) => ({
    Frente: r.frenteId || '',
    Sequencia: r.sequencia || '',
    Fazenda: r.fazendaId || '',
    Talhao: r.talhaoId || r.talhaoName || '',
    Area: Number(r.areaSnapshot || 0),
    Variedade: r.variedadeSnapshot || '',
    Status: r.status || '',
    PrevistaInicio: normalizeDate(r.dtPrevistaInicio),
    PrevistaFim: normalizeDate(r.dtPrevistaFim),
    ExecucaoInicio: normalizeDate(r.dtExecucaoInicio),
    ExecucaoFim: normalizeDate(r.dtExecucaoFim),
    Observacao: r.observacao || '',
    Responsavel: r.responsavelId || '',
  }));

  const ws = xlsx.utils.json_to_sheet(normalized);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'SequenciaColheita');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_sequencia_colheita.xlsx');
  res.send(buffer);
}

function generateHarvestSequenceMapPdf(res, rows, filters = {}) {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_sequencia_colheita_mapa.pdf');
  doc.pipe(res);

  doc.fontSize(14).text('Relatório de Sequência de Colheita (Mapa Desenhado)', { align: 'left' });
  doc.moveDown(0.5).fontSize(9).text(`Filtros: ${JSON.stringify(filters)}`);
  doc.moveDown(1);

  // Renderização vetorial simplificada (backend independente do front)
  const left = 40; const top = 110; const width = 730; const height = 420;
  doc.rect(left, top, width, height).stroke('#333');

  const groupedByFront = new Map();
  rows.forEach((r, idx) => {
    const key = r.frenteId || 'Sem Frente';
    if (!groupedByFront.has(key)) groupedByFront.set(key, []);
    groupedByFront.get(key).push({ ...r, idx });
  });

  const fronts = Array.from(groupedByFront.keys());
  fronts.forEach((front, fi) => {
    const color = ['#ef5350','#42a5f5','#66bb6a','#ffa726','#ab47bc','#26c6da','#8d6e63'][fi % 7];
    groupedByFront.get(front).forEach((row, i) => {
      const x = left + 10 + ((row.idx * 53) % (width - 80));
      const y = top + 10 + ((fi * 70 + i * 25) % (height - 60));
      doc.save().fillColor(color).opacity(0.8).rect(x, y, 44, 20).fill().restore();
      doc.fillColor('white').fontSize(8).text(String(row.sequencia || '-'), x + 16, y + 6, { width: 12, align: 'center' });
    });
    doc.fillColor(color).rect(left + width + 10, top + (fi * 18), 10, 10).fill();
    doc.fillColor('black').fontSize(8).text(front, left + width + 25, top + (fi * 18) - 1);
  });

  doc.moveDown(22);
  doc.fontSize(8).fillColor('#333').text('Legenda de status: borda amarela = Em execução, borda verde = Colhido.');
  doc.end();
}

module.exports = {
  fetchHarvestSequenceData,
  generateHarvestSequenceTablePdf,
  generateHarvestSequenceTableExcel,
  generateHarvestSequenceMapPdf,
};
