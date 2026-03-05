const assert = require('assert');

function getPlantioCycleContext(selectedDate) {
  const today = new Date();
  const referenceDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : today;
  const safeReferenceDate = Number.isNaN(referenceDate.getTime()) ? today : referenceDate;
  const referenceYear = safeReferenceDate.getFullYear();
  const currentSafraCandidates = [
    `${referenceYear}/${referenceYear + 1}`,
    `${referenceYear - 1}/${referenceYear}`
  ];

  return {
    referenceYear,
    currentCycle: String(referenceYear),
    currentSafraCandidates,
    startOfReferenceYear: new Date(referenceYear, 0, 1),
  };
}

function parsePlantioEntryDate(entryDate) {
  if (!entryDate) return null;

  if (entryDate instanceof Date) {
    return Number.isNaN(entryDate.getTime()) ? null : entryDate;
  }

  if (typeof entryDate === 'string') {
    const trimmedDate = entryDate.trim();
    const isoDateOnlyMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateOnlyMatch) {
      const [, year, month, day] = isoDateOnlyMatch;
      const parsedLocalDate = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsedLocalDate.getTime()) ? null : parsedLocalDate;
    }

    const parsedStringDate = new Date(trimmedDate);
    return Number.isNaN(parsedStringDate.getTime()) ? null : parsedStringDate;
  }

  const parsedDate = new Date(entryDate);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function isPlantioInCurrentCycle(apontamento, cycleContext) {
  const normalizedCycle = [apontamento.cicloPlantio, apontamento.ciclo_plantio, apontamento.cycleId]
    .find(value => value !== undefined && value !== null && String(value).trim() !== '');
  if (normalizedCycle !== undefined) {
    return String(normalizedCycle).trim() === String(cycleContext.currentCycle).trim();
  }

  const safra = [apontamento.safra, apontamento.harvest]
    .find(value => value !== undefined && value !== null && String(value).trim() !== '');
  if (safra !== undefined) {
    return cycleContext.currentSafraCandidates.includes(String(safra).trim());
  }

  const ano = [apontamento.ano, apontamento.year]
    .find(value => value !== undefined && value !== null && String(value).trim() !== '');
  if (ano !== undefined) {
    return Number.parseInt(ano, 10) === cycleContext.referenceYear;
  }

  const entryDate = apontamento.date || apontamento.data || apontamento.dataApontamento || apontamento.data_apontamento;
  if (!entryDate) return false;

  const parsedDate = parsePlantioEntryDate(entryDate);
  if (!parsedDate) return false;

  return parsedDate >= cycleContext.startOfReferenceYear;
}

function calcRestante(totalArea, apontamentos, talhaoId, selectedDate) {
  const ctx = getPlantioCycleContext(selectedDate);
  const plantado = apontamentos
    .filter(ap => ap.culture === 'Cana-de-açúcar')
    .filter(ap => isPlantioInCurrentCycle(ap, ctx))
    .flatMap(ap => ap.records || [])
    .filter(rec => rec.talhaoId === talhaoId)
    .reduce((sum, rec) => sum + (rec.area || 0), 0);

  return totalArea - plantado;
}

(() => {
  const totalAreaTalhao = 100;
  const historico = [
    {
      date: '2025-03-10',
      culture: 'Cana-de-açúcar',
      records: [{ talhaoId: 'T1', area: 100 }]
    }
  ];

  const restante2026AntesNovoLancamento = calcRestante(totalAreaTalhao, historico, 'T1', '2026-01-15');
  assert.strictEqual(restante2026AntesNovoLancamento, 100, 'Em 2026, apontamento de 2025 não deve consumir área restante.');

  const restanteComDataNoInicioAno = calcRestante(totalAreaTalhao, [
    {
      date: '2026-01-01',
      culture: 'Cana-de-açúcar',
      records: [{ talhaoId: 'T1', area: 10 }]
    }
  ], 'T1', '2026-01-15');
  assert.strictEqual(restanteComDataNoInicioAno, 90, 'Data YYYY-MM-DD deve ser interpretada em horário local e contar no ciclo atual.');

  const comNovoLancamento2026 = [
    ...historico,
    {
      date: '2026-01-16',
      culture: 'Cana-de-açúcar',
      records: [{ talhaoId: 'T1', area: 25 }]
    }
  ];
  const restanteAposNovoLancamento = calcRestante(totalAreaTalhao, comNovoLancamento2026, 'T1', '2026-01-16');
  assert.strictEqual(restanteAposNovoLancamento, 75, 'Após lançar 25ha em 2026, restante deve ser 75ha.');

  console.log('plantio_cycle_filter_validations: ok');
})();
