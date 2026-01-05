// Import Firebase specific functions for pagination
import { getFirestore, collection, query, where, orderBy, limit, startAfter, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const FleetModule = {
    // --- State Management ---
    state: {
        activeTrips: [], // Real-time from listener
        history: [],     // Pagination loaded
        vehicles: [],    // Real-time from listener
        lastVisibleHistory: null, // For pagination cursor
        historyLimit: 10,
        isLoadingHistory: false,
        hasMoreHistory: true
    },

    init() {
        this.setupEventListeners();
        // Initial render checks are handled by the main App when tab shows
    },

    // --- Lifecycle Hooks ---
    onTabEnter(tabId) {
        if (tabId === 'gestaoFrota') {
            this.clearFleetForm();
            this.renderFleetList();
        } else if (tabId === 'controleKM') {
            this.state.history = [];
            this.state.lastVisibleHistory = null;
            this.state.hasMoreHistory = true;
            this.renderActiveTrips();
            this.loadHistory(); // Load first page
        }
    },

    onTabLeave() {
        this.clearFleetForm();
        this.clearKMForms();
    },

    // --- Event Listeners ---
    setupEventListeners() {
        // Fleet CRUD
        const btnSaveFrota = document.getElementById('btnSaveFrota');
        if (btnSaveFrota) {
            btnSaveFrota.addEventListener('click', () => this.saveVehicle());
        }

        // Trip Management UI
        const btnNovaSaidaKM = document.getElementById('btnNovaSaidaKM'); // FAB
        if (btnNovaSaidaKM) {
            btnNovaSaidaKM.addEventListener('click', () => this.openStartTripModal());
        }

        // Modal Actions
        document.getElementById('btnConfirmSaidaKM')?.addEventListener('click', () => this.startTrip());
        document.getElementById('btnCancelSaidaKM')?.addEventListener('click', () => this.closeModal('modalSaidaKM'));
        document.getElementById('btnCloseModalSaidaKM')?.addEventListener('click', () => this.closeModal('modalSaidaKM'));

        document.getElementById('btnConfirmChegadaKM')?.addEventListener('click', () => this.endTrip());
        document.getElementById('btnCancelChegadaKM')?.addEventListener('click', () => this.closeModal('modalChegadaKM'));
        document.getElementById('btnCloseModalChegadaKM')?.addEventListener('click', () => this.closeModal('modalChegadaKM'));

        // Toggle Abastecimento fields
        const checkAbasteceu = document.getElementById('kmChegadaAbasteceu');
        const divAbastecimento = document.getElementById('kmAbastecimentoFields');
        if (checkAbasteceu && divAbastecimento) {
            checkAbasteceu.addEventListener('change', (e) => {
                divAbastecimento.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        // Pagination
        const btnLoadMore = document.getElementById('btnLoadMoreHistory');
        if (btnLoadMore) {
            btnLoadMore.addEventListener('click', () => this.loadHistory());
        }

        // Reports
        document.getElementById('btnGenerateFleetReport')?.addEventListener('click', () => this.generateReport());
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
        this.clearKMForms(); // Clear inputs on close
    },

    // --- Data Logic: Pagination ---

    async loadHistory() {
        if (this.state.isLoadingHistory || !this.state.hasMoreHistory) return;

        this.state.isLoadingHistory = true;
        const btn = document.getElementById('btnLoadMoreHistory');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

        try {
            const db = getFirestore();
            const companyId = App.state.currentUser.companyId;
            const collectionRef = collection(db, 'controleFrota');

            let q = query(
                collectionRef,
                where("companyId", "==", companyId),
                where("status", "==", "FINALIZADO"),
                orderBy("dataChegada", "desc"),
                limit(this.state.historyLimit)
            );

            if (this.state.lastVisibleHistory) {
                q = query(q, startAfter(this.state.lastVisibleHistory));
            }

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                this.state.hasMoreHistory = false;
                if(btn) btn.style.display = 'none';
            } else {
                this.state.lastVisibleHistory = snapshot.docs[snapshot.docs.length - 1];
                const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.state.history = [...this.state.history, ...newItems];
                this.renderHistory();

                if (snapshot.docs.length < this.state.historyLimit) {
                    this.state.hasMoreHistory = false;
                    if(btn) btn.style.display = 'none';
                }
            }
        } catch (error) {
            console.error("Erro ao carregar histórico:", error);
            App.ui.showAlert("Erro ao carregar histórico.", "error");
        } finally {
            this.state.isLoadingHistory = false;
            if(btn && this.state.hasMoreHistory) btn.innerHTML = 'Carregar Mais';
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
        document.getElementById('frotaId').value = '';
        document.getElementById('frotaCodigo').value = '';
        document.getElementById('frotaPlaca').value = '';
        document.getElementById('frotaMarcaModelo').value = '';
        document.getElementById('frotaAno').value = '';
        document.getElementById('frotaKmAtual').value = '';
        document.getElementById('frotaStatus').value = 'ativo';
    },

    clearKMForms() {
        document.getElementById('kmSaidaVeiculo').value = '';
        document.getElementById('kmSaidaMotorista').value = '';
        document.getElementById('kmSaidaKmInicial').value = '';
        document.getElementById('kmSaidaOrigem').value = '';

        document.getElementById('kmChegadaTripId').value = '';
        document.getElementById('kmChegadaKmFinal').value = '';
        document.getElementById('kmChegadaDestino').value = '';
        document.getElementById('kmChegadaAbasteceu').checked = false;
        document.getElementById('kmAbastecimentoFields').style.display = 'none';
        document.getElementById('kmAbastecimentoLitros').value = '';
        document.getElementById('kmAbastecimentoValor').value = '';
    },

    renderFleetList() {
        const list = document.getElementById('frotaList');
        if (!list) return;

        const vehicles = App.state.frota || [];
        if (vehicles.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fas fa-bus"></i><p>Nenhum veículo cadastrado.</p></div>';
            return;
        }

        let html = '<div class="fleet-grid">';

        vehicles.sort((a,b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, {numeric: true})).forEach(v => {
            html += `
                <div class="fleet-card">
                    <div class="fleet-card-header">
                        <span class="fleet-code">${v.codigo}</span>
                        <span class="fleet-status ${v.status}">${v.status}</span>
                    </div>
                    <div class="fleet-card-body">
                        <h4>${v.placa}</h4>
                        <p>${v.marcaModelo || 'Modelo não inf.'}</p>
                        <p class="fleet-km"><i class="fas fa-tachometer-alt"></i> ${v.kmAtual} km</p>
                    </div>
                    <div class="fleet-card-actions">
                        <button onclick="App.fleet.editVehicle(App.state.frota.find(f => f.id === '${v.id}'))">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
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

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
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

        // 1. Optimistic UI Update (Immediate)
        const tempId = 'temp_' + Date.now();
        const optimisticTrip = { ...tripData, id: tempId };

        App.state.controleFrota = [optimisticTrip, ...App.state.controleFrota];
        this.renderActiveTrips();

        this.closeModal('modalSaidaKM');

        try {
            await App.data.addDocument('controleFrota', tripData);
            App.ui.showAlert("Saída registada!", "success");
        } catch (error) {
            console.error(error);
            App.ui.showAlert("Erro ao registar saída (Offline?). Será sincronizado.", "info");
        }
    },

    openEndTripModal(trip) {
        document.getElementById('kmChegadaTripId').value = trip.id;
        document.getElementById('kmChegadaVeiculoTexto').textContent = trip.veiculoNome;
        document.getElementById('kmChegadaKmFinal').value = '';
        document.getElementById('kmChegadaDestino').value = '';

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

        const tripIndex = App.state.controleFrota.findIndex(t => t.id === tripId);
        const trip = App.state.controleFrota[tripIndex];

        if (!trip) return;

        if (kmFinal < trip.kmInicial) {
            App.ui.showAlert("KM Final não pode ser menor que o Inicial.", "error");
            return;
        }

        const kmRodado = kmFinal - trip.kmInicial;
        const dataChegada = new Date().toISOString();

        // 1. Optimistic Update
        if (tripIndex > -1) {
            App.state.controleFrota.splice(tripIndex, 1);
            this.renderActiveTrips();
        }
        const finishedTrip = { ...trip, kmFinal, destino, kmRodado, dataChegada, status: 'FINALIZADO' };
        this.state.history.unshift(finishedTrip);
        this.renderHistory();

        this.closeModal('modalChegadaKM');

        try {
            // 2. Persistent Update
            await App.data.updateDocument('controleFrota', tripId, {
                kmFinal,
                destino,
                kmRodado,
                dataChegada,
                status: 'FINALIZADO'
            });

            await App.data.updateDocument('frota', trip.veiculoId, {
                kmAtual: kmFinal
            });

            if (abasteceu) {
                const litros = parseFloat(document.getElementById('kmAbastecimentoLitros').value);
                const valor = parseFloat(document.getElementById('kmAbastecimentoValor').value);
                const tipo = document.getElementById('kmAbastecimentoTipo').value;

                if (litros > 0) {
                    await App.data.addDocument('abastecimentos', {
                        tripId,
                        veiculoId: trip.veiculoId,
                        data: dataChegada,
                        km: kmFinal,
                        litros,
                        valor: valor || 0,
                        tipoCombustivel: tipo,
                        companyId: App.state.currentUser.companyId,
                        criadoPor: App.state.currentUser.email
                    });
                }
            }
            App.ui.showAlert(`Viagem finalizada!`, "success");

        } catch (error) {
            console.error(error);
            App.ui.showAlert("Salvo offline. Sincronizará quando online.", "info");
        }
    },

    renderActiveTrips() {
        const list = document.getElementById('kmActiveTripsList');
        if (!list) return;

        // Filter only active trips to avoid showing history here
        const trips = (App.state.controleFrota || []).filter(t => t.status === 'EM_DESLOCAMENTO');

        if (trips.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fas fa-road"></i><p>Nenhum veículo em deslocamento.</p></div>';
            return;
        }

        let html = '<div class="trip-list">';
        trips.forEach(t => {
            const date = new Date(t.dataSaida).toLocaleString('pt-BR');
            html += `
                <div class="trip-card active" onclick="App.fleet.openEndTripModal(App.state.controleFrota.find(x => x.id === '${t.id}'))">
                    <div class="trip-icon"><i class="fas fa-bus"></i></div>
                    <div class="trip-info">
                        <h4>${t.veiculoNome}</h4>
                        <p><i class="fas fa-user"></i> ${t.motorista}</p>
                        <p><i class="fas fa-map-marker-alt"></i> ${t.origem} <i class="fas fa-arrow-right"></i> ...</p>
                    </div>
                    <div class="trip-meta">
                        <span class="badge warning">EM TRÂNSITO</span>
                        <small>${date}</small>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    },

    renderHistory() {
        const list = document.getElementById('kmHistoryList');
        if (!list) return;

        const trips = this.state.history || [];

        if (trips.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--color-text-light);">Nenhum histórico carregado.</p>';
            return;
        }

        let html = '<div class="trip-list">';
        trips.forEach(t => {
            const date = new Date(t.dataChegada).toLocaleDateString('pt-BR');
            html += `
                <div class="trip-card history">
                    <div class="trip-info">
                        <h4>${t.veiculoNome}</h4>
                        <p class="route">${t.origem} <i class="fas fa-arrow-right"></i> ${t.destino}</p>
                        <p class="driver"><i class="fas fa-user"></i> ${t.motorista}</p>
                    </div>
                    <div class="trip-stats">
                        <span class="km-badge">${t.kmRodado.toFixed(1)} km</span>
                        <small>${date}</small>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        list.innerHTML = html;
    },

    async generateReport() {
        const start = document.getElementById('relFleetStart').value;
        const end = document.getElementById('relFleetEnd').value;
        const vehicleFilter = document.getElementById('relFleetVehicle').value; // Assuming select ID from UI plan

        if (!start || !end) {
            App.ui.showAlert("Selecione o período.", "warning");
            return;
        }

        App.ui.setLoading(true, "A gerar relatório...");

        try {
            // Fetch data for the period (can be large, but filtered)
            const db = getFirestore();
            const collectionRef = collection(db, 'controleFrota');
            const companyId = App.state.currentUser.companyId;

            // Simple date range query
            const q = query(
                collectionRef,
                where("companyId", "==", companyId),
                where("status", "==", "FINALIZADO"),
                where("dataChegada", ">=", new Date(start).toISOString()),
                where("dataChegada", "<=", new Date(end + "T23:59:59").toISOString())
            );

            const snapshot = await getDocs(q);
            let trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (vehicleFilter) {
                trips = trips.filter(t => t.veiculoId === vehicleFilter);
            }

            if (trips.length === 0) {
                App.ui.showAlert("Nenhum dado encontrado para o período.", "info");
                return;
            }

            // Metrics
            const totalTrips = trips.length;
            const totalKm = trips.reduce((sum, t) => sum + (t.kmRodado || 0), 0);

            // Generate PDF using jsPDF (assuming library is loaded globally as jspdf)
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            doc.setFontSize(18);
            doc.text("Relatório de Frota - Controle de KM", 14, 20);

            doc.setFontSize(12);
            doc.text(`Período: ${new Date(start).toLocaleDateString()} a ${new Date(end).toLocaleDateString()}`, 14, 30);
            doc.text(`Total de Viagens: ${totalTrips}`, 14, 40);
            doc.text(`KM Total Rodado: ${totalKm.toFixed(1)} km`, 14, 48);

            const tableData = trips.map(t => [
                new Date(t.dataSaida).toLocaleDateString(),
                t.veiculoNome,
                t.motorista,
                t.origem,
                t.destino,
                t.kmRodado.toFixed(1)
            ]);

            doc.autoTable({
                startY: 55,
                head: [['Data', 'Veículo', 'Motorista', 'Origem', 'Destino', 'KM']],
                body: tableData,
            });

            doc.save(`relatorio_frota_${start}_${end}.pdf`);
            App.ui.showAlert("Relatório gerado com sucesso!", "success");

        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            App.ui.showAlert("Erro ao gerar relatório.", "error");
        } finally {
            App.ui.setLoading(false);
        }
    }
};

export default FleetModule;
