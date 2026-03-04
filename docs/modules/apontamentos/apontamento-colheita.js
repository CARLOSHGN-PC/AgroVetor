const COLLECTION = 'apontamentosColheita';

function ensureState() {
  if (!window.App) return false;
  if (!Array.isArray(window.App.state.apontamentosColheita)) {
    window.App.state.apontamentosColheita = [];
  }
  return true;
}

function getEls() {
  return {
    form: document.getElementById('formApontamentoColheita'),
    entryId: document.getElementById('colheitaEntryId'),
    frente: document.getElementById('colheitaFrente'),
    provider: document.getElementById('colheitaProvider'),
    cultura: document.getElementById('colheitaCulture'),
    date: document.getElementById('colheitaDate'),
    leaderId: document.getElementById('colheitaLeaderId'),
    farmName: document.getElementById('colheitaFarmName'),
    talhao: document.getElementById('colheitaPlot'),
    area: document.getElementById('colheitaArea'),
    records: document.getElementById('colheitaRegistrosLista'),
    btnSave: document.getElementById('btnSaveApontamentoColheita')
  };
}

function renderCards() {
  const els = getEls();
  if (!els.records || !ensureState()) return;
  els.records.innerHTML = '';
  window.App.state.apontamentosColheita.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<strong>${r.frente || '-'}</strong> • ${r.cultura || 'Soja'} • ${r.data || '-'}
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button type="button" data-edit="${r.id}">Editar</button>
      <button type="button" data-delete="${r.id}">Excluir</button>
    </div>`;
    els.records.appendChild(card);
  });
}

async function loadData() {
  ensureState();
  if (!window.App?.actions?.getConsolidatedData) return renderCards();
  const data = await window.App.actions.getConsolidatedData(COLLECTION);
  window.App.state.apontamentosColheita = (data || []).map((item) => ({ id: item.id, ...item }));
  renderCards();
}

async function saveApontamentoColheita() {
  const els = getEls();
  const payload = {
    frente: els.frente?.value || '',
    provider: els.provider?.value || '',
    cultura: 'Soja',
    data: els.date?.value || '',
    leaderId: els.leaderId?.value || '',
    farmName: els.farmName?.value || '',
    talhao: els.talhao?.value || '',
    area: Number(els.area?.value || 0)
  };
  const id = els.entryId?.value;

  if (id) {
    await window.App.data.updateDocument(COLLECTION, id, payload);
  } else {
    const docRef = await window.App.data.addDocument(COLLECTION, payload);
    payload.id = docRef?.id || `local-${Date.now()}`;
  }

  if (!navigator.onLine && window.App.offlineDB?.add) {
    await window.App.offlineDB.add('offline-writes', { id: id || payload.id, collection: COLLECTION, data: payload });
  }

  els.form?.reset();
  if (els.entryId) els.entryId.value = '';
  await loadData();
}

function wireEvents() {
  const els = getEls();
  if (!els.form || els.form.dataset.boundColheita === '1') return;
  els.form.dataset.boundColheita = '1';

  els.cultura.innerHTML = '<option value="Soja">Soja</option>';
  els.btnSave?.addEventListener('click', saveApontamentoColheita);
  els.records?.addEventListener('click', async (event) => {
    const id = event.target?.dataset?.edit || event.target?.dataset?.delete;
    if (!id) return;
    const record = window.App.state.apontamentosColheita.find((r) => r.id === id);
    if (event.target.dataset.edit && record) {
      els.entryId.value = record.id;
      els.frente.value = record.frente || '';
      els.provider.value = record.provider || '';
      els.date.value = record.data || '';
      els.leaderId.value = record.leaderId || '';
      els.farmName.value = record.farmName || '';
      els.talhao.value = record.talhao || '';
      els.area.value = record.area || '';
      return;
    }
    if (event.target.dataset.delete) {
      await window.App.data.deleteDocument(COLLECTION, id);
      await loadData();
    }
  });

  loadData();
}

document.addEventListener('DOMContentLoaded', () => {
  const boot = () => {
    if (!window.App?.data) return setTimeout(boot, 200);
    ensureState();
    wireEvents();
  };
  boot();
});

window.saveApontamentoColheita = saveApontamentoColheita;
window.addColheitaRecordCard = renderCards;
