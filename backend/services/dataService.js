const { db } = require('./firebase');

const sortByDateAndFazenda = (a, b) => {
    const dateComparison = new Date(a.data) - new Date(b.data);
    if (dateComparison !== 0) {
        return dateComparison;
    }
    const codeA = parseInt(a.codigo, 10) || 0;
    const codeB = parseInt(b.codigo, 10) || 0;
    return codeA - codeB;
};

const getFilteredData = async (collectionName, filters) => {
    if (!filters.companyId) {
        console.error("Tentativa de acesso a getFilteredData sem companyId.");
        throw new Error("ID da empresa é obrigatório.");
    }

    let query = db.collection(collectionName).where('companyId', '==', filters.companyId);

    // Initial date filtering at the query level where possible
    if (filters.inicio && collectionName !== 'perdas') { // 'perdas' has 'data' as string
        query = query.where('data', '>=', filters.inicio);
    }
    if (filters.fim && collectionName !== 'perdas') {
        query = query.where('data', '<=', filters.fim);
    }

    const snapshot = await query.get();
    let data = [];
    snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
    });

    // Manual date filtering for collections with string dates like 'perdas'
    if (collectionName === 'perdas') {
        if (filters.inicio) {
            data = data.filter(d => d.data >= filters.inicio);
        }
        if (filters.fim) {
            data = data.filter(d => d.data <= filters.fim);
        }
    }

    let farmCodesToFilter = null;

    if (filters.fazendaCodigo && filters.fazendaCodigo !== '') {
        farmCodesToFilter = [filters.fazendaCodigo];
    } else if (filters.tipos) {
        const selectedTypes = filters.tipos.split(',').filter(t => t);
        if (selectedTypes.length > 0) {
            const farmsQuery = db.collection('fazendas')
                                 .where('companyId', '==', filters.companyId)
                                 .where('types', 'array-contains-any', selectedTypes);
            const farmsSnapshot = await farmsQuery.get();
            const matchingFarmCodes = farmsSnapshot.docs.map(doc => doc.data().code);
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

    return filteredData.sort(sortByDateAndFazenda);
};


module.exports = {
    getFilteredData,
    sortByDateAndFazenda,
};
