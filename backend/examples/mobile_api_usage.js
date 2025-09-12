/**
 * Este arquivo contém exemplos de como o frontend (mobile ou web) pode interagir
 * com a API do backend agrícola.
 *
 * Estes são exemplos e precisam de uma implementação real com tratamento de erros,
 * autenticação, e uma biblioteca como axios ou fetch.
 */

// const axios = require('axios'); // Supondo que axios seja usado no projeto frontend
// const API_BASE_URL = 'http://localhost:3001'; // Ou a URL do servidor de produção

// --- Exemplo 1: Registrar uma nova atividade de campo (ex: Pulverização) ---
async function registrarAtividadeDeCampo(dadosAtividade) {
    /*
    const dadosAtividadeExemplo = {
        planejamentoId: "ID_DO_PLANEJAMENTO_DA_TAREFA", // ID vindo da lista de tarefas
        tipoAtividade: "Pulverização",
        data: new Date().toISOString(),
        detalhes": {
            "insumos": [
              { "insumoId": "ID_DO_HERBICIDA", "quantidade": 150, "unidade": "L" }
            ],
            "maquinario": ["ID_DO_PULVERIZADOR"],
            "observacoes": "Aplicação realizada com sucesso, vento calmo."
        }
    };

    try {
        const response = await axios.post(`${API_BASE_URL}/api/operations/atividades`, dadosAtividade);
        console.log('Atividade registrada com sucesso:', response.data);
        return response.data;
    } catch (error) {
        console.error('Erro ao registrar atividade:', error.response ? error.response.data : error.message);
        // Tratar o erro na UI
    }
    */
}


// --- Exemplo 2: Listar todas as fazendas cadastradas ---
async function listarFazendas() {
    /*
    try {
        const response = await axios.get(`${API_BASE_URL}/api/core/fazendas`);
        console.log('Fazendas encontradas:', response.data);
        return response.data;
    } catch (error) {
        console.error('Erro ao listar fazendas:', error.response ? error.response.data : error.message);
    }
    */
}

// --- Exemplo 3: Buscar o estoque atual de um insumo ---
async function getEstoqueAtual(insumoId) {
    /*
    if (!insumoId) {
        console.error("ID do insumo é necessário.");
        return;
    }

    try {
        const response = await axios.get(`${API_BASE_URL}/api/inventory/estoque/${insumoId}`);
        console.log(`Estoque do insumo ${insumoId}:`, response.data.estoqueAtual);
        return response.data;
    } catch (error) {
        console.error('Erro ao buscar estoque:', error.response ? error.response.data : error.message);
    }
    */
}

// --- Exemplo 4: Obter dados de rentabilidade para um talhão ---
async function getRentabilidadeTalhao(talhaoId, safraId) {
    /*
    if (!talhaoId || !safraId) {
        console.error("IDs do talhão e da safra são necessários.");
        return;
    }

    try {
        // Note que safraId é um query param
        const response = await axios.get(`${API_BASE_URL}/api/financial/rentabilidade/talhao/${talhaoId}?safraId=${safraId}`);
        console.log('Rentabilidade:', response.data);
        // Ex: {
        //   "talhaoId": "...",
        //   "safraId": "...",
        //   "totalReceitas": 50000,
        //   "totalDespesas": 35000,
        //   "lucro": 15000,
        //   "custosDetalhados": { "insumos": 20000, "outrasDespesas": 15000 }
        // }
        return response.data;
    } catch (error) {
        console.error('Erro ao calcular rentabilidade:', error.response ? error.response.data : error.message);
    }
    */
}
