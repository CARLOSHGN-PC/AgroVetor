export default {
    async render(app) {
        const { brocaDashboardInicio, brocaDashboardFim } = app.elements.dashboard;
        app.actions.saveDashboardDates('broca', brocaDashboardInicio.value, brocaDashboardFim.value);
        const consolidatedData = await app.actions.getConsolidatedData('registros');
        const data = app.actions.filterDashboardData(consolidatedData, brocaDashboardInicio.value, brocaDashboardFim.value);

        this.renderTop10FazendasBroca(app, data);
        this.renderBrocaMensal(app, data);
        this.renderBrocaPosicao(app, data);
        this.renderBrocaPorVariedade(app, data);
    },

    renderTop10FazendasBroca(app, data) {
        const fazendasMap = new Map();
        data.forEach(item => {
            const fazendaKey = `${item.codigo} - ${item.fazenda}`;
            if (!fazendasMap.has(fazendaKey)) fazendasMap.set(fazendaKey, { totalEntrenos: 0, totalBrocado: 0 });
            const f = fazendasMap.get(fazendaKey);
            f.totalEntrenos += Number(item.entrenos);
            f.totalBrocado += Number(item.brocado);
        });
        const fazendasArray = Array.from(fazendasMap.entries()).map(([nome, d]) => ({ nome, indice: d.totalEntrenos > 0 ? (d.totalBrocado / d.totalEntrenos) * 100 : 0 }));
        fazendasArray.sort((a, b) => b.indice - a.indice);
        const top10 = fazendasArray.slice(0, 10);

        const commonOptions = app.charts._getCommonChartOptions({ hasLongLabels: true });
        const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

        app.charts._createOrUpdateChart('graficoTop10FazendasBroca', {
            type: 'bar',
            data: {
                labels: top10.map(f => f.nome),
                datasets: [{
                    label: 'Índice de Broca (%)',
                    data: top10.map(f => f.indice),
                    backgroundColor: app.charts._getVibrantColors(top10.length)
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: false },
                    datalabels: {
                        color: datalabelColor,
                        anchor: 'end',
                        align: 'end',
                        font: { weight: 'bold', size: 14 },
                        formatter: (value) => `${value.toFixed(2)}%`
                    }
                }
            }
        });
    },

    renderBrocaMensal(app, data) {
        const dataByMonth = {};
        data.forEach(item => {
            if (!item.data) return;
            const date = new Date(item.data + 'T03:00:00Z');
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
            if (!dataByMonth[monthKey]) dataByMonth[monthKey] = { totalBrocado: 0, totalEntrenos: 0, label: monthLabel };
            dataByMonth[monthKey].totalBrocado += Number(item.brocado);
            dataByMonth[monthKey].totalEntrenos += Number(item.entrenos);
        });
        const sortedMonths = Object.keys(dataByMonth).sort();
        const labels = sortedMonths.map(key => dataByMonth[key].label);
        const chartData = sortedMonths.map(key => {
            const monthData = dataByMonth[key];
            return monthData.totalEntrenos > 0 ? (monthData.totalBrocado / monthData.totalEntrenos) * 100 : 0;
        });

        const commonOptions = app.charts._getCommonChartOptions();
        const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

        app.charts._createOrUpdateChart('graficoBrocaMensal', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Índice Mensal (%)',
                    data: chartData,
                    fill: true,
                    borderColor: app.ui._getThemeColors().primary,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    tension: 0.4
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    ...commonOptions.scales,
                    y: { ...commonOptions.scales.y, grid: { color: 'transparent', drawBorder: false } }
                },
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end', align: 'top', offset: 8,
                        color: datalabelColor,
                        font: { weight: 'bold', size: 14 },
                        formatter: (value) => `${value.toFixed(2)}%`
                    }
                }
            }
        });
    },

    renderBrocaPosicao(app, data) {
        const totalBase = data.reduce((sum, item) => sum + Number(item.base), 0);
        const totalMeio = data.reduce((sum, item) => sum + Number(item.meio), 0);
        const totalTopo = data.reduce((sum, item) => sum + Number(item.topo), 0);
        const totalGeral = totalBase + totalMeio + totalTopo;

        const commonOptions = app.charts._getCommonChartOptions();

        app.charts._createOrUpdateChart('graficoBrocaPosicao', {
            type: 'doughnut',
            data: {
                labels: ['Base', 'Meio', 'Topo'],
                datasets: [{
                    label: 'Posição da Broca',
                    data: [totalBase, totalMeio, totalTopo],
                    backgroundColor: app.charts._getVibrantColors(3)
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    ...commonOptions.plugins,
                    legend: { ...commonOptions.plugins.legend, position: 'top' },
                    datalabels: {
                        color: '#FFFFFF',
                        font: { weight: 'bold', size: 16 },
                        formatter: (value) => totalGeral > 0 ? `${(value / totalGeral * 100).toFixed(2)}%` : '0.00%'
                    }
                }
            }
        });
    },

    renderBrocaPorVariedade(app, data) {
        const variedadesMap = new Map();
        const fazendas = app.state.fazendas;

        data.forEach(item => {
            const farm = fazendas.find(f => f.code === item.codigo);
            const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === item.talhao.toUpperCase());
            const variedade = talhao?.variedade || 'N/A';

            if (!variedadesMap.has(variedade)) {
                variedadesMap.set(variedade, { totalEntrenos: 0, totalBrocado: 0 });
            }
            const v = variedadesMap.get(variedade);
            v.totalEntrenos += Number(item.entrenos);
            v.totalBrocado += Number(item.brocado);
        });

        const variedadesArray = Array.from(variedadesMap.entries())
            .map(([nome, d]) => ({ nome, indice: d.totalEntrenos > 0 ? (d.totalBrocado / d.totalEntrenos) * 100 : 0 }))
            .filter(v => v.nome !== 'N/A');

        variedadesArray.sort((a, b) => b.indice - a.indice);
        const top10 = variedadesArray.slice(0, 10);

        const commonOptions = app.charts._getCommonChartOptions({ indexAxis: 'y' });
        const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

        app.charts._createOrUpdateChart('graficoBrocaPorVariedade', {
            type: 'bar',
            data: {
                labels: top10.map(v => v.nome),
                datasets: [{
                    label: 'Índice de Broca (%)',
                    data: top10.map(v => v.indice),
                    backgroundColor: app.charts._getVibrantColors(top10.length).reverse()
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: false },
                    datalabels: {
                        color: datalabelColor,
                        anchor: 'end',
                        align: 'end',
                        font: { weight: 'bold', size: 14 },
                        formatter: (value) => `${value.toFixed(2)}%`
                    }
                }
            }
        });
    }
};
