import assert from 'assert';
import {
    calcGemasViaveisIndice,
    calcConsumoMuda,
    calcPercentBroca
} from '../docs/js/lib/qualidadePlantioUtils.js';

assert.strictEqual(calcGemasViaveisIndice(10, 5), 2, 'Índice de gemas viáveis deve ser calculado corretamente.');
assert.strictEqual(calcGemasViaveisIndice(10, 0), null, 'Amostragem zerada deve retornar null.');

assert.strictEqual(calcConsumoMuda(5000, 'kg'), (5000 / 5) * 6666 / 1000, 'Consumo de muda em kg deve ser calculado corretamente.');
assert.strictEqual(calcConsumoMuda(5, 't'), (5000 / 5) * 6666 / 1000, 'Consumo de muda em t deve converter para kg.');
assert.strictEqual(calcConsumoMuda(0, 'kg'), null, 'Peso total inválido deve retornar null.');

assert.strictEqual(calcPercentBroca(10, 100), 10, 'Percentual de broca deve ser calculado corretamente.');
assert.strictEqual(calcPercentBroca(10, 0), null, 'Qtd. gemas total zerada deve retornar null.');

console.log('Qualidade de Plantio utils tests passed.');
