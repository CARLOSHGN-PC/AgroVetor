# Snippets de Código para Integração

Este documento contém todos os blocos de código (snippets) necessários para integrar o novo módulo de Planejamento e Execução de Instalação de Armadilhas no projeto existente.

Siga as instruções para cada arquivo, copiando e colando os blocos de código nos locais indicados.

---

## 1. `backend/package.json`

Adicione a seguinte dependência ao seu `package.json` na seção `"dependencies"` para incluir a biblioteca de geoprocessamento no backend:

```json
{
  "dependencies": {
    "...": "...",
    "@turf/turf": "^6.5.0",
    "multer": "^1.4.5-lts.1",
    "..."
  }
}
```
**Ação:** Após adicionar a dependência, navegue até a pasta `backend` e execute o comando `npm install`.

---

## 2. `firestore.rules`

Adicione as seguintes regras de segurança para as novas coleções do Firestore para garantir que apenas usuários autorizados possam acessar os dados. Insira estas regras no final do seu arquivo `firestore.rules`, dentro do bloco `service cloud.firestore`.

```
    // Regras para o Módulo de Planejamento de Instalação
    match /instalacaoPlanejamentos/{planId} {
      allow read, create, update, delete: if canAccessCompanyData(request.resource.data.companyId);
    }

    match /instalacaoPontos/{pointId} {
      allow read, create, update, delete: if canAccessCompanyData(request.resource.data.companyId);
    }

    match /instalacaoOrdensDeServico/{osId} {
      allow read, create, update, delete: if canAccessCompanyData(request.resource.data.companyId);
    }

    // Contador de OS deve ser acessível apenas pelo backend
    match /osCounters/{year} {
      allow read, write: if false;
    }
```

---

## 3. `docs/index.html`

Adicione os seguintes blocos de HTML ao seu `index.html`.

### 3.1. Novo Item de Menu

Encontre o menu suspenso `<!-- Menu Monitoramento Aéreo -->` e adicione o seguinte item de menu para o novo módulo.

```html
<!-- Inserir dentro do dropdown-menu de Monitoramento Aéreo -->
<li><a class="dropdown-item" href="#" id="menuPlanejamentoInstalacao">Planejamento de Instalação</a></li>
```

### 3.2. Novas Seções de Tela

Adicione estas seções (views) dentro da tag `<main class="content">`, junto com as outras seções existentes (como `#risk-view`, `#dashboard`, etc.).

```html
<!-- Novas seções para o Módulo de Planejamento -->
<section id="planejamento-instalacao-view" class="hidden" style="height: 100%;">
    <!-- O mapa será inserido aqui pelo app.js -->
</section>

<section id="lista-pontos-planejados-view" class="hidden">
    <div class="container-fluid">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="mb-0">Pontos Planejados</h2>
            <div>
                <button id="btnVoltarParaPlanejamento" class="btn btn-secondary">Voltar ao Mapa</button>
                <button id="btnGerarOS" class="btn save" disabled>Gerar OS</button>
            </div>
        </div>
        <div class="row mb-3">
            <!-- Filtros aqui se necessário -->
        </div>
        <div id="pontos-planejados-list" class="row">
            <!-- Os cards dos pontos serão inseridos aqui -->
        </div>
    </div>
</section>

<section id="lista-os-view" class="hidden">
    <div class="container-fluid">
        <h2 class="mb-3">Ordens de Serviço de Instalação</h2>
        <div id="os-list-container" class="row">
            <!-- Os cards das OS serão inseridos aqui -->
        </div>
    </div>
</section>

<section id="os-detalhe-view" class="hidden">
    <!-- Conteúdo do detalhe da OS -->
</section>

<section id="execucao-ponto-view" class="hidden">
    <div class="container-fluid">
        <h2 id="execucao-ponto-title" class="mb-3">Executar Ponto de Instalação</h2>
        <div class="card">
            <div class="card-body">
                <form id="formExecucaoPonto">
                    <input type="hidden" id="execucaoPontoId">
                    <input type="hidden" id="execucaoOsId">
                    <div class="mb-3">
                        <label for="execucaoObservacoes" class="form-label">Observações</label>
                        <textarea class="form-control" id="execucaoObservacoes" rows="3"></textarea>
                    </div>
                    <div class="mb-3">
                        <label for="execucaoFotos" class="form-label">Fotos (mínimo 1)</label>
                        <input type="file" class="form-control" id="execucaoFotos" accept="image/*" multiple required>
                    </div>
                    <div id="fotos-preview" class="mb-3"></div>
                    <div class="d-flex justify-content-end">
                        <button type="button" id="btnCancelarExecucao" class="btn btn-secondary me-2">Cancelar</button>
                        <button type="submit" class="btn save">Salvar Execução</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</section>

```

### 3.3. Novo Modal de Edição de Ponto

