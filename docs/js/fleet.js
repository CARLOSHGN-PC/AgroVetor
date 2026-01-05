const FleetModule = {
    historyPage: 0,
    itemsPerPage: 10,
    isInitialized: false,

    init() {
        if (this.isInitialized) return;
        this.setupEventListeners();
        this.isInitialized = true;
    },

    onShow() {
        // Reset forms and state when entering the module
        this.clearFleetForm();
        this.clearTripForm();
        this.historyPage = 0;

        // Refresh lists
        this.renderActiveTrips();
        this.renderHistory();
        this.updatePaginationControls();
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
        const trips = App.state.historyTrips || [];
        const total = trips.length;
        const maxPage = Math.ceil(total / this.itemsPerPage) - 1;
        const newPage = this.historyPage + delta;

        if (newPage >= 0 && newPage <= maxPage) {
            this.historyPage = newPage;
            this.renderHistory();
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
        const fields = ['kmSaidaVeiculo', 'kmSaidaMotorista', 'kmSaidaKmInicial', 'kmSaidaOrigem', 'kmChegadaKmFinal', 'kmChegadaDestino'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });

        // Also reset local state helpers if any
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

    openStartTripModal() {
        const select = document.getElementById('kmSaidaVeiculo');
        select.innerHTML = '<option value="">Selecione...</option>';

        const activeVehicles = (App.state.frota || []).filter(v => v.status === 'ativo');
        activeVehicles.sort((a,b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, {numeric: true})).forEach(v => {
            select.innerHTML += `<option value="${v.id}" data-km="${v.kmAtual}">${v.codigo} - ${v.placa} (${v.marcaModelo})</option>`;
        });

        select.onchange = () => {
            const opt = select.options[select.selectedIndex];
            if (opt.value) {
                document.getElementById('kmSaidaKmInicial').value = opt.dataset.km;
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
        const motorista = document.getElementById('kmSaidaMotorista').value;
        const kmInicial = parseFloat(document.getElementById('kmSaidaKmInicial').value);
        const origem = document.getElementById('kmSaidaOrigem').value;
        const dataHoraInput = document.getElementById('kmSaidaDataHora').value;

        if (!veiculoId || !motorista || isNaN(kmInicial) || !origem || !dataHoraInput) {
            App.ui.showAlert("Preencha todos os campos.", "warning");
            return;
        }

        const vehicle = App.state.frota.find(v => v.id === veiculoId);

        const tripData = {
            veiculoId,
            veiculoNome: vehicle ? `${vehicle.codigo} - ${vehicle.placa}` : 'Desconhecido',
            motorista,
            kmInicial,
            origem,
            dataSaida: new Date(dataHoraInput).toISOString(),
            status: 'EM_DESLOCAMENTO',
            companyId: App.state.currentUser.companyId,
            criadoPor: App.state.currentUser.email
        };

        App.ui.setLoading(true, "A registar saída...");
        try {
            await App.data.addDocument('controleFrota', tripData);
            document.getElementById('modalSaidaKM').classList.remove('show');
            App.ui.showAlert("Saída registada com sucesso!");

            // UI Update is handled by listener on 'activeTrips'
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
        const trip = App.state.activeTrips.find(t => t.id === tripId);
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
            await App.data.updateDocument('controleFrota', tripId, {
                kmFinal,
                destino,
                kmRodado,
                dataChegada: new Date().toISOString(),
                status: 'FINALIZADO'
            });

            // 2. Update Vehicle Current KM
            await App.data.updateDocument('frota', trip.veiculoId, {
                kmAtual: kmFinal
            });

            // 3. Save Abastecimento (if any)
            if (abasteceu) {
                const litros = parseFloat(document.getElementById('kmAbastecimentoLitros').value);
                const valor = parseFloat(document.getElementById('kmAbastecimentoValor').value);
                const tipo = document.getElementById('kmAbastecimentoTipo').value;

                if (litros > 0) {
                    await App.data.addDocument('abastecimentos', {
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

        } catch (error) {
            console.error(error);
            App.ui.showAlert("Erro ao finalizar viagem.", "error");
        } finally {
            App.ui.setLoading(false);
        }
    },

    renderActiveTrips() {
        const list = document.getElementById('kmActiveTripsList');
        if (!list) return;

        // Use the segregated state
        const trips = App.state.activeTrips || [];

        if (trips.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--color-text-light);">Nenhum veículo em deslocamento.</p>';
            return;
        }

        let html = '';
        trips.forEach(t => {
            const date = new Date(t.dataSaida).toLocaleString('pt-BR');
            html += `
                <div class="card" style="padding: 15px; margin-bottom: 10px; border-left-color: var(--color-warning); cursor: pointer;"
                     onclick="App.fleet.openEndTripModal(App.state.activeTrips.find(x => x.id === '${t.id}'))">
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

    renderHistory() {
        const list = document.getElementById('kmHistoryList');
        if (!list) return;

        const trips = App.state.historyTrips || [];

        // Ensure trips are sorted descending by arrival date
        trips.sort((a,b) => new Date(b.dataChegada) - new Date(a.dataChegada));

        if (trips.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--color-text-light);">Nenhum histórico recente.</p>';
            this.updatePaginationControls(); // Disable buttons
            return;
        }

        const start = this.historyPage * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageTrips = trips.slice(start, end);

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

        pageTrips.forEach(t => {
            const date = new Date(t.dataChegada).toLocaleDateString('pt-BR');
            html += `
                <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: 8px;">${date}</td>
                    <td style="padding: 8px;">${t.veiculoNome}</td>
                    <td style="padding: 8px;">${t.motorista}</td>
                    <td style="padding: 8px;">${t.origem} -> ${t.destino}</td>
                    <td style="padding: 8px; font-weight: bold;">${t.kmRodado.toFixed(1)} km</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        list.innerHTML = html;

        this.updatePaginationControls();
    },

    updatePaginationControls() {
        const total = (App.state.historyTrips || []).length;
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
