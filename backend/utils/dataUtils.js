const getFilteredData = async (db, collectionName, filters) => {
    if (!filters.companyId) {
        return [];
    }

    let query = db.collection(collectionName).where('companyId', '==', filters.companyId);

    const snapshot = await query.get();
    let data = [];
    snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
    });
    if (filters.inicio) {
        data = data.filter(d => d.data >= filters.inicio);
    }
    if (filters.fim) {
        data = data.filter(d => d.data <= filters.fim);
    }

    let farmCodesToFilter = null;
    if (filters.fazendaCodigo && filters.fazendaCodigo !== '') {
        farmCodesToFilter = [filters.fazendaCodigo];
    } else if (filters.tipos) {
        const selectedTypes = filters.tipos.split(',').filter(t => t);
        if (selectedTypes.length > 0) {
            const companyFarmsQuery = db.collection('fazendas').where('companyId', '==', filters.companyId);
            const legacyFarmsQuery = db.collection('fazendas').where('companyId', '==', null);

            const [companyFarmsSnapshot, legacyFarmsSnapshot] = await Promise.all([
                companyFarmsQuery.get(),
                legacyFarmsQuery.get()
            ]);

            let allFarms = [];
            companyFarmsSnapshot.forEach(doc => allFarms.push(doc.data()));
            legacyFarmsSnapshot.forEach(doc => allFarms.push(doc.data()));

            const matchingFarmCodes = allFarms
                .filter(farm => farm.types && farm.types.some(t => selectedTypes.includes(t)))
                .map(farm => farm.code);

            if (matchingFarmCodes.length > 0) {
                farmCodesToFilter = matchingFarmCodes;
            } else {
                return [];
            }
        }
    }

    let filteredData = data;
    if (farmCodesToFilter) {
        filteredData = filteredData.filter(d => farmCodesToFilter.includes(d.codigo));
    }
    if (filters.matricula) {
        filteredData = filteredData.filter(d => d.matricula === filters.matricula);
    }
    if (filters.talhao) {
        filteredData = filteredData.filter(d => d.talhao && d.talhao.toLowerCase().includes(filters.talhao.toLowerCase()));
    }
    if (filters.frenteServico) {
        filteredData = filteredData.filter(d => d.frenteServico && d.frenteServico.toLowerCase().includes(filters.frenteServico.toLowerCase()));
    }

    // Sort logic: Farm (Numeric if possible) ASC, then Talhao (Alphanumeric) ASC, then Date ASC
    filteredData.sort((a, b) => {
        // Farm Sort
        const farmA = String(a.codigo || '').trim();
        const farmB = String(b.codigo || '').trim();

        // Try numeric sort for farms
        const farmANum = parseInt(farmA, 10);
        const farmBNum = parseInt(farmB, 10);

        if (!isNaN(farmANum) && !isNaN(farmBNum)) {
            if (farmANum !== farmBNum) return farmANum - farmBNum;
        } else {
            if (farmA !== farmB) return farmA.localeCompare(farmB, undefined, { numeric: true });
        }

        // Talhao Sort
        const talhaoA = String(a.talhao || '').trim();
        const talhaoB = String(b.talhao || '').trim();
        const talhaoCompare = talhaoA.localeCompare(talhaoB, undefined, { numeric: true });
        if (talhaoCompare !== 0) return talhaoCompare;

        // Date Sort (Fallback)
        const dateA = new Date(a.data);
        const dateB = new Date(b.data);
        return dateA - dateB;
    });

    return filteredData;
};

module.exports = {
    getFilteredData
};