Adicione este modal no final do `<body>`, junto com os outros modais do aplicativo.

```html
<!-- Modal para Editar Ponto de Instalação -->
<div class="modal fade" id="instalacaoPontoModal" tabindex="-1" aria-labelledby="instalacaoPontoModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="instalacaoPontoModalLabel">Detalhes do Ponto de Instalação</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <form id="instalacaoPontoForm">
          <input type="hidden" id="instalacaoPontoId">
          <div class="mb-3">
            <label for="instalacaoPontoFazenda" class="form-label">Fazenda</label>
            <select class="form-select" id="instalacaoPontoFazenda" required></select>
          </div>
          <div class="mb-3">
            <label for="instalacaoPontoTalhao" class="form-label">Talhão</label>
            <select class="form-select" id="instalacaoPontoTalhao" required></select>
          </div>
          <div class="mb-3">
            <label for="instalacaoPontoResponsavel" class="form-label">Responsável</label>
            <select class="form-select" id="instalacaoPontoResponsavel" required></select>
          </div>
          <div class="mb-3">
            <label for="instalacaoPontoDataPrevista" class="form-label">Data Prevista</label>
            <input type="date" class="form-control" id="instalacaoPontoDataPrevista" required>
          </div>
          <div class="mb-3">
            <label for="instalacaoPontoDescricao" class="form-label">Descrição/Observações</label>
            <textarea class="form-control" id="instalacaoPontoDescricao" rows="3"></textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" id="btnExcluirPonto" class="btn btn-danger me-auto hidden">Excluir</button>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
        <button type="button" id="btnSalvarPonto" class="btn save">Salvar Ponto</button>
      </div>
    </div>
  </div>
</div>
```

---

## 4. `docs/app.js`

O `app.js` receberá a maior parte da lógica do frontend. Adicione os seguintes blocos de código nas seções correspondentes.

### 4.1. `App.state`

Adicione estas novas propriedades ao objeto `App.state` para gerenciar o estado do novo módulo.

```javascript
// Adicionar dentro de App.state
planejamento: {
    temporaryMarker: null,
    pontos: [],
    ordensDeServico: [],
    selectedPontoIds: new Set(),
},
```

### 4.2. `App.elements`

Adicione estas referências de elementos do DOM ao objeto `App.elements`.

```javascript
// Adicionar dentro de App.elements
menuPlanejamentoInstalacao: document.getElementById('menuPlanejamentoInstalacao'),
planejamentoInstalacaoView: document.getElementById('planejamento-instalacao-view'),
listaPontosPlanejadosView: document.getElementById('lista-pontos-planejados-view'),
listaOsView: document.getElementById('lista-os-view'),
osDetalheView: document.getElementById('os-detalhe-view'),
pontosPlanejadosList: document.getElementById('pontos-planejados-list'),
btnGerarOS: document.getElementById('btnGerarOS'),
btnVoltarParaPlanejamento: document.getElementById('btnVoltarParaPlanejamento'),
osListContainer: document.getElementById('os-list-container'),
// Modal de Ponto
instalacaoPontoModal: new bootstrap.Modal(document.getElementById('instalacaoPontoModal')),
instalacaoPontoForm: document.getElementById('instalacaoPontoForm'),
instalacaoPontoId: document.getElementById('instalacaoPontoId'),
instalacaoPontoFazenda: document.getElementById('instalacaoPontoFazenda'),
instalacaoPontoTalhao: document.getElementById('instalacaoPontoTalhao'),
instalacaoPontoResponsavel: document.getElementById('instalacaoPontoResponsavel'),
instalacaoPontoDataPrevista: document.getElementById('instalacaoPontoDataPrevista'),
instalacaoPontoDescricao: document.getElementById('instalacaoPontoDescricao'),
btnSalvarPonto: document.getElementById('btnSalvarPonto'),
btnExcluirPonto: document.getElementById('btnExcluirPonto'),
// Execução
execucaoPontoView: document.getElementById('execucao-ponto-view'),
formExecucaoPonto: document.getElementById('formExecucaoPonto'),
execucaoPontoId: document.getElementById('execucaoPontoId'),
execucaoOsId: document.getElementById('execucaoOsId'),
execucaoFotos: document.getElementById('execucaoFotos'),
fotosPreview: document.getElementById('fotos-preview'),
btnCancelarExecucao: document.getElementById('btnCancelarExecucao'),
```

### 4.3. `App.init`

Dentro da função `App.init`, adicione as chamadas para `setupPlanejamentoListeners()` para inicializar os listeners de eventos do novo módulo.

```javascript
// Adicionar dentro da função App.init
setupPlanejamentoListeners();
```

### 4.4. Nova Lógica (Funções e Listeners)

Adicione este bloco de código completo no final do arquivo `app.js`. Ele contém toda a lógica de frontend para o módulo, incluindo manipulação do mapa, modais, geração de OS, execução e sincronização offline.

