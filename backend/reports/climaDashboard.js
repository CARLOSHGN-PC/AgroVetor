const { getClimaData } = require('./climaReport');

// Helper to normalize dates (handles DD/MM/YYYY and YYYY-MM-DD)
const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return null;

    // Trim whitespace
    dateStr = dateStr.trim();

    if (dateStr.includes('/')) {
        const parts = dateStr.split('/'); // Assumes DD/MM/YYYY
        if (parts.length === 3) {
            // Pad single digits
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
    } else if (dateStr.includes('-')) {
        const parts = dateStr.split('-'); // Assumes YYYY-MM-DD
        if (parts.length === 3) {
             const year = parts[0];
             const month = parts[1].padStart(2, '0');
             const day = parts[2].padStart(2, '0');
             return `${year}-${month}-${day}`;
        }
    }
    return dateStr;
};

const safeParseFloat = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.');
        const parsed = parseFloat(normalized);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

const getWeekNumber = (d) => {
    const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const dayOfWeekFirst = firstDayOfMonth.getDay();
    return Math.ceil((d.getDate() + dayOfWeekFirst) / 7);
};

const getClimateStats = async (db, filters) => {
    // 1. Fetch Raw Data using existing query logic
    // Reuse filters: inicio, fim, companyId, fazendaId (if filtered by farm)
    const rawData = await getClimaData(db, filters);

    // 2. Filter Logic (Already done by getClimaData for date range and farm, but let's double check dates locally if needed)
    // getClimaData uses database queries.

    // 3. Initialize Aggregators
    let sumTempMax = 0, countTempMax = 0;
    let sumTempMin = 0, countTempMin = 0;
    let sumUmidade = 0, countUmidade = 0;
    let sumVento = 0, countVento = 0;

    const monthlyFarmDataForKPI = {}; // { "YYYY-MM": { "farmId": totalRain } } for KPI

    // Data structures for Charts
    const dailyFarmDataForChart = {}; // { "YYYY-MM-DD": { "farmId": totalRain } } for Accumulation Chart
    const yearlyTotals = {}; // { "YYYY": totalRain } for History Chart
    const farmWindData = {}; // { "farmName": [values] } for Wind Chart
    const farmRainData = {}; // { "farmName": { total: 0, count: 0 } } for Latest Launch Chart

    // For Radar Chart
    let totalTempSum = 0, totalTempCount = 0; // (Max+Min)/2

    // Helper to find latest date for "Fazendas Lançadas" chart
    let latestDate = null;

    rawData.forEach(item => {
        const dateKey = normalizeDate(item.data);
        if (!dateKey) return;

        // KPI: Temp Max
        const tMax = safeParseFloat(item.tempMax);
        if (tMax > 0) { sumTempMax += tMax; countTempMax++; }

        // KPI: Temp Min
        const tMin = safeParseFloat(item.tempMin);
        if (tMin > 0) { sumTempMin += tMin; countTempMin++; }

        // KPI: Umidade
        const hum = safeParseFloat(item.umidade);
        if (hum > 0) { sumUmidade += hum; countUmidade++; }

        // KPI: Vento
        const wind = safeParseFloat(item.vento);
        if (wind > 0) { sumVento += wind; countVento++; }

        // Radar Chart: Avg Temp
        if (tMax > 0 && tMin > 0) {
            totalTempSum += (tMax + tMin) / 2;
            totalTempCount++;
        }

        // Rainfall Logic (Complex)
        const rain = safeParseFloat(item.pluviosidade);
        const farmId = item.fazendaId || 'unknown';
        const farmName = item.fazendaNome || 'Desconhecida';

        if (rain >= 0) { // rainfall can be 0
            // KPI Monthly Data
            const monthKey = dateKey.substring(0, 7); // YYYY-MM
            if (!monthlyFarmDataForKPI[monthKey]) monthlyFarmDataForKPI[monthKey] = {};
            if (!monthlyFarmDataForKPI[monthKey][farmId]) monthlyFarmDataForKPI[monthKey][farmId] = 0;
            monthlyFarmDataForKPI[monthKey][farmId] += rain;

            // Accumulation Chart Data
            if (!dailyFarmDataForChart[dateKey]) dailyFarmDataForChart[dateKey] = {};
            if (!dailyFarmDataForChart[dateKey][farmId]) dailyFarmDataForChart[dateKey][farmId] = 0;
            dailyFarmDataForChart[dateKey][farmId] += rain;

            // Latest Launch Chart Logic (find latest date)
            const d = new Date(dateKey + 'T00:00:00Z');
            if (!latestDate || d > latestDate) {
                latestDate = d;
            }
        }

        // Wind Chart Data
        if (wind > 0) {
            if (!farmWindData[farmName]) farmWindData[farmName] = [];
            farmWindData[farmName].push(wind);
        }
    });

    // --- KPI Calculations ---
    const avgTempMax = countTempMax > 0 ? sumTempMax / countTempMax : 0;
    const avgTempMin = countTempMin > 0 ? sumTempMin / countTempMin : 0;
    const avgUmidade = countUmidade > 0 ? sumUmidade / countUmidade : 0;
    const avgVento = countVento > 0 ? sumVento / countVento : 0;

    let acumuladoDasMedias = 0;
    Object.values(monthlyFarmDataForKPI).forEach(farmsInMonth => {
        let monthlySumOfFarmTotals = 0;
        Object.values(farmsInMonth).forEach(total => monthlySumOfFarmTotals += total);
        const uniqueFarmCount = Object.keys(farmsInMonth).length;
        if (uniqueFarmCount > 0) {
            acumuladoDasMedias += (monthlySumOfFarmTotals / uniqueFarmCount);
        }
    });

    // --- Chart 1: Accumulo Pluviosidade (Timeline) ---
    // Replicating logic from frontend
    const today = new Date();
    // Use filters or defaults
    let start = filters.inicio ? new Date(filters.inicio + 'T00:00:00') : new Date(today.getFullYear(), 0, 1);
    let end = filters.fim ? new Date(filters.fim + 'T00:00:00') : today;
    if (isNaN(start.getTime())) start = new Date(today.getFullYear(), 0, 1);
    if (isNaN(end.getTime())) end = today;

    const accumLabels = [];
    const accumData = [];
    const accumColors = [];

    let currentBucket = { key: null, type: '', farms: {} };

    const pushBucket = () => {
        if (currentBucket.key) {
            accumLabels.push(currentBucket.key);
            const uniqueFarmCount = Object.keys(currentBucket.farms).length;
            let bucketTotal = 0;
            Object.values(currentBucket.farms).forEach(total => bucketTotal += total);
            accumData.push(uniqueFarmCount > 0 ? bucketTotal / uniqueFarmCount : 0);

            if (currentBucket.type === 'month') accumColors.push('#B0BEC5');
            else if (currentBucket.type === 'week') accumColors.push('#42A5F5');
            else if (currentBucket.type === 'day') accumColors.push('#1976D2');
        }
    };

    const iterDate = new Date(start);
    const targetMonthYear = `${end.getFullYear()}-${end.getMonth()}`;
    let safeCounter = 0;

    while (iterDate <= end && safeCounter < 3000) {
        safeCounter++;
        const year = iterDate.getFullYear();
        const month = String(iterDate.getMonth() + 1).padStart(2, '0');
        const day = String(iterDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        const dayData = dailyFarmDataForChart[dateKey];

        let bucketKey = '';
        let bucketType = '';
        const iterMonthYear = `${year}-${iterDate.getMonth()}`;

        if (iterMonthYear !== targetMonthYear) {
            const monthName = iterDate.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
            bucketKey = monthName.charAt(0).toUpperCase() + monthName.slice(1);
            bucketType = 'month';
        } else {
            const isToday = iterDate.getDate() === end.getDate() &&
                          iterDate.getMonth() === end.getMonth() &&
                          iterDate.getFullYear() === end.getFullYear();

            if (isToday) {
                bucketKey = `Dia ${iterDate.getDate()}/${iterDate.getMonth() + 1}`;
                bucketType = 'day';
            } else {
                bucketKey = `Sem ${getWeekNumber(iterDate)}`;
                bucketType = 'week';
            }
        }

        if (bucketKey !== currentBucket.key) {
            pushBucket();
            currentBucket = { key: bucketKey, type: bucketType, farms: {} };
        }

        if (dayData) {
            Object.keys(dayData).forEach(farmId => {
                if (!currentBucket.farms[farmId]) currentBucket.farms[farmId] = 0;
                currentBucket.farms[farmId] += dayData[farmId];
            });
        }
        iterDate.setDate(iterDate.getDate() + 1);
    }
    pushBucket();

    // --- Chart 2: Historico Anual ---
    // Reuse monthlyFarmDataForKPI which is { "YYYY-MM": { farmId: total } }
    Object.keys(monthlyFarmDataForKPI).forEach(monthKey => {
        const year = monthKey.split('-')[0];
        const farmsInMonth = monthlyFarmDataForKPI[monthKey];
        const uniqueFarmCount = Object.keys(farmsInMonth).length;
        let monthlySum = 0;
        Object.values(farmsInMonth).forEach(t => monthlySum += t);
        const monthlyAvg = uniqueFarmCount > 0 ? monthlySum / uniqueFarmCount : 0;

        if (!yearlyTotals[year]) yearlyTotals[year] = 0;
        yearlyTotals[year] += monthlyAvg;
    });
    const historyYears = Object.keys(yearlyTotals).sort();
    const historyValues = historyYears.map(y => yearlyTotals[y]);

    // --- Chart 3: Fazendas Lançadas (Latest Date) ---
    // Needs a second pass over rawData to filter by latest date?
    // Optimization: We found latestDate during first pass.
    let latestLaunchLabels = [];
    let latestLaunchValues = [];

    if (latestDate) {
        const latestDateStr = latestDate.toISOString().split('T')[0];
        // Filter rawData for this date
        rawData.forEach(item => {
            const d = normalizeDate(item.data);
            if (d === latestDateStr) {
                const farmName = item.fazendaNome || 'N/A';
                const rain = safeParseFloat(item.pluviosidade);
                if (!farmRainData[farmName]) farmRainData[farmName] = { total: 0, count: 0 };
                farmRainData[farmName].total += rain;
                farmRainData[farmName].count++;
            }
        });

        const sortedFarms = Object.entries(farmRainData)
            .map(([name, val]) => ({ name, avg: val.count > 0 ? val.total / val.count : 0 }))
            .sort((a, b) => b.avg - a.avg);

        latestLaunchLabels = sortedFarms.map(i => i.name);
        latestLaunchValues = sortedFarms.map(i => i.avg);
    }

    // --- Chart 4: Velocidade Vento ---
    const avgWindByFarm = Object.entries(farmWindData).map(([name, values]) => ({
        name,
        avg: values.reduce((a, b) => a + b, 0) / values.length
    })).sort((a, b) => a.avg - b.avg);
    const windLabels = avgWindByFarm.map(i => i.name);
    const windValues = avgWindByFarm.map(i => i.avg);

    // --- Chart 5: Indice Climatologico (Radar) ---
    const avgTemp = totalTempCount > 0 ? totalTempSum / totalTempCount : 0;
    // Normalize (0-100)
    const normTemp = (avgTemp / 50) * 100;
    const normUmidade = avgUmidade; // Assuming 0-100 already
    const normVento = (avgVento / 60) * 100; // Assuming max 60

    return {
        kpis: {
            tempMax: avgTempMax,
            tempMin: avgTempMin,
            pluviosidade: acumuladoDasMedias,
            umidade: avgUmidade,
            vento: avgVento
        },
        charts: {
            accumulation: {
                labels: accumLabels,
                data: accumData,
                colors: accumColors
            },
            history: {
                labels: historyYears,
                data: historyValues
            },
            latestLaunch: {
                labels: latestLaunchLabels,
                data: latestLaunchValues
            },
            wind: {
                labels: windLabels,
                data: windValues
            },
            radar: {
                labels: ['Temperatura', 'Umidade', 'Vento'],
                data: [normTemp, normUmidade, normVento],
                rawValues: { temp: avgTemp, umidade: avgUmidade, vento: avgVento }
            }
        }
    };
};

module.exports = {
    getClimateStats
};
