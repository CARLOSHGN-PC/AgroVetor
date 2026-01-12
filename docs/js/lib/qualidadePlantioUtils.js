// docs/js/lib/qualidadePlantioUtils.js

export const calcGemasViaveisIndice = (qtdGemasViaveis, amostragem) => {
    const qtd = Number(qtdGemasViaveis);
    const amostragemValue = Number(amostragem);

    if (!Number.isFinite(qtd) || !Number.isFinite(amostragemValue) || amostragemValue <= 0) {
        return null;
    }

    return qtd / amostragemValue;
};

export const calcConsumoMuda = (pesoTotal, unidade = 'kg') => {
    const pesoValue = Number(pesoTotal);

    if (!Number.isFinite(pesoValue) || pesoValue <= 0) {
        return null;
    }

    const pesoEmKg = unidade === 't' ? pesoValue * 1000 : pesoValue;
    const consumoMuda = (pesoEmKg / 5) * 6666 / 1000;

    return consumoMuda;
};

export const calcPercentBroca = (broca, qtdGemasTotal) => {
    const brocaValue = Number(broca);
    const qtdValue = Number(qtdGemasTotal);

    if (!Number.isFinite(brocaValue) || !Number.isFinite(qtdValue) || qtdValue <= 0) {
        return null;
    }

    return (brocaValue / qtdValue) * 100;
};
