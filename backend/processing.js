async function processarLogVoo(aplicacaoId, logBuffer, ordemServico, db, admin, testMode = false) {
    const turf = await import('@turf/turf');
    console.log(`Iniciando processamento para aplicação ${aplicacaoId}`);
    const aplicacaoRef = db.collection('aplicacoes').doc(aplicacaoId);

    try {
        // 1. Ler o log e criar a linha de voo
        const logText = logBuffer.toString('utf-8');
        const coordinates = logText.split('\n').map(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lon)) {
                    return [lon, lat]; // Formato GeoJSON é [longitude, latitude]
                }
            }
            return null;
        }).filter(c => c !== null);

        if (coordinates.length < 2) {
            throw new Error('Arquivo de log não contém coordenadas suficientes.');
        }

        const linhaVoo = turf.lineString(coordinates);

        // 2. Criar o polígono de aplicação (buffer)
        const larguraFaixa = ordemServico.largura_faixa; // em metros
        const bufferRadius = larguraFaixa / 2;
        const poligonoAplicado = turf.buffer(linhaVoo, bufferRadius, { units: 'meters' });

        // 3. Obter e unir os polígonos dos talhões planejados
        const fazendaDoc = await db.collection('fazendas').doc(ordemServico.fazendaId).get();
        if (!fazendaDoc.exists) throw new Error('Fazenda da OS não encontrada.');
        const todosTalhoesDaFazenda = fazendaDoc.data().talhoes;

        const talhoesSelecionadosIds = new Set(ordemServico.talhoes.map(t => t.id));
        const geometriasTalhoes = todosTalhoesDaFazenda
            .filter(t => talhoesSelecionadosIds.has(t.id) && t.geometria)
            .map(t => turf.polygon(t.geometria.coordinates));

        if (geometriasTalhoes.length === 0) {
            throw new Error('Nenhuma geometria válida encontrada para os talhões selecionados.');
        }

        let areaPlanejada = geometriasTalhoes[0];
        if (geometriasTalhoes.length > 1) {
            for (let i = 1; i < geometriasTalhoes.length; i++) {
                areaPlanejada = turf.union(areaPlanejada, geometriasTalhoes[i]);
            }
        }

        // 4. Cálculos Geoespaciais
        const intersecao = turf.intersect(poligonoAplicado, areaPlanejada);
        const desperdicio = turf.difference(poligonoAplicado, areaPlanejada);
        const falha = turf.difference(areaPlanejada, poligonoAplicado);

        // 5. Cálculo de Áreas (em hectares)
        const areaAplicadaTotalHa = turf.area(poligonoAplicado) / 10000;
        const areaCorretaHa = intersecao ? turf.area(intersecao) / 10000 : 0;
        const areaDesperdicioHa = desperdicio ? turf.area(desperdicio) / 10000 : 0;
        const areaFalhaHa = falha ? turf.area(falha) / 10000 : 0;
        const areaPlanejadaHa = turf.area(areaPlanejada) / 10000;
        const percentualCobertura = areaPlanejadaHa > 0 ? (areaCorretaHa / areaPlanejadaHa) * 100 : 0;

        // 6. Salvar resultados
        const resultados = {
            status: 'Concluído',
            geometria_voo: turf.feature(linhaVoo).geometry,
            geometria_aplicada: turf.feature(poligonoAplicado).geometry,
            geometria_correta: intersecao ? turf.feature(intersecao).geometry : null,
            geometria_desperdicio: desperdicio ? turf.feature(desperdicio).geometry : null,
            geometria_falha: falha ? turf.feature(falha).geometry : null,
            area_aplicada_total_ha: areaAplicadaTotalHa,
            area_correta_ha: areaCorretaHa,
            area_desperdicio_ha: areaDesperdicioHa,
            area_falha_ha: areaFalhaHa,
            area_planejada_ha: areaPlanejadaHa,
            percentual_cobertura: percentualCobertura,
            processadoEm: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!testMode) {
            await aplicacaoRef.update(resultados);
            await db.collection('ordens_servico').doc(ordemServico.id).update({ status: 'Concluído' });
            console.log(`Processamento da aplicação ${aplicacaoId} concluído e salvo com sucesso.`);
        }

        return resultados;

    } catch (error) {
        console.error(`Erro ao processar aplicação ${aplicacaoId}:`, error);
        await aplicacaoRef.update({
            status: 'Erro no Processamento',
            erro: error.message
        });
    }
}

module.exports = { processarLogVoo };
