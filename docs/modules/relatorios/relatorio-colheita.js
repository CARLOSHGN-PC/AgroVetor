function getReportEls() {
  return {
    frente: document.getElementById('colheitaRelatorioFrente'),
    cultura: document.getElementById('colheitaRelatorioCultura'),
    inicio: document.getElementById('colheitaRelatorioInicio'),
    fim: document.getElementById('colheitaRelatorioFim'),
    tipo: document.getElementById('tipoRelatorioColheita'),
    btnPdf: document.getElementById('btnGerarRelatorioColheitaPdf'),
    btnExcel: document.getElementById('btnGerarRelatorioColheitaExcel')
  };
}

function getFilteredData() {
  const els = getReportEls();
  const all = window.App?.state?.apontamentosColheita || [];
  return all.filter((item) => {
    if (els.frente?.value && item.frente !== els.frente.value) return false;
    if (els.cultura?.value && item.cultura !== els.cultura.value) return false;
    if (els.inicio?.value && item.data < els.inicio.value) return false;
    if (els.fim?.value && item.data > els.fim.value) return false;
    return true;
  });
}

function generatePdfBase(title) {
  const data = getFilteredData();
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return window.App?.ui?.showAlert?.('jsPDF indisponível.', 'warning');
  const doc = new jsPDF();
  doc.text(title, 14, 15);
  let y = 25;
  data.forEach((d, idx) => {
    doc.text(`${idx + 1}. ${d.data || '-'} | ${d.frente || '-'} | ${d.farmName || '-'} | ${d.area || 0} ha`, 14, y);
    y += 8;
    if (y > 280) {
      doc.addPage();
      y = 15;
    }
  });
  doc.save(`${title.replace(/\s+/g, '_').toLowerCase()}.pdf`);
}

function generateExcel() {
  const data = getFilteredData();
  const rows = ['Data;Frente;Cultura;Fazenda;Talhão;Área'];
  data.forEach((d) => rows.push(`${d.data || ''};${d.frente || ''};${d.cultura || 'Soja'};${d.farmName || ''};${d.talhao || ''};${d.area || 0}`));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'relatorio_colheita.csv';
  link.click();
}

window.generateColheitaResumoPDF = () => generatePdfBase('Relatório Resumo de Colheita');
window.generateColheitaTalhaoPDF = () => generatePdfBase('Relatório por Talhão de Colheita');
window.generateColheitaOperacionalPDF = () => generatePdfBase('Relatório Operacional de Colheita');
window.generateColheitaGeralPDF = () => generatePdfBase('Relatório Geral de Colheita');

document.addEventListener('DOMContentLoaded', () => {
  const els = getReportEls();
  if (!els.tipo || els.tipo.dataset.boundColheita === '1') return;
  els.tipo.dataset.boundColheita = '1';
  els.cultura.innerHTML = '<option value="">Todas</option><option value="Soja">Soja</option>';
  els.tipo.innerHTML = `
    <option value="resumo">Resumo</option>
    <option value="talhao">Por Talhão</option>
    <option value="operacional">Operacional</option>
    <option value="geral">Geral</option>`;

  els.btnPdf?.addEventListener('click', () => {
    const type = els.tipo.value;
    if (type === 'resumo') window.generateColheitaResumoPDF();
    if (type === 'talhao') window.generateColheitaTalhaoPDF();
    if (type === 'operacional') window.generateColheitaOperacionalPDF();
    if (type === 'geral') window.generateColheitaGeralPDF();
  });
  els.btnExcel?.addEventListener('click', generateExcel);
});