```javascript
//================================================================================
// MÓDULO DE PLANEJAMENTO E EXECUÇÃO DE INSTALAÇÃO
//================================================================================

function setupPlanejamentoListeners() {
    App.elements.menuPlanejamentoInstalacao.addEventListener('click', () => {
        App.ui.showTab('planejamento-instalacao');
    });

    App.elements.btnSalvarPonto.addEventListener('click', salvarPontoPlanejado);
    App.elements.btnExcluirPonto.addEventListener('click', excluirPontoPlanejado);

    App.elements.instalacaoPontoFazenda.addEventListener('change', () => {
        const fazendaId = App.elements.instalacaoPontoFazenda.value;
        const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
        App.ui.populateSelect(App.elements.instalacaoPontoTalhao, fazenda ? fazenda.talhoes : [], 'id', 'name');
    });

    App.elements.btnGerarOS.addEventListener('click', handleGerarOSClick);
    App.elements.btnVoltarParaPlanejamento.addEventListener('click', () => {
        App.ui.showTab('planejamento-instalacao');
    });

    App.elements.formExecucaoPonto.addEventListener('submit', handleExecucaoSubmit);
    App.elements.btnCancelarExecucao.addEventListener('click', () => App.ui.showTab('lista-os'));

}

function showPlanejamentoInstalacaoView() {
    App.elements.planejamentoInstalacaoView.appendChild(App.elements.mapContainer);
    App.map.resize();
    setupMapForPlanning();
    loadAndRenderPontosPlanejados();
}

function setupMapForPlanning() {
    // Garante que os listeners não sejam duplicados
    App.map.off('click', criarPontoPlanejadoDraft);
    App.map.off('contextmenu', criarPontoPlanejadoDraft); // Simula long press na web

    App.map.on('click', criarPontoPlanejadoDraft);
    App.map.on('contextmenu', criarPontoPlanejadoDraft);
}

function criarPontoPlanejadoDraft(e) {
    if (App.state.planejamento.temporaryMarker) {
        App.state.planejamento.temporaryMarker.remove();
    }

    const { lng, lat } = e.lngLat;
    App.state.planejamento.temporaryMarker = new mapboxgl.Marker({ color: '#FFD700', draggable: true })
        .setLngLat([lng, lat])
        .addTo(App.map);

    showPontoEditModal({ coordenadas: { lng, lat } });
}

function showPontoEditModal(ponto = {}) {
    App.elements.instalacaoPontoForm.reset();
    App.elements.instalacaoPontoId.value = ponto.id || '';

    App.ui.populateSelect(App.elements.instalacaoPontoFazenda, App.state.fazendas, 'id', 'name', 'Selecione');
    App.ui.populateSelect(App.elements.instalacaoPontoResponsavel, App.state.users, 'uid', 'username', 'Selecione');

    if (ponto.coordenadas) {
        autoIdentificarLocalizacao(ponto.coordenadas).then(({ fazendaId, talhaoId }) => {
            if (fazendaId) {
                App.elements.instalacaoPontoFazenda.value = fazendaId;
                const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                App.ui.populateSelect(App.elements.instalacaoPontoTalhao, fazenda ? fazenda.talhoes : [], 'id', 'name');
                if (talhaoId) {
                    App.elements.instalacaoPontoTalhao.value = talhaoId;
                }
            }
        });
    }

    if (ponto.id) { // Editando ponto existente
        App.elements.instalacaoPontoFazenda.value = ponto.fazendaId || '';
        const fazenda = App.state.fazendas.find(f => f.id === ponto.fazendaId);
        App.ui.populateSelect(App.elements.instalacaoPontoTalhao, fazenda ? fazenda.talhoes : [], 'id', 'name');
        App.elements.instalacaoPontoTalhao.value = ponto.talhaoId || '';
        App.elements.instalacaoPontoResponsavel.value = ponto.responsavelId || '';
        App.elements.instalacaoPontoDataPrevista.value = ponto.dataPrevistaInstalacao || '';
        App.elements.instalacaoPontoDescricao.value = ponto.descricao || '';
        App.elements.btnExcluirPonto.classList.remove('hidden');
    } else {
         App.elements.btnExcluirPonto.classList.add('hidden');
    }

    App.elements.instalacaoPontoModal.show();
}

async function autoIdentificarLocalizacao(coords) {
    if (!App.state.geoJsonData || !turf) return { fazendaId: null, talhaoId: null };

    const point = turf.point([coords.lng, coords.lat]);

    for (const feature of App.state.geoJsonData.features) {
        if (turf.booleanPointInPolygon(point, feature)) {
            const props = feature.properties;
            const farmCode = props.FUNDO_AGR || props.fundo_agr;
            const talhaoName = props.CD_TALHAO || props.cd_talhao;

            if (farmCode) {
                const fazenda = App.state.fazendas.find(f => String(f.code).trim() === String(farmCode).trim());
                if (fazenda) {
                    const talhao = fazenda.talhoes.find(t => t.name.trim().toUpperCase() === talhaoName.trim().toUpperCase());
                    return { fazendaId: fazenda.id, talhaoId: talhao ? talhao.id : null };
                }
            }
        }
    }
    return { fazendaId: null, talhaoId: null };
}


async function salvarPontoPlanejado() {
    const id = App.elements.instalacaoPontoId.value;
    const markerCoords = App.state.planejamento.temporaryMarker.getLngLat();

    const data = {
        fazendaId: App.elements.instalacaoPontoFazenda.value,
        talhaoId: App.elements.instalacaoPontoTalhao.value,
        responsavelId: App.elements.instalacaoPontoResponsavel.value,
        dataPrevistaInstalacao: App.elements.instalacaoPontoDataPrevista.value,
        descricao: App.elements.instalacaoPontoDescricao.value,
        coordenadas: { lat: markerCoords.lat, lng: markerCoords.lng },
        status: 'Planejado',
        companyId: App.state.user.companyId,
    };

    try {
        App.ui.setLoading(true);
        if (id) {
            data.updatedEm = new Date().toISOString();
            await App.data.updateDocument('instalacaoPontos', id, data);
            App.ui.showAlert('Ponto atualizado com sucesso!');
        } else {
            data.criadoPorUserId = App.state.user.uid;
            data.criadoEm = new Date().toISOString();
            await App.data.addDocument('instalacaoPontos', data);
            App.ui.showAlert('Ponto salvo com sucesso!');
        }
    } catch (error) {
        console.error("Erro ao salvar ponto:", error);
        App.ui.showAlert('Erro ao salvar ponto. Verifique sua conexão.', 'error');
    } finally {
        App.ui.setLoading(false);
        App.elements.instalacaoPontoModal.hide();
        if (App.state.planejamento.temporaryMarker) {
            App.state.planejamento.temporaryMarker.remove();
            App.state.planejamento.temporaryMarker = null;
        }
    }
}

async function excluirPontoPlanejado() {
    const pontoId = App.elements.instalacaoPontoId.value;
    if (!pontoId) return;

    const confirmed = await App.ui.showConfirmationModal('Tem certeza que deseja excluir este ponto?');
    if (confirmed) {
        try {
            App.ui.setLoading(true);
            await App.data.deleteDocument('instalacaoPontos', pontoId);
            App.ui.showAlert('Ponto excluído com sucesso.');
        } catch (error) {
            console.error('Erro ao excluir ponto:', error);
            App.ui.showAlert('Erro ao excluir o ponto.', 'error');
        } finally {
            App.ui.setLoading(false);
            App.elements.instalacaoPontoModal.hide();
        }
    }
}


function loadAndRenderPontosPlanejados() {
    App.data.getCollection('instalacaoPontos', (pontos) => {
        App.state.planejamento.pontos = pontos.filter(p => p.companyId === App.state.user.companyId);
        renderPontosNoMapa();
    }, { where: ["status", "in", ["Planejado", "Em OS", "Instalado"]] });

    App.data.getCollection('instalacaoOrdensDeServico', (os) => {
        App.state.planejamento.ordensDeServico = os.filter(o => o.companyId === App.state.user.companyId);
        // Pode-se chamar uma função de renderização aqui se necessário
    }, {});
}

let renderedMarkers = {};
function renderPontosNoMapa() {
    // Remove marcadores antigos
    Object.values(renderedMarkers).forEach(marker => marker.remove());
    renderedMarkers = {};

    App.state.planejamento.pontos.forEach(ponto => {
        if (ponto.coordenadas) {
            const el = document.createElement('div');
            el.className = 'marker';
            el.style.backgroundColor = ponto.status === 'Instalado' ? '#28a745' : (ponto.status === 'Em OS' ? '#ffc107' : '#007bff');
            el.style.width = '12px';
            el.style.height = '12px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid #fff';


            const marker = new mapboxgl.Marker({
                element: el,
                draggable: ponto.status === 'Planejado' // Só permite arrastar se estiver planejado
            })
            .setLngLat([ponto.coordenadas.lng, ponto.coordenadas.lat])
            .addTo(App.map);

            marker.getElement().addEventListener('click', () => {
                if(ponto.status === 'Planejado') {
                    // Remove o rascunho se existir para evitar confusão
                    if (App.state.planejamento.temporaryMarker) {
                        App.state.planejamento.temporaryMarker.remove();
                        App.state.planejamento.temporaryMarker = null;
                    }
                    // Define o marcador clicado como o "temporário" para a função de salvar
                    App.state.planejamento.temporaryMarker = marker;
                    showPontoEditModal(ponto);
                } else {
                    // Apenas mostra um popup com informações
                     new mapboxgl.Popup({ closeButton: false })
                        .setLngLat(marker.getLngLat())
                        .setHTML(`<strong>Status:</strong> ${ponto.status}`)
                        .addTo(App.map);
                }
            });

            marker.on('dragend', () => {
                const newCoords = marker.getLngLat();
                App.data.updateDocument('instalacaoPontos', ponto.id, {
                    coordenadas: { lat: newCoords.lat, lng: newCoords.lng }
                }).then(() => {
                    App.ui.showAlert('Posição do ponto atualizada.', 'success');
                }).catch(err => {
                    console.error("Erro ao mover ponto:", err);
                    App.ui.showAlert('Erro ao atualizar posição.', 'error');
                    // Reverte a posição do marcador para a original em caso de erro
                    marker.setLngLat([ponto.coordenadas.lng, ponto.coordenadas.lat]);
                });
            });


            renderedMarkers[ponto.id] = marker;
        }
    });
}

function showListaPontosPlanejadosView() {
    const pontos = App.state.planejamento.pontos.filter(p => p.status === 'Planejado');
    const listEl = App.elements.pontosPlanejadosList;
    listEl.innerHTML = '';
    App.state.planejamento.selectedPontoIds.clear(); // Limpa seleção anterior
    App.elements.btnGerarOS.disabled = true;

    if (pontos.length === 0) {
        listEl.innerHTML = '<p class="col-12">Nenhum ponto planejado para ser incluído em uma OS.</p>';
        return;
    }

    pontos.forEach(ponto => {
        const fazenda = App.state.fazendas.find(f => f.id === ponto.fazendaId);
        const responsavel = App.state.users.find(u => u.uid === ponto.responsavelId);

        const card = `
         <div class="col-md-6 col-lg-4 mb-3">
            <div class="card plano-card">
                <div class="card-body d-flex align-items-center">
                    <div class="form-check me-3">
                        <input class="form-check-input ponto-select-checkbox" type="checkbox" value="${ponto.id}" id="check-${ponto.id}">
                    </div>
                    <div class="flex-grow-1">
                        <h5 class="card-title mb-1">${fazenda ? fazenda.name : 'Fazenda não encontrada'}</h5>
                        <p class="card-text mb-1">
                            <strong>Data Prevista:</strong> ${ponto.dataPrevistaInstalacao}
                        </p>
                         <p class="card-text mb-0">
                            <strong>Responsável:</strong> ${responsavel ? responsavel.username : 'Não definido'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
        `;
        listEl.insertAdjacentHTML('beforeend', card);
    });

    listEl.querySelectorAll('.ponto-select-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                App.state.planejamento.selectedPontoIds.add(e.target.value);
            } else {
                App.state.planejamento.selectedPontoIds.delete(e.target.value);
            }
            App.elements.btnGerarOS.disabled = App.state.planejamento.selectedPontoIds.size === 0;
        });
    });
}

async function handleGerarOSClick() {
    const pontosIds = Array.from(App.state.planejamento.selectedPontoIds);
    if (pontosIds.length === 0) return;

    // Simula um modal para simplicidade, poderia ser um modal BS
    const responsavelOSId = prompt("Digite o ID do responsável pela OS:", App.state.user.uid);
    if (!responsavelOSId) return;

    const observacoes = prompt("Observações para a OS:");

    const payload = {
        pontosIds,
        responsavelOSId,
        observacoes,
        criadoPorUserId: App.state.user.uid,
        companyId: App.state.user.companyId
    };

    try {
        App.ui.setLoading(true);
        const response = await App.data._fetchWithAuth('/api/os/generate', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(await response.text());

        App.ui.showAlert('Ordem de Serviço gerada com sucesso!', 'success');
        App.ui.showTab('lista-os');
    } catch (error) {
        console.error("Erro ao gerar OS:", error);
        App.ui.showAlert(`Erro ao gerar OS: ${error.message}`, 'error');
        // Adiciona a OS na fila offline em caso de erro de rede
        if (!navigator.onLine) {
            App.data.addToOfflineQueue('generate-os', payload);
            App.ui.showAlert('OS adicionada à fila para sincronização.', 'info');
             App.ui.showTab('lista-os');
        }
    } finally {
        App.ui.setLoading(false);
    }
}


function showListaOsView() {
    const container = App.elements.osListContainer;
    container.innerHTML = '';
    const sortedOS = App.state.planejamento.ordensDeServico.sort((a, b) => (b.criadoEm?.toDate() || 0) - (a.criadoEm?.toDate() || 0));

    if(sortedOS.length === 0){
        container.innerHTML = '<p class="col-12">Nenhuma Ordem de Serviço encontrada.</p>';
        return;
    }

    sortedOS.forEach(os => {
        const responsavel = App.state.users.find(u => u.uid === os.responsavelOSId);
        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4 mb-3';
        card.innerHTML = `
            <div class="card plano-card">
                <div class="card-body">
                    <h5 class="card-title">${os.numeroOS || 'OS Pendente'}</h5>
                    <p class="card-text mb-1">
                        <strong>Responsável:</strong> ${responsavel ? responsavel.username : 'N/A'}
                    </p>
                    <p class="card-text mb-1">
                        <strong>Status:</strong> <span class="badge bg-primary">${os.status}</span>
                    </p>
                    <p class="card-text mb-0">
                        <strong>Pontos:</strong> ${os.pontosIds.length}
                    </p>
                </div>
            </div>
        `;
        card.addEventListener('click', () => showOsDetalheView(os.id));
        container.appendChild(card);
    });
}


function showOsDetalheView(osId) {
    App.ui.showTab('os-detalhe');
    const os = App.state.planejamento.ordensDeServico.find(o => o.id === osId);
    if (!os) return;

    const container = App.elements.osDetalheView;
    const pontos = App.state.planejamento.pontos.filter(p => os.pontosIds.includes(p.id));

    let pontosHtml = pontos.map(p => {
        const fazenda = App.state.fazendas.find(f => f.id === p.fazendaId);
        return `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                ${fazenda ? fazenda.name : ''} - Talhão ${p.talhaoId}
                <div>
                    <span class="badge bg-info me-2">${p.status}</span>
                    ${p.status === 'Em OS' ? `<button class="btn btn-sm save btn-executar-ponto" data-ponto-id="${p.id}" data-os-id="${os.id}">Executar</button>` : ''}
                </div>
            </li>
        `;
    }).join('');

    container.innerHTML = `
        <div class="container-fluid">
            <h2>Detalhes da OS: ${os.numeroOS}</h2>
            <ul class="list-group">
                ${pontosHtml}
            </ul>
            <button class="btn btn-secondary mt-3" onclick="App.ui.showTab('lista-os')">Voltar</button>
        </div>
    `;

    container.querySelectorAll('.btn-executar-ponto').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pontoId = e.target.dataset.pontoId;
            const osId = e.target.dataset.osId;
            showExecucaoPontoView(pontoId, osId);
        });
    });
}

function showExecucaoPontoView(pontoId, osId) {
    App.ui.showTab('execucao-ponto');
    App.elements.formExecucaoPonto.reset();
    App.elements.fotosPreview.innerHTML = '';
    App.elements.execucaoPontoId.value = pontoId;
    App.elements.execucaoOsId.value = osId;
}

async function handleExecucaoSubmit(e) {
    e.preventDefault();
    const pontoId = App.elements.execucaoPontoId.value;
    const osId = App.elements.execucaoOsId.value;
    const observacoes = document.getElementById('execucaoObservacoes').value;
    const files = App.elements.execucaoFotos.files;

    if (files.length === 0) {
        App.ui.showAlert('É necessário anexar pelo menos uma foto.', 'warning');
        return;
    }

    try {
        App.ui.setLoading(true);

        // Se estiver online, usa FormData. Se offline, usa Base64.
        if (navigator.onLine) {
            const formData = new FormData();
            const payload = {
                pontoId, osId, observacoes,
                concluidoPorUserId: App.state.user.uid,
                companyId: App.state.user.companyId,
            };
            formData.append('payload', JSON.stringify(payload));
            for (const file of files) {
                formData.append('photos', file);
            }

            const response = await App.data._fetchWithAuth('/api/os/execute', {
                method: 'POST',
                body: formData,
                // Não defina Content-Type, o browser faz isso para FormData
            }, true); // O 'true' pula a conversão para JSON

             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro no servidor');
            }


        } else {
             // Modo offline: Converte fotos para Base64 e enfileira
            const photos = await Promise.all(Array.from(files).map(fileToBase64));
            const payload = {
                pontoId, osId, observacoes, photos,
                concluidoPorUserId: App.state.user.uid,
                companyId: App.state.user.companyId,
            };
            App.data.addToOfflineQueue('execute-ponto', payload);
            App.ui.showAlert('Execução salva localmente para sincronização.', 'info');
        }

        App.ui.showTab('lista-os');
        App.ui.showAlert('Execução salva com sucesso!', 'success');

    } catch (error) {
        console.error("Erro ao executar ponto:", error);
        App.ui.showAlert(`Erro ao salvar execução: ${error.message}`, 'error');
    } finally {
        App.ui.setLoading(false);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve({
            name: file.name,
            type: file.type,
            base64: reader.result
        });
        reader.onerror = error => reject(error);
    });
}
```

---

## 5. `backend/server.js`

Adicione as seguintes dependências no topo do `server.js`.

```javascript
// Adicionar no topo do server.js
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const turf = require('@turf/turf');
```

### 5.1. Novos Endpoints da API

Adicione este bloco de código completo no final do seu `server.js`, antes da linha `app.listen`. Ele contém os endpoints para gerar OS e registrar a execução.

```javascript
// --- [NOVO] ENDPOINT PARA GERAÇÃO DE ORDEM DE SERVIÇO (OS) ---
app.post('/api/os/generate', async (req, res) => {
    const { pontosIds, responsavelOSId, observacoes, criadoPorUserId, companyId } = req.body;

    if (!pontosIds || !Array.isArray(pontosIds) || pontosIds.length === 0) {
        return res.status(400).json({ message: 'A lista de IDs de pontos é obrigatória.' });
    }
    if (!responsavelOSId) {
        return res.status(400).json({ message: 'O responsável pela OS é obrigatório.' });
    }
    if (!criadoPorUserId) {
        return res.status(400).json({ message: 'O ID do criador é obrigatório.' });
    }
     if (!companyId) {
        return res.status(400).json({ message: 'O ID da empresa é obrigatório.' });
    }


    try {
        const ano = new Date().getFullYear();
        const counterRef = db.collection('osCounters').doc(String(ano));

        const newOSRef = db.collection('instalacaoOrdensDeServico').doc();

        await db.runTransaction(async (transaction) => {
            // 1. Validar se todos os pontos ainda estão "Planejado"
            const pontosRefs = pontosIds.map(id => db.collection('instalacaoPontos').doc(id));
            const pontosDocs = await transaction.getAll(...pontosRefs);

            for (const pontoDoc of pontosDocs) {
                if (!pontoDoc.exists) {
                    throw new Error(`Ponto com ID ${pontoDoc.id} não encontrado.`);
                }
                const pontoData = pontoDoc.data();
                if (pontoData.status !== 'Planejado') {
                    throw new Error(`O ponto ${pontoDoc.id} não está mais no status "Planejado". A operação foi cancelada.`);
                }
                 if (pontoData.companyId !== companyId) {
                    throw new Error(`O ponto ${pontoDoc.id} não pertence à empresa correta.`);
                }
            }

            // 2. Incrementar o contador de OS atomicamente
            const counterDoc = await transaction.get(counterRef);
            let newSeq = 1;
            if (counterDoc.exists) {
                newSeq = counterDoc.data().lastSeq + 1;
            }
            transaction.set(counterRef, { lastSeq: newSeq }, { merge: true });

            const numeroOS = `OS-${ano}-${String(newSeq).padStart(3, '0')}`;

            // 3. Criar a nova Ordem de Serviço
            const newOSData = {
                id: newOSRef.id,
                companyId: companyId,
                numeroOS: numeroOS,
                ano: ano,
                sequencial: newSeq,
                pontosIds: pontosIds,
                responsavelOSId: responsavelOSId,
                dataCriacao: admin.firestore.FieldValue.serverTimestamp(),
                prazoExecucao: null, // Conforme especificado, não há função de cálculo de prazo
                status: "Planejada",
                observacoes: observacoes || "",
                criadoPorUserId: criadoPorUserId,
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                syncStatus: "synced"
            };
            transaction.set(newOSRef, newOSData);

            // 4. Atualizar cada ponto selecionado
            pontosRefs.forEach(pontoRef => {
                transaction.update(pontoRef, {
                    osId: newOSRef.id,
                    status: 'Em OS',
                    responsavelId: responsavelOSId, // Sobrescreve o responsável
                    updatedEm: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        });

        res.status(201).json({ message: 'Ordem de Serviço gerada com sucesso!', osId: newOSRef.id });

    } catch (error) {
        console.error("Erro na transação de geração de OS:", error);
        res.status(500).json({ message: `Erro ao gerar Ordem de Serviço: ${error.message}` });
    }
});

// --- [NOVO] ENDPOINT PARA EXECUÇÃO DE PONTO DA OS ---
app.post('/api/os/execute', upload.any(), async (req, res) => {
    const isOffline = req.get('Content-Type').includes('application/json');

    const payload = isOffline ? req.body : JSON.parse(req.body.payload);
    const { pontoId, observacoes, concluidoPorUserId, companyId, osId, photos: base64Photos } = payload;
    const files = req.files;

    if (!pontoId || !concluidoPorUserId || !companyId || !osId) {
        return res.status(400).json({ message: 'Dados insuficientes para executar o ponto.' });
    }
    if ((!files || files.length === 0) && (!base64Photos || base64Photos.length === 0)) {
        return res.status(400).json({ message: 'Pelo menos uma foto é obrigatória.' });
    }

    try {
        const dataInstalacao = admin.firestore.FieldValue.serverTimestamp();
        let photoURLs = [];

        // 1. Upload das fotos para o Storage
        const bucket = admin.storage().bucket();
        if (files && files.length > 0) {
            photoURLs = await Promise.all(
                files.map(async (file) => {
                    const filePath = `instalacoes/${companyId}/${osId}/${pontoId}/${Date.now()}_${file.originalname}`;
                    const fileUpload = bucket.file(filePath);
                    await fileUpload.save(file.buffer, { metadata: { contentType: file.mimetype }, public: true });
                    return fileUpload.publicUrl();
                })
            );
        } else if (base64Photos && base64Photos.length > 0) {
             photoURLs = await Promise.all(
                base64Photos.map(async (photo) => {
                    const filePath = `instalacoes/${companyId}/${osId}/${pontoId}/${Date.now()}_${photo.name}`;
                    const buffer = Buffer.from(photo.base64.split(',')[1], 'base64');
                    const fileUpload = bucket.file(filePath);
                    await fileUpload.save(buffer, { metadata: { contentType: photo.type }, public: true });
                    return fileUpload.publicUrl();
                })
            );
        }

        // 2. Executar a lógica de atualização no Firestore dentro de uma transação
        await db.runTransaction(async (transaction) => {
            const pontoRef = db.collection('instalacaoPontos').doc(pontoId);
            const osRef = db.collection('instalacaoOrdensDeServico').doc(osId);

            const pontoDoc = await transaction.get(pontoRef);
            if (!pontoDoc.exists) throw new Error("Ponto de instalação não encontrado.");

            const pontoData = pontoDoc.data();
            if (pontoData.status !== 'Em OS') throw new Error("Este ponto não está mais pendente de execução.");
            if (pontoData.companyId !== companyId) throw new Error("Este ponto não pertence à sua empresa.");

            const armadilhasCollection = db.collection('armadilhas');

            const center = new admin.firestore.GeoPoint(pontoData.coordenadas.lat, pontoData.coordenadas.lng);
            const latOffset = 0.00009 * 5; // ~5 metros
            const lonOffset = 0.00009 * 5;

            const proximityQuery = armadilhasCollection
                .where('companyId', '==', companyId)
                .where('latitude', '>=', center.latitude - latOffset)
                .where('latitude', '<=', center.latitude + latOffset)
                .where('longitude', '>=', center.longitude - lonOffset)
                .where('longitude', '<=', center.longitude + lonOffset);

            const proximitySnapshot = await proximityQuery.get();
            let armadilhaRef = null;

            if (!proximitySnapshot.empty) {
                const from = turf.point([center.longitude, center.latitude]);
                for (const doc of proximitySnapshot.docs) {
                    const armadilha = doc.data();
                    const to = turf.point([armadilha.longitude, armadilha.latitude]);
                    const distanceInMeters = turf.distance(from, to, { units: 'meters' });
                    if (distanceInMeters <= 5) {
                        armadilhaRef = doc.ref;
                        break;
                    }
                }
            }

            if (!armadilhaRef) {
                armadilhaRef = db.collection('armadilhas').doc();
                transaction.set(armadilhaRef, {
                    id: armadilhaRef.id,
                    companyId: companyId,
                    latitude: pontoData.coordenadas.lat,
                    longitude: pontoData.coordenadas.lng,
                    status: 'Ativa',
                    installationRecords: []
                });
            }

            const installationRecord = {
                instaladoEm: dataInstalacao,
                instaladoPor: concluidoPorUserId,
                pontoId: pontoId,
                osId: osId,
                photoURLs: photoURLs,
                observacoes: observacoes || ""
            };
            transaction.update(armadilhaRef, {
                installationRecords: admin.firestore.FieldValue.arrayUnion(installationRecord),
                status: 'Ativa'
            });

            transaction.update(pontoRef, {
                status: 'Instalado',
                dataInstalacao: dataInstalacao,
                concluidoPorUserId: concluidoPorUserId,
                fotoURLs: photoURLs,
                observacoes: observacoes || "",
                updatedEm: admin.firestore.FieldValue.serverTimestamp(),
                armadilhaId: armadilhaRef.id
            });

            const osDoc = await transaction.get(osRef);
            const osData = osDoc.data();
            const allPontosRefs = osData.pontosIds.map(id => db.collection('instalacaoPontos').doc(id));
            const allPontosDocs = await transaction.getAll(...allPontosRefs);

            const allDone = allPontosDocs.every(doc => {
                if (doc.id === pontoId) return true;
                return doc.exists && doc.data().status === 'Instalado';
            });

            if (allDone) {
                transaction.update(osRef, { status: 'Concluída' });
            }
        });

        res.status(200).json({ message: "Ponto executado e armadilha registada com sucesso!" });

    } catch (error) {
        console.error("Erro na execução do ponto:", error);
        res.status(500).json({ message: `Erro ao executar ponto: ${error.message}` });
    }
});
```
