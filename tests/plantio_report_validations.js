const assert = require('assert');
const {
  buildResumoRows,
  buildLegacyGeralRows,
  getPlantioFazendaColumns
} = require('../backend/reports/plantioReport');

const sampleData = [
  {
    id: 'a1',
    farmName: 'Alpha',
    farmCode: '001',
    date: '2024-02-05',
    records: [{ talhao: 'T1', variedade: 'V1', area: 10 }],
    mudaArea: 4
  },
  {
    id: 'a2',
    farmName: 'Alpha',
    farmCode: '001',
    date: '2024-01-10',
    records: [{ talhao: 'T2', variedade: 'V2', area: 6 }],
    mudaArea: 2
  },
  {
    id: 'b1',
    farmName: 'Beta',
    farmCode: '002',
    date: '2024-03-01',
    records: [{ talhao: 'T3', variedade: 'V3', area: 8 }],
    mudaArea: 5
  }
];

const geralRows = buildLegacyGeralRows(sampleData);
assert.strictEqual(geralRows[0].fazenda.includes('Alpha'), true, 'Fazenda Alpha deve vir primeiro.');
assert.strictEqual(geralRows[0].dataSort, '2024-02-05', 'Data mais nova deve vir primeiro dentro da mesma fazenda.');
assert.strictEqual(geralRows[1].dataSort, '2024-01-10', 'Data mais antiga deve vir depois dentro da mesma fazenda.');
assert.strictEqual(geralRows[2].fazenda.includes('Beta'), true, 'Fazenda Beta deve vir depois de Alpha.');

const resumoRows = buildResumoRows(sampleData);
const totalMuda = resumoRows.reduce((sum, row) => sum + row.areaMudaValue, 0);
const totalPlantio = resumoRows.reduce((sum, row) => sum + row.areaPlantioValue, 0);
assert.strictEqual(totalMuda, 11, 'Total de área de muda deve bater com a soma dos itens.');
assert.strictEqual(totalPlantio, 24, 'Total de área de plantio deve bater com a soma dos itens.');

const nonCanaColumns = getPlantioFazendaColumns(false).map(col => col.id);
assert.strictEqual(nonCanaColumns.includes('origemFazenda'), false, 'Não deve incluir Fazenda Origem para cultura != cana.');
assert.strictEqual(nonCanaColumns.includes('origemTalhao'), false, 'Não deve incluir Talhão Origem para cultura != cana.');
assert.strictEqual(nonCanaColumns.includes('mudaArea'), false, 'Não deve incluir Muda (ha) para cultura != cana.');

console.log('Plantio report validations passed.');
