import { createKMRepository } from './repositories/KMRepository.js';

const FleetModule = {
    historyPage: 0,
    itemsPerPage: 10,
    isInitialized: false,
    kmRepository: null,
    activeTrips: [],
    historyTrips: [],
    historyTotal: 0,
    autoFilledKm: null, // Store the auto-filled value for "Last Exit"

    init() {
        if (this.isInitialized) return;
        this.ensureRepository();
        this.setupEventListeners();
        this.isInitialized = true;
    },

    ensureRepository() {
        if (!this.kmRepository) {
            App.offlineDB.init();
            this.kmRepository = createKMRepository(App.offlineDB, {
                companyIdProvider: () => App.state.currentUser?.companyId
            });
        }
    },

    onShow() {
        // Reset forms and state when entering the module
        this.ensureRepository();
        this.clearFleetForm();
        this.clearTripForm();
        this.historyPage = 0;

        // Refresh lists
        this.loadActiveTrips();
        this.loadHistoryPage();
    },

    onHide() {
        this.clearFleetForm();
        this.clearTripForm();
        this.activeTrips = [];
        this.historyTrips = [];
        this.historyTotal = 0;
        this.historyPage = 0;
    },

    setupEventListeners() {
        // Fleet CRUD
        const btnSaveFrota = document.getElementById('btnSaveFrota');
        if (btnSaveFrota) {
            btnSaveFrota.addEventListener('click', () => this.saveVehicle());
        }

        // Trip Management
        const btnNovaSaidaKM = document.getElementById('btnNovaSaidaKM');
        if (btnNovaSaidaKM) {
            btnNovaSaidaKM.addEventListener('click', () => this.openStartTripModal());
        }

        const btnUltimaSaidaKM = document.getElementById('btnUltimaSaidaKM');
        if (btnUltimaSaidaKM) {
            btnUltimaSaidaKM.addEventListener('click', () => this.openStartTripModal({ useLastKm: true }));
        }

        const btnConfirmSaidaKM = document.getElementById('btnConfirmSaidaKM');
        if (btnConfirmSaidaKM) {
            btnConfirmSaidaKM.addEventListener('click', () => this.startTrip());
        }

        const btnCancelSaidaKM = document.getElementById('btnCancelSaidaKM');
        if (btnCancelSaidaKM) {
            btnCancelSaidaKM.addEventListener('click', () => {
                document.getElementById('modalSaidaKM').classList.remove('show');
            });
        }

        const btnCloseModalSaidaKM = document.getElementById('btnCloseModalSaidaKM');
        if (btnCloseModalSaidaKM) {
            btnCloseModalSaidaKM.addEventListener('click', () => {
                document.getElementById('modalSaidaKM').classList.remove('show');
            });
        }

        const btnConfirmChegadaKM = document.getElementById('btnConfirmChegadaKM');
        if (btnConfirmChegadaKM) {
            btnConfirmChegadaKM.addEventListener('click', () => this.endTrip());
        }

        const btnCancelChegadaKM = document.getElementById('btnCancelChegadaKM');
        if (btnCancelChegadaKM) {
            btnCancelChegadaKM.addEventListener('click', () => {
                document.getElementById('modalChegadaKM').classList.remove('show');
            });
        }

        const btnCloseModalChegadaKM = document.getElementById('btnCloseModalChegadaKM');
        if (btnCloseModalChegadaKM) {
            btnCloseModalChegadaKM.addEventListener('click', () => {
                document.getElementById('modalChegadaKM').classList.remove('show');
            });
        }

        // Toggle Abastecimento fields
        const checkAbasteceu = document.getElementById('kmChegadaAbasteceu');
        const divAbastecimento = document.getElementById('kmAbastecimentoFields');
        if (checkAbasteceu && divAbastecimento) {
            checkAbasteceu.addEventListener('change', (e) => {
                divAbastecimento.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // Pagination Controls
        const btnPrev = document.getElementById('btnHistoryPrev');
        if (btnPrev) btnPrev.addEventListener('click', () => this.changePage(-1));

        const btnNext = document.getElementById('btnHistoryNext');
        if (btnNext) btnNext.addEventListener('click', () => this.changePage(1));

        // Report Buttons
        const btnPdf = document.getElementById('btnRelatorioFrotaPDF');
        if (btnPdf) btnPdf.addEventListener('click', () => this.generateReport('pdf'));

        const btnExcel = document.getElementById('btnRelatorioFrotaExcel');
        if (btnExcel) btnExcel.addEventListener('click', () => this.generateReport('csv'));

        // Driver ID Lookup
        const driverIdInput = document.getElementById('kmSaidaMotorista');
        if (driverIdInput) {
            driverIdInput.addEventListener('input', (e) => this.lookupDriver(e.target.value));
        }

        // Justification Logic
        const kmInicialInput = document.getElementById('kmSaidaKmInicial');
        if (kmInicialInput) {
            kmInicialInput.addEventListener('input', (e) => this.checkKmJustification(parseFloat(e.target.value)));
        }
    },

    checkKmJustification(currentValue) {
        const container = document.getElementById('kmSaidaJustificativaContainer');
        if (!container || this.autoFilledKm === null) {
            if (container) container.style.display = 'none';
            return;
        }

        if (currentValue !== this.autoFilledKm) {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
            document.getElementById('kmSaidaJustificativa').value = ''; // Clear if reverted
        }
    },

    lookupDriver(matricula) {
        const display = document.getElementById('kmDriverName');
        if (!display) return;

        if (!matricula) {
            display.textContent = '';
            return;
        }

        const personnel = App.state.personnel || [];
        const person = personnel.find(p => String(p.matricula) === String(matricula));

        if (person) {
            display.textContent = person.name;
            display.style.color = 'var(--color-primary)';
        } else {
            display.textContent = 'Motorista não encontrado';
            display.style.color = 'var(--color-danger)';
        }
    },

    populateReportVehicleSelect() {
        const select = document.getElementById('relatorioFrotaVeiculo');
        if (!select) return;

        select.innerHTML = '<option value="">Todos</option>';
        const vehicles = App.state.frota || [];

        vehicles.sort((a,b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, {numeric: true})).forEach(v => {
            select.innerHTML += `<option value="${v.id}">${v.codigo} - ${v.placa}</option>`;
        });
    },

    changePage(delta) {
        const total = this.historyTotal || 0;
        const maxPage = Math.ceil(total / this.itemsPerPage) - 1;
        const newPage = this.historyPage + delta;

        if (newPage >= 0 && newPage <= maxPage) {
            this.historyPage = newPage;
            this.loadHistoryPage();
        }
    },

    // --- Fleet CRUD ---

    async saveVehicle() {
        const id = document.getElementById('frotaId').value;
        const data = {
            codigo: document.getElementById('frotaCodigo').value,
            placa: document.getElementById('frotaPlaca').value.toUpperCase(),
            tipo: document.getElementById('frotaTipo').value,
            marcaModelo: document.getElementById('frotaMarcaModelo').value,
            ano: document.getElementById('frotaAno').value,
            kmAtual: parseFloat(document.getElementById('frotaKmAtual').value) || 0,
            status: document.getElementById('frotaStatus').value,
            companyId: App.state.currentUser.companyId
        };

        if (!data.codigo || !data.placa) {
            App.ui.showAlert("Preencha Código e Placa.", "warning");
            return;
        }

        App.ui.setLoading(true, "A guardar veículo...");
        try {
            if (id) {
                await App.data.updateDocument('frota', id, data);
            } else {
                await App.data.addDocument('frota', data);
            }
            App.ui.showAlert("Veículo guardado com sucesso!");
            this.clearFleetForm();
            // Optimistic update handled by listener or immediate render if needed
        } catch (error) {
            console.error(error);
            App.ui.showAlert("Erro ao guardar veículo.", "error");
        } finally {
            App.ui.setLoading(false);
        }
    },

    editVehicle(vehicle) {
        document.getElementById('frotaId').value = vehicle.id;
        document.getElementById('frotaCodigo').value = vehicle.codigo;
        document.getElementById('frotaPlaca').value = vehicle.placa;
        document.getElementById('frotaTipo').value = vehicle.tipo;
        document.getElementById('frotaMarcaModelo').value = vehicle.marcaModelo;
        document.getElementById('frotaAno').value = vehicle.ano;
        document.getElementById('frotaKmAtual').value = vehicle.kmAtual;
        document.getElementById('frotaStatus').value = vehicle.status;
        document.getElementById('gestaoFrota').scrollIntoView({ behavior: 'smooth' });
    },

    clearFleetForm() {
        const fields = ['frotaId', 'frotaCodigo', 'frotaPlaca', 'frotaMarcaModelo', 'frotaAno', 'frotaKmAtual'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        const statusEl = document.getElementById('frotaStatus');
        if(statusEl) statusEl.value = 'ativo';
    },

    clearTripForm() {
        const fields = ['kmSaidaVeiculo', 'kmSaidaMotorista', 'kmSaidaKmInicial', 'kmSaidaOrigem', 'kmChegadaKmFinal', 'kmChegadaDestino', 'kmSaidaJustificativa'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });

        const justContainer = document.getElementById('kmSaidaJustificativaContainer');
        if (justContainer) justContainer.style.display = 'none';
        this.autoFilledKm = null;
    },

    renderFleetList() {
        const list = document.getElementById('frotaList');
        if (!list) return;

        const vehicles = App.state.frota || [];
        if (vehicles.length === 0) {
            list.innerHTML = '<p class="text-center">Nenhum veículo cadastrado.</p>';
            return;
        }

        let html = `
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--color-bg); text-align: left;">
                        <th style="padding: 10px;">Cód.</th>
                        <th style="padding: 10px;">Placa</th>
                        <th style="padding: 10px;">Modelo</th>
                        <th style="padding: 10px;">KM Atual</th>
                        <th style="padding: 10px;">Status</th>
                        <th style="padding: 10px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        vehicles.sort((a,b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, {numeric: true})).forEach(v => {
            html += `
                <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: 10px;">${v.codigo}</td>
                    <td style="padding: 10px;">${v.placa}</td>
                    <td style="padding: 10px;">${v.marcaModelo || '-'}</td>
                    <td style="padding: 10px;">${v.kmAtual}</td>
                    <td style="padding: 10px;">${v.status}</td>
                    <td style="padding: 10px;">
                        <button class="action-btn" onclick="App.fleet.editVehicle(App.state.frota.find(f => f.id === '${v.id}'))"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        list.innerHTML = html;
    },

    // --- KM Control Logic ---

    openStartTripModal(options = {}) {
        const { useLastKm = false } = options;
        const select = document.getElementById('kmSaidaVeiculo');
        select.innerHTML = '<option value="">Selecione...</option>';

        const activeVehicles = (App.state.frota || []).filter(v => v.status === 'ativo');
        activeVehicles.sort((a,b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, {numeric: true})).forEach(v => {
            select.innerHTML += `<option value="${v.id}" data-km="${v.kmAtual}">${v.codigo} - ${v.placa} (${v.marcaModelo})</option>`;
        });

        // Reset state for new modal opening
        this.autoFilledKm = null;
        document.getElementById('kmSaidaJustificativaContainer').style.display = 'none';
        document.getElementById('kmSaidaKmInicial').value = '';

        select.onchange = () => {
            const opt = select.options[select.selectedIndex];
            if (opt.value) {
                let initialKm = parseFloat(opt.dataset.km);

                // If "Última Saída" mode, we force the last known KM
                // Note: The select already has data-km populated from App.state.frota which is updated on endTrip.
                // So opt.dataset.km IS effectively the last KM.
                // However, standard flow allows editing without justification.
                // "Última Saída" flow enforces justification if changed.

                document.getElementById('kmSaidaKmInicial').value = initialKm;

                if (useLastKm) {
                    this.autoFilledKm = initialKm;
                    // Trigger check immediately in case the field was pre-filled differently (unlikely here but safe)
                    this.checkKmJustification(initialKm);
                } else {
                    this.autoFilledKm = null; // Standard mode doesn't track change
                    document.getElementById('kmSaidaJustificativaContainer').style.display = 'none';
                }
            }
        };

        // Pre-fill date with current local ISO string
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); // Adjust to local
        document.getElementById('kmSaidaDataHora').value = now.toISOString().slice(0, 16);

        document.getElementById('modalSaidaKM').classList.add('show');
    },

    async startTrip() {
        const veiculoId = document.getElementById('kmSaidaVeiculo').value;
        const motoristaMatricula = document.getElementById('kmSaidaMotorista').value;
        const kmInicial = parseFloat(document.getElementById('kmSaidaKmInicial').value);
        const origem = document.getElementById('kmSaidaOrigem').value;
        const dataHoraInput = document.getElementById('kmSaidaDataHora').value;

        // Justification Logic
        const justification = document.getElementById('kmSaidaJustificativa').value.trim();
        const isJustificationVisible = document.getElementById('kmSaidaJustificativaContainer').style.display !== 'none';

        if (!veiculoId || !motoristaMatricula || isNaN(kmInicial) || !origem || !dataHoraInput) {
            App.ui.showAlert("Preencha todos os campos.", "warning");
            return;
        }

        if (isJustificationVisible && justification.length < 10) {
            App.ui.showAlert("A justificativa deve ter pelo menos 10 caracteres.", "warning");
            return;
        }

        const vehicle = App.state.frota.find(v => v.id === veiculoId);

        // Find driver name
        const personnel = App.state.personnel || [];
        const person = personnel.find(p => String(p.matricula) === String(motoristaMatricula));
        const motoristaNome = person ? person.name : motoristaMatricula;

        const tripData = {
            veiculoId,
            veiculoNome: vehicle ? `${vehicle.codigo} - ${vehicle.placa}` : 'Desconhecido',
            motorista: motoristaNome, // Save Name for display
            motoristaMatricula: motoristaMatricula, // Save ID for reference
            kmInicial,
            origem,
            dataSaida: new Date(dataHoraInput).toISOString(),
            status: 'EM_DESLOCAMENTO',
            companyId: App.state.currentUser.companyId,
            criadoPor: App.state.currentUser.email,
            // New fields for traceability
            kmInicialOriginal: this.autoFilledKm,
            justificativaKmInicial: isJustificationVisible ? justification : null
        };

        App.ui.setLoading(true, "A registar saída...");
        try {
            await this.kmRepository.createKM(tripData);
            document.getElementById('modalSaidaKM').classList.remove('show');
            App.ui.showAlert("Saída registada com sucesso!");
            this.clearTripForm();
            await this.loadActiveTrips();
            if (navigator.onLine) {
                App.actions.syncOfflineWrites();
            }
        } catch (error) {
            console.error(error);
            App.ui.showAlert("Erro ao registar saída.", "error");
        } finally {
            App.ui.setLoading(false);
        }
    },

    openEndTripModal(trip) {
        document.getElementById('kmChegadaTripId').value = trip.id;
        document.getElementById('kmChegadaVeiculoTexto').textContent = trip.veiculoNome;
        document.getElementById('kmChegadaKmFinal').value = '';
        document.getElementById('kmChegadaDestino').value = '';
        document.getElementById('kmChegadaAbasteceu').checked = false;
        document.getElementById('kmAbastecimentoFields').style.display = 'none';

        document.getElementById('modalChegadaKM').classList.add('show');
    },

    openEndTripModalById(tripId) {
        const trip = this.activeTrips.find(item => item.id === tripId);
        if (trip) {
            this.openEndTripModal(trip);
        } else {
            App.ui.showAlert("Viagem não encontrada.", "error");
        }
    },

    async endTrip() {
        const tripId = document.getElementById('kmChegadaTripId').value;
        const kmFinal = parseFloat(document.getElementById('kmChegadaKmFinal').value);
        const destino = document.getElementById('kmChegadaDestino').value;
        const abasteceu = document.getElementById('kmChegadaAbasteceu').checked;

        if (!tripId || isNaN(kmFinal) || !destino) {
            App.ui.showAlert("Preencha KM Final e Destino.", "warning");
            return;
        }

        // Find the trip in activeTrips state
        const trip = this.activeTrips.find(t => t.id === tripId) || await this.kmRepository.getKM(tripId);
        if (!trip) {
            App.ui.showAlert("Viagem não encontrada.", "error");
            return;
        }

        if (kmFinal < trip.kmInicial) {
            App.ui.showAlert("KM Final não pode ser menor que o Inicial.", "error");
            return;
        }

        const kmRodado = kmFinal - trip.kmInicial;

        App.ui.setLoading(true, "A finalizar viagem...");
        try {
            // 1. Update Trip
            await this.kmRepository.updateKM(tripId, {
                kmFinal,
                destino,
                kmRodado,
                dataChegada: new Date().toISOString(),
                status: 'FINALIZADO'
            });

            // 2. Update Vehicle Current KM
            await this.queueOfflineWrite('update', 'frota', {
                kmAtual: kmFinal
            }, trip.veiculoId);
            const vehicle = (App.state.frota || []).find(v => v.id === trip.veiculoId);
            if (vehicle) {
                vehicle.kmAtual = kmFinal;
            }

            // 3. Save Abastecimento (if any)
            if (abasteceu) {
                const litros = parseFloat(document.getElementById('kmAbastecimentoLitros').value);
                const valor = parseFloat(document.getElementById('kmAbastecimentoValor').value);
                const tipo = document.getElementById('kmAbastecimentoTipo').value;

                if (litros > 0) {
                    await this.queueOfflineWrite('create', 'abastecimentos', {
                        tripId,
                        veiculoId: trip.veiculoId,
                        data: new Date().toISOString(),
                        km: kmFinal,
                        litros,
                        valor: valor || 0,
                        tipoCombustivel: tipo,
                        companyId: App.state.currentUser.companyId,
                        criadoPor: App.state.currentUser.email
                    });
                }
            }

            document.getElementById('modalChegadaKM').classList.remove('show');
            App.ui.showAlert(`Viagem finalizada! KM Rodado: ${kmRodado.toFixed(1)} km`);
            this.clearTripForm();
            await this.loadActiveTrips();
            await this.loadHistoryPage();
            if (navigator.onLine) {
                App.actions.syncOfflineWrites();
            }

        } catch (error) {
            console.error(error);
            App.ui.showAlert("Erro ao finalizar viagem.", "error");
        } finally {
            App.ui.setLoading(false);
        }
    },

    async loadActiveTrips() {
        const result = await this.kmRepository.listKM({
            page: 0,
            pageSize: 50,
            filters: {
                status: 'EM_DESLOCAMENTO',
                orderBy: 'dataSaida',
                direction: 'desc'
            }
        });
        this.activeTrips = result.items;
        this.renderActiveTrips();
    },

    renderActiveTrips() {
        const list = document.getElementById('kmActiveTripsList');
        if (!list) return;

        // Use the segregated state
        const trips = this.activeTrips || [];

        if (trips.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--color-text-light);">Nenhum veículo em deslocamento.</p>';
            return;
        }

        let html = '';
        trips.forEach(t => {
            const date = new Date(t.dataSaida).toLocaleString('pt-BR');
            html += `
                <div class="card" style="padding: 15px; margin-bottom: 10px; border-left-color: var(--color-warning); cursor: pointer;"
                     onclick="App.fleet.openEndTripModalById('${t.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h4 style="margin: 0; color: var(--color-primary-dark);">${t.veiculoNome}</h4>
                            <p style="margin: 5px 0 0; font-size: 13px; color: var(--color-text-light);"><i class="fas fa-user"></i> ${t.motorista}</p>
                            <p style="margin: 5px 0 0; font-size: 13px;"><i class="fas fa-map-marker-alt"></i> Origem: ${t.origem}</p>
                        </div>
                        <div style="text-align: right;">
                            <span style="background: var(--color-warning); color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px;">EM TRÂNSITO</span>
                            <p style="margin: 5px 0 0; font-size: 12px;">${date}</p>
                            <p style="margin: 5px 0 0; font-weight: bold;">KM Saída: ${t.kmInicial}</p>
                        </div>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    },

    async loadHistoryPage() {
        const result = await this.kmRepository.listKM({
            page: this.historyPage,
            pageSize: this.itemsPerPage,
            filters: {
                status: 'FINALIZADO',
                orderBy: 'dataChegada',
                direction: 'desc'
            }
        });
        const maxPage = Math.max(0, Math.ceil(result.total / this.itemsPerPage) - 1);
        if (this.historyPage > maxPage) {
            this.historyPage = maxPage;
            return this.loadHistoryPage();
        }
        this.historyTrips = result.items;
        this.historyTotal = result.total;
        this.renderHistory();
    },

    renderHistory() {
        const list = document.getElementById('kmHistoryList');
        if (!list) return;

        // Ensure we clear the list first to avoid ghost elements from previous renders
        list.innerHTML = '';

        const trips = this.historyTrips || [];

        if (trips.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--color-text-light);">Nenhum histórico recente.</p>';
            this.updatePaginationControls(); // Disable buttons
            return;
        }

        let html = `
            <table style="width:100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="background: var(--color-bg); text-align: left;">
                        <th style="padding: 8px;">Data</th>
                        <th style="padding: 8px;">Veículo</th>
                        <th style="padding: 8px;">Motorista</th>
                        <th style="padding: 8px;">Origem -> Destino</th>
                        <th style="padding: 8px;">KM Rodado</th>
                    </tr>
                </thead>
                <tbody>
        `;

        trips.forEach(t => {
            const date = new Date(t.dataChegada).toLocaleDateString('pt-BR');
            html += `
                <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: 8px;">${date}</td>
                    <td style="padding: 8px;">${t.veiculoNome}</td>
                    <td style="padding: 8px;">${t.motorista}</td>
                    <td style="padding: 8px;">${t.origem} -> ${t.destino}</td>
                    <td style="padding: 8px; font-weight: bold;">${(t.kmRodado || 0).toFixed(1)} km</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        list.innerHTML = html;

        this.updatePaginationControls();
    },

    updatePaginationControls() {
        const total = this.historyTotal || 0;
        const maxPage = Math.ceil(total / this.itemsPerPage) - 1;

        const btnPrev = document.getElementById('btnHistoryPrev');
        const btnNext = document.getElementById('btnHistoryNext');
        const pageInfo = document.getElementById('historyPageInfo');

        if (btnPrev) {
            btnPrev.disabled = this.historyPage <= 0;
            btnPrev.style.opacity = this.historyPage <= 0 ? '0.5' : '1';
        }

        if (btnNext) {
            const isLastPage = this.historyPage >= maxPage;
            btnNext.disabled = isLastPage || total === 0;
            btnNext.style.opacity = (isLastPage || total === 0) ? '0.5' : '1';
        }

        if (pageInfo) {
            pageInfo.textContent = total > 0
                ? `Página ${this.historyPage + 1} de ${maxPage + 1}`
                : 'Página 0 de 0';
        }
    },

    async queueOfflineWrite(type, collection, data, docId = null) {
        const payload = {
            id: type === 'create' ? this.generateUUID() : docId,
            type,
            collection,
            data,
            retryCount: 0,
            nextRetry: 0
        };
        if (docId) payload.docId = docId;
        await App.offlineDB.add('offline-writes', payload);
    },

    generateUUID() {
        if (crypto?.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    async ingestRemoteTrips(activeTrips = [], historyTrips = []) {
        this.ensureRepository();
        await this.kmRepository.upsertFromRemote([...activeTrips, ...historyTrips]);
        if (document.querySelector('.tab-content.active')?.id === 'controleKM') {
            await this.loadActiveTrips();
            await this.loadHistoryPage();
        }
    },

    generateReport(type) {
        const inicio = document.getElementById('relatorioFrotaInicio').value;
        const fim = document.getElementById('relatorioFrotaFim').value;
        const veiculo = document.getElementById('relatorioFrotaVeiculo').value;
        const motorista = document.getElementById('relatorioFrotaMotorista').value;

        if (!inicio || !fim) {
            App.ui.showAlert("Selecione data de início e fim.", "warning");
            return;
        }

        const filters = {
            inicio,
            fim,
            veiculoId: veiculo,
            motorista,
            companyId: App.state.currentUser.companyId
        };

        // Use the shared report generation logic which handles auth and download
        const endpoint = type === 'pdf' ? 'frota/pdf' : 'frota/csv';
        const filename = `relatorio_frota_${inicio}_${fim}.${type === 'pdf' ? 'pdf' : 'csv'}`;

        App.reports._fetchAndDownloadReport(endpoint, filters, filename);
    }
};

export default FleetModule;
