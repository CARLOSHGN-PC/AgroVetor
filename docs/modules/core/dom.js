const mapCoreElements = () => {
  if (!window.App) return;
  window.App.elements = window.App.elements || {};
  window.App.elements.apontamentoColheita = {
    section: document.getElementById('apontamentoColheita'),
    form: document.getElementById('formApontamentoColheita'),
    entryId: document.getElementById('colheitaEntryId'),
    frente: document.getElementById('colheitaFrente'),
    provider: document.getElementById('colheitaProvider'),
    cultura: document.getElementById('colheitaCulture'),
    data: document.getElementById('colheitaDate'),
    recordsList: document.getElementById('colheitaRegistrosLista'),
    btnSave: document.getElementById('btnSalvarApontamentoColheita')
  };
  window.App.elements.relatorioColheita = {
    section: document.getElementById('relatorioColheita'),
    frente: document.getElementById('colheitaRelatorioFrente'),
    cultura: document.getElementById('colheitaRelatorioCultura'),
    inicio: document.getElementById('colheitaRelatorioInicio'),
    fim: document.getElementById('colheitaRelatorioFim'),
    tipo: document.getElementById('tipoRelatorioColheita'),
    btnGerarPdf: document.getElementById('btnGerarRelatorioColheitaPdf'),
    btnGerarExcel: document.getElementById('btnGerarRelatorioColheitaExcel')
  };
};

document.addEventListener('DOMContentLoaded', mapCoreElements);
