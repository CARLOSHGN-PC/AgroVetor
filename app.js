// FIREBASE: Importe os módulos necessários do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, getDocs, enableIndexedDbPersistence, deleteField } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = {
        apiKey: "AIzaSyBFXgXKDIBo9JD9vuGik5VDYZFDb_tbCrY",
        authDomain: "agrovetor-v2.firebaseapp.com",
        projectId: "agrovetor-v2",
        storageBucket: "agrovetor-v2.appspot.com",
        messagingSenderId: "782518751171",
        appId: "1:782518751171:web:d226a3f819f7a7593c617b"
    };

    const App = {
        // --- PROPRIEDADES ---
        db: null,
        auth: null,
        elements: {},
        state: {
            currentUser: null,
            activeTab: null,
            fazendas: [],
            lancamentosBroca: [],
            lancamentosPerda: [],
            usuarios: [],
            planosInspecao: [],
            planosColheita: [],
            pessoas: [],
            activeCharts: {},
            editingHarvestPlan: null,
            editingHarvestPlanId: null,
            isOffline: false,
            deferredInstallPrompt: null,
            companyConfig: {},
            isDragging: false,
            draggedElement: null,
            draggedGroupId: null,
            adminActionCallback: null
        },
        
        // --- INICIALIZAÇÃO ---
        init() {
            try {
                const firebaseApp = initializeApp(firebaseConfig);
                this.db = getFirestore(firebaseApp);
                this.auth = getAuth(firebaseApp);

                enableIndexedDbPersistence(this.db)
                    .catch((err) => {
                        if (err.code == 'failed-precondition') {
                            console.warn("Persistência não pôde ser habilitada, múltiplas abas abertas.");
                        } else if (err.code == 'unimplemented') {
                            console.warn("O browser atual não suporta persistência offline.");
                        }
                    });

                this.cacheElements();
                this.bindEvents();
                this.auth.handleAuthStateChange();
                this.pwa.registerServiceWorker();

            } catch (error) {
                console.error("Erro ao inicializar o Firebase:", error);
                this.ui.showAlert('Falha crítica ao inicializar a aplicação. Verifique a consola.', 'error');
            }
        },

        // --- CACHE DE ELEMENTOS ---
        cacheElements() {
            this.elements.loginScreen = document.getElementById('loginScreen');
            this.elements.appScreen = document.getElementById('appScreen');
            this.elements.content = document.getElementById('content');
            this.elements.menu = document.getElementById('menu');
            this.elements.btnToggleMenu = document.getElementById('btnToggleMenu');
            this.elements.alertContainer = document.getElementById('alertContainer');
            this.elements.loadingOverlay = document.getElementById('loading-overlay');
            
            this.elements.loginForm = document.getElementById('loginForm');
            this.elements.loginUser = document.getElementById('loginUser');
            this.elements.loginPass = document.getElementById('loginPass');
            this.elements.btnLogin = document.getElementById('btnLogin');
            this.elements.loginMessage = document.getElementById('loginMessage');
            this.elements.offlineUserSelection = document.getElementById('offlineUserSelection');
            this.elements.offlineUserList = document.getElementById('offlineUserList');
            this.elements.userMenuContainer = document.getElementById('user-menu-container');
            this.elements.userMenuToggle = document.getElementById('user-menu-toggle');
            this.elements.userMenuDropdown = document.getElementById('user-menu-dropdown');
            this.elements.userMenuUsername = document.getElementById('userMenuUsername');
            this.elements.currentDateTime = document.getElementById('currentDateTime');
            this.elements.logoutBtn = document.getElementById('logoutBtn');
            this.elements.installAppBtn = document.getElementById('installAppBtn');
            this.elements.changePasswordBtn = document.getElementById('changePasswordBtn');
            
            this.elements.themeButtons = document.querySelectorAll('.theme-button');
            
            // [NOVO] Dashboard
            this.elements.dashboardSelector = document.getElementById('dashboard-selector');
            this.elements.dashboardBroca = document.getElementById('dashboard-broca');
            this.elements.dashboardPerda = document.getElementById('dashboard-perda');
            this.elements.dashboardAerea = document.getElementById('dashboard-aerea');
            this.elements.cardBroca = document.getElementById('card-broca');
            this.elements.cardPerda = document.getElementById('card-perda');
            this.elements.cardAerea = document.getElementById('card-aerea');
            this.elements.btnBackToSelectorBroca = document.getElementById('btn-back-to-selector-broca');
            this.elements.btnBackToSelectorPerda = document.getElementById('btn-back-to-selector-perda');
            this.elements.btnBackToSelectorAerea = document.getElementById('btn-back-to-selector-aerea');

            this.elements.formBroca = {
                form: document.getElementById('formBrocamento'),
                codigo: document.getElementById('codigo'),
                data: document.getElementById('data'),
                talhao: document.getElementById('talhao'),
                varietyDisplay: document.getElementById('varietyDisplay'),
                entrenos: document.getElementById('entrenos'),
                brocaBase: document.getElementById('brocaBase'),
                brocaMeio: document.getElementById('brocaMeio'),
                brocaTopo: document.getElementById('brocaTopo'),
                brocado: document.getElementById('brocado'),
                resultado: document.getElementById('resultado'),
                btnSalvar: document.getElementById('btnSalvarBrocamento')
            };

            this.elements.formPerda = {
                form: document.getElementById('formPerda'),
                dataPerda: document.getElementById('dataPerda'),
                codigoPerda: document.getElementById('codigoPerda'),
                talhaoPerda: document.getElementById('talhaoPerda'),
                varietyDisplayPerda: document.getElementById('varietyDisplayPerda'),
                frenteServico: document.getElementById('frenteServico'),
                turno: document.getElementById('turno'),
                frotaEquipamento: document.getElementById('frotaEquipamento'),
                matriculaOperador: document.getElementById('matriculaOperador'),
                operadorNome: document.getElementById('operadorNome'),
                canaInteira: document.getElementById('canaInteira'),
                tolete: document.getElementById('tolete'),
                toco: document.getElementById('toco'),
                ponta: document.getElementById('ponta'),
                estilhaco: document.getElementById('estilhaco'),
                pedaco: document.getElementById('pedaco'),
                resultadoPerda: document.getElementById('resultadoPerda'),
                btnSalvarPerda: document.getElementById('btnSalvarPerda')
            };
            
            this.elements.fazendaFiltroBrocamento = document.getElementById('fazendaFiltroBrocamento');
            this.elements.inicioBrocamento = document.getElementById('inicioBrocamento');
            this.elements.fimBrocamento = document.getElementById('fimBrocamento');
            this.elements.btnPDFBrocamento = document.getElementById('btnPDFBrocamento');
            this.elements.btnExcelBrocamento = document.getElementById('btnExcelBrocamento');
            this.elements.tipoRelatorioBroca = document.getElementById('tipoRelatorioBroca');

            this.elements.fazendaFiltroPerda = document.getElementById('fazendaFiltroPerda');
            this.elements.talhaoFiltroPerda = document.getElementById('talhaoFiltroPerda');
            this.elements.operadorFiltroPerda = document.getElementById('operadorFiltroPerda');
            this.elements.frenteFiltroPerda = document.getElementById('frenteFiltroPerda');
            this.elements.inicioPerda = document.getElementById('inicioPerda');
            this.elements.fimPerda = document.getElementById('fimPerda');
            this.elements.btnPDFPerda = document.getElementById('btnPDFPerda');
            this.elements.btnExcelPerda = document.getElementById('btnExcelPerda');
            this.elements.tipoRelatorioPerda = document.getElementById('tipoRelatorioPerda');
            
            this.elements.listaExclusao = document.getElementById('listaExclusao');
            
            this.elements.cadastros = {
                csvUploadArea: document.getElementById('csvUploadArea'),
                csvFileInput: document.getElementById('csvFileInput'),
                btnDownloadCsvTemplate: document.getElementById('btnDownloadCsvTemplate'),
                farmCode: document.getElementById('farmCode'),
                farmName: document.getElementById('farmName'),
                btnSaveFarm: document.getElementById('btnSaveFarm'),
                farmSelect: document.getElementById('farmSelect'),
                talhaoManagementContainer: document.getElementById('talhaoManagementContainer'),
                selectedFarmName: document.getElementById('selectedFarmName'),
                talhaoList: document.getElementById('talhaoList'),
                talhaoId: document.getElementById('talhaoId'),
                talhaoName: document.getElementById('talhaoName'),
                talhaoArea: document.getElementById('talhaoArea'),
                talhaoProducao: document.getElementById('talhaoProducao'),
                talhaoVariedade: document.getElementById('talhaoVariedade'),
                talhaoCorte: document.getElementById('talhaoCorte'),
                talhaoDistancia: document.getElementById('talhaoDistancia'),
                talhaoUltimaColheita: document.getElementById('talhaoUltimaColheita'),
                btnSaveTalhao: document.getElementById('btnSaveTalhao'),
            };

            this.elements.planejamento = {
                form: document.getElementById('formPlanejamentoInspecao'),
                tipo: document.getElementById('planoTipo'),
                fazenda: document.getElementById('planoFazenda'),
                talhao: document.getElementById('planoTalhao'),
                data: document.getElementById('planoData'),
                responsavel: document.getElementById('planoResponsavel'),
                meta: document.getElementById('planoMeta'),
                obs: document.getElementById('planoObs'),
                btnAgendar: document.getElementById('btnAgendarInspecao'),
                lista: document.getElementById('listaPlanejamento'),
            };

            this.elements.planejamentoColheita = {
                plansListContainer: document.getElementById('harvest-plans-list-container'),
                plansList: document.getElementById('harvest-plans-list'),
                editor: document.getElementById('harvest-plan-editor'),
                btnAddNew: document.getElementById('btnAddNewHarvestPlan'),
                frontName: document.getElementById('harvestFrontName'),
                startDate: document.getElementById('harvestStartDate'),
                dailyRate: document.getElementById('harvestDailyRate'),
                addOrEditTitle: document.getElementById('addOrEditSequenceTitle'),
                editingGroupId: document.getElementById('editingGroupId'),
                fazendaSelect: document.getElementById('harvestFazenda'),
                atrInput: document.getElementById('harvestAtr'),
                maturadorInput: document.getElementById('harvestMaturador'),
                maturadorDate: document.getElementById('harvestMaturadorDate'),
                talhaoSelectionContainer: document.getElementById('harvestTalhaoSelectionContainer'),
                talhaoSelectionList: document.getElementById('harvestTalhaoSelectionList'),
                btnAddOrUpdate: document.getElementById('btnAddOrUpdateHarvestSequence'),
                btnCancelEdit: document.getElementById('btnCancelEditSequence'),
                tableBody: document.querySelector('#harvestPlanTable tbody'),
                summary: document.getElementById('harvestSummary'),
                btnSavePlan: document.getElementById('btnSaveHarvestPlan'),
                btnCancelPlan: document.getElementById('btnCancelHarvestPlan'),
                btnOptimize: document.getElementById('btnOptimizeHarvest')
            };

            this.elements.relatorioColheitaCustom = {
                planoSelect: document.getElementById('planoRelatorioSelect'),
                optionsContainer: document.getElementById('reportOptionsContainer'),
                btnPDF: document.getElementById('btnGerarRelatorioCustomPDF'),
                btnExcel: document.getElementById('btnGerarRelatorioCustomExcel')
            };

            this.elements.gerenciarUsuarios = {
                form: document.getElementById('formCreateUser'),
                newUserUsername: document.getElementById('newUserUsername'),
                newUserPassword: document.getElementById('newUserPassword'),
                newUserRole: document.getElementById('newUserRole'),
                permissionCheckboxes: document.querySelectorAll('#gerenciarUsuarios .permission-grid input[type="checkbox"]'),
                btnCreateUser: document.getElementById('btnCreateUser'),
                usersList: document.getElementById('usersList'),
            };

            this.elements.cadastrarPessoas = {
                form: document.getElementById('formPersonnel'),
                csvUploadArea: document.getElementById('personnelCsvUploadArea'),
                csvInput: document.getElementById('personnelCsvInput'),
                btnDownloadTemplate: document.getElementById('btnDownloadPersonnelCsvTemplate'),
                personnelId: document.getElementById('personnelId'),
                matricula: document.getElementById('personnelMatricula'),
                name: document.getElementById('personnelName'),
                btnSave: document.getElementById('btnSavePersonnel'),
                list: document.getElementById('personnelList'),
            };
            
            this.elements.configuracoesEmpresa = {
                logoUploadArea: document.getElementById('logoUploadArea'),
                logoInput: document.getElementById('logoInput'),
                logoPreview: document.getElementById('logoPreview'),
                removeLogoBtn: document.getElementById('removeLogoBtn'),
            };

            this.elements.modals = {
                userEdit: {
                    overlay: document.getElementById('userEditModal'),
                    title: document.getElementById('userEditModalTitle'),
                    closeBtn: document.getElementById('userEditModalCloseBtn'),
                    userId: document.getElementById('editingUserId'),
                    username: document.getElementById('editUserUsername'),
                    role: document.getElementById('editUserRole'),
                    permissionGrid: document.getElementById('editUserPermissionGrid'),
                    btnSave: document.getElementById('btnSaveUserChanges'),
                    btnResetPass: document.getElementById('btnResetPassword'),
                    btnDelete: document.getElementById('btnDeleteUser'),
                },
                confirmation: {
                    overlay: document.getElementById('confirmationModal'),
                    title: document.getElementById('confirmationModalTitle'),
                    message: document.getElementById('confirmationModalMessage'),
                    confirmBtn: document.getElementById('confirmationModalConfirmBtn'),
                    cancelBtn: document.getElementById('confirmationModalCancelBtn'),
                    closeBtn: document.getElementById('confirmationModalCloseBtn'),
                },
                changePassword: {
                    overlay: document.getElementById('changePasswordModal'),
                    closeBtn: document.getElementById('changePasswordModalCloseBtn'),
                    currentPassword: document.getElementById('currentPassword'),
                    newPassword: document.getElementById('newPassword'),
                    confirmNewPassword: document.getElementById('confirmNewPassword'),
                    saveBtn: document.getElementById('changePasswordModalSaveBtn'),
                    cancelBtn: document.getElementById('changePasswordModalCancelBtn'),
                },
                adminPassword: {
                    overlay: document.getElementById('adminPasswordConfirmModal'),
                    closeBtn: document.getElementById('adminPasswordConfirmModalCloseBtn'),
                    passwordInput: document.getElementById('adminConfirmPassword'),
                    confirmBtn: document.getElementById('adminPasswordConfirmModalConfirmBtn'),
                    cancelBtn: document.getElementById('adminPasswordConfirmModalCancelBtn'),
                },
                chart: {
                     overlay: document.getElementById('chartModal'),
                     title: document.getElementById('chartModalTitle'),
                     closeBtn: document.getElementById('chartModalCloseBtn'),
                     container: document.getElementById('expandedChartContainer'),
                     canvas: document.getElementById('expandedChartCanvas')
                }
            };
        },

        // --- EVENTOS ---
        bindEvents() {
            this.elements.btnLogin.addEventListener('click', () => this.auth.login());
            this.elements.loginPass.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.auth.login(); });
            this.elements.logoutBtn.addEventListener('click', () => this.auth.logout());
            this.elements.btnToggleMenu.addEventListener('click', () => this.ui.toggleMenu());
            
            document.addEventListener('click', (e) => {
                if (this.elements.menu.classList.contains('open') && !this.elements.menu.contains(e.target) && !this.elements.btnToggleMenu.contains(e.target)) {
                    this.ui.closeMenu();
                }
                if (this.elements.userMenuContainer && !this.elements.userMenuContainer.contains(e.target)) {
                    this.ui.closeUserMenu();
                }
            });

            if (this.elements.userMenuToggle) this.elements.userMenuToggle.addEventListener('click', () => this.ui.toggleUserMenu());
            if (this.elements.installAppBtn) this.elements.installAppBtn.addEventListener('click', () => this.pwa.install());
            if(this.elements.changePasswordBtn) this.elements.changePasswordBtn.addEventListener('click', () => this.ui.modals.show('changePassword'));

            this.elements.themeButtons.forEach(button => {
                button.addEventListener('click', (e) => this.ui.setTheme(e.target.id));
            });
            
            this.dashboard.bindEvents();
            this.forms.bindAll();
            this.relatorios.bindAll();
        },

        // --- LÓGICA DE DADOS (DB) ---
        db_ops: {
            async fetchCollection(collectionName, stateKey, callback) {
                try {
                    const q = query(collection(App.db, collectionName));
                    onSnapshot(q, (querySnapshot) => {
                        const dataList = [];
                        querySnapshot.forEach((doc) => {
                            dataList.push({ id: doc.id, ...doc.data() });
                        });
                        App.state[stateKey] = dataList;
                        if (callback) callback(dataList);
                    }, (error) => {
                        console.error(`Erro ao buscar ${collectionName}: `, error);
                        App.ui.showAlert(`Falha ao carregar ${collectionName}.`, 'error');
                    });
                } catch (error) {
                    console.error(`Exceção em fetchCollection para ${collectionName}: `, error);
                }
            },
            
            fetchFazendas() {
                this.fetchCollection('fazendas', 'fazendas', (data) => {
                    App.ui.populateSelect(App.elements.formBroca.codigo, data, 'id', 'nome');
                    App.ui.populateSelect(App.elements.formPerda.codigoPerda, data, 'id', 'nome');
                    App.ui.populateSelect(App.elements.fazendaFiltroBrocamento, data, 'id', 'nome', 'Todas');
                    App.ui.populateSelect(App.elements.fazendaFiltroPerda, data, 'id', 'nome', 'Todas');
                    App.ui.populateSelect(App.elements.cadastros.farmSelect, data, 'id', 'nome', 'Selecione uma fazenda...');
                    App.ui.populateSelect(App.elements.planejamento.fazenda, data, 'id', 'nome', 'Selecione...');
                    App.ui.populateSelect(App.elements.planejamentoColheita.fazendaSelect, data, 'id', 'nome', 'Selecione...');
                });
            },
            
            fetchPessoas() {
                 this.fetchCollection('pessoas', 'pessoas', (data) => {
                    App.ui.populateSelect(App.elements.operadorFiltroPerda, data, 'matricula', 'nome', 'Todos');
                    App.ui.populateSelect(App.elements.planejamento.responsavel, data, 'matricula', 'nome', 'Selecione...');
                    App.ui.renderPersonnelList(data);
                 });
            },

            fetchLancamentosBroca() {
                this.fetchCollection('lancamentos_broca', 'lancamentosBroca', (data) => {
                    if (App.state.activeTab === 'dashboard') App.dashboard.renderCharts('broca');
                    if (App.state.activeTab === 'excluirDados') App.ui.renderExclusionList();
                });
            },

            fetchLancamentosPerda() {
                this.fetchCollection('lancamentos_perda', 'lancamentosPerda', (data) => {
                    if (App.state.activeTab === 'dashboard') App.dashboard.renderCharts('perda');
                    if (App.state.activeTab === 'excluirDados') App.ui.renderExclusionList();
                });
            },
            
            fetchUsuarios() {
                 this.fetchCollection('usuarios', 'usuarios', (data) => {
                    App.ui.renderUsersList(data);
                 });
            },
            
            fetchPlanosInspecao() {
                this.fetchCollection('planos_inspecao', 'planosInspecao', (data) => {
                    App.ui.renderPlanosInspecao(data);
                });
            },
            
            fetchPlanosColheita() {
                this.fetchCollection('planos_colheita', 'planosColheita', (data) => {
                    App.ui.renderHarvestPlansList(data);
                    App.ui.populateSelect(App.elements.relatorioColheitaCustom.planoSelect, data, 'id', 'nome', 'Selecione...');
                });
            },

            async fetchCompanyConfig() {
                const configRef = doc(App.db, 'configuracoes', 'empresa');
                try {
                    const docSnap = await getDoc(configRef);
                    if (docSnap.exists()) {
                        App.state.companyConfig = docSnap.data();
                        App.ui.renderCompanyConfig();
                    }
                } catch (error) {
                    console.error("Erro ao buscar configurações da empresa:", error);
                }
            },
        },
        
        // --- AUTENTICAÇÃO ---
        auth: {
            handleAuthStateChange() {
                onAuthStateChanged(App.auth, user => {
                    if (user && user.email) {
                        this.handleAuthenticatedUser(user);
                    } else {
                        this.handleUnauthenticatedUser();
                    }
                });
            },

            async handleAuthenticatedUser(user) {
                App.ui.showLoading(true, "A carregar dados...");
                const userDocRef = doc(App.db, "usuarios", user.uid);
                try {
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        App.state.currentUser = { uid: user.uid, email: user.email, ...userDoc.data() };
                        App.state.isOffline = false;
                        await this.fetchAllInitialData();
                        App.ui.showApp();
                        App.ui.renderMenu();
                        App.ui.updateUserInfo();
                        App.ui.setTheme(App.state.currentUser.theme || 'theme-green');
                        App.ui.showFirstAvailableTab();
                    } else {
                        console.error("Documento do utilizador não encontrado no Firestore.");
                        this.logout();
                    }
                } catch (error) {
                    console.error("Erro ao buscar dados do utilizador:", error);
                    this.logout();
                } finally {
                    App.ui.showLoading(false);
                }
            },
            
            handleUnauthenticatedUser() {
                 App.state.currentUser = null;
                 App.ui.showLogin();
            },

            async fetchAllInitialData() {
                const promises = [
                    App.db_ops.fetchFazendas(),
                    App.db_ops.fetchPessoas(),
                    App.db_ops.fetchLancamentosBroca(),
                    App.db_ops.fetchLancamentosPerda(),
                    App.db_ops.fetchPlanosInspecao(),
                    App.db_ops.fetchPlanosColheita(),
                    App.db_ops.fetchCompanyConfig()
                ];
                if (App.auth_guards.isAdmin()) {
                    promises.push(App.db_ops.fetchUsuarios());
                }
                await Promise.all(promises);
            },
            
            async login() {
                const email = App.elements.loginUser.value.trim();
                const password = App.elements.loginPass.value;
                App.elements.loginMessage.textContent = '';
                if (!email || !password) {
                    App.elements.loginMessage.textContent = 'Por favor, preencha o email e a senha.';
                    return;
                }
                App.ui.showLoading(true, "A autenticar...");
                try {
                    await signInWithEmailAndPassword(App.auth, email, password);
                } catch (error) {
                    App.elements.loginMessage.textContent = App.helpers.getFirebaseAuthErrorMessage(error);
                    App.ui.showLoading(false);
                }
            },

            logout() {
                signOut(App.auth).catch(error => console.error("Erro ao fazer logout:", error));
            },
        },
        
        // --- DASHBOARD ---
        dashboard: {
            bindEvents() {
                App.elements.cardBroca.addEventListener('click', () => this.show('broca'));
                App.elements.cardPerda.addEventListener('click', () => this.show('perda'));
                App.elements.cardAerea.addEventListener('click', () => this.show('aerea'));

                App.elements.btnBackToSelectorBroca.addEventListener('click', () => this.show('selector'));
                App.elements.btnBackToSelectorPerda.addEventListener('click', () => this.show('selector'));
                App.elements.btnBackToSelectorAerea.addEventListener('click', () => this.show('selector'));
            },

            show(dashboardName) {
                App.elements.dashboardSelector.style.display = 'none';
                App.elements.dashboardBroca.style.display = 'none';
                App.elements.dashboardPerda.style.display = 'none';
                App.elements.dashboardAerea.style.display = 'none';

                switch (dashboardName) {
                    case 'selector':
                        App.elements.dashboardSelector.style.display = 'grid';
                        App.charts.destroyAll();
                        break;
                    case 'broca':
                        App.elements.dashboardBroca.style.display = 'block';
                        this.renderCharts('broca');
                        break;
                    case 'perda':
                        App.elements.dashboardPerda.style.display = 'block';
                        this.renderCharts('perda');
                        break;
                    case 'aerea':
                        App.elements.dashboardAerea.style.display = 'block';
                        App.charts.destroyAll();
                        break;
                }
            },
            
            renderCharts(type) {
                if (type === 'broca') {
                    App.charts.renderBrocaDashboardCharts();
                } else if (type === 'perda') {
                    App.charts.renderPerdaDashboardCharts();
                }
            }
        },

        // --- INTERFACE (UI) ---
        ui: {
            showTab(tabId) {
                if (!App.auth_guards.canView(tabId)) {
                    this.showAlert("Não tem permissão para aceder a esta secção.", 'warning');
                    return;
                }
                
                document.querySelectorAll('.tab-content').forEach(tab => tab.hidden = true);
                
                const tabToShow = document.getElementById(tabId);
                if (tabToShow) {
                    tabToShow.hidden = false;
                    App.state.activeTab = tabId;

                    document.querySelectorAll('.menu-btn').forEach(btn => {
                        btn.classList.remove('active');
                        if (btn.dataset.tab === tabId) btn.classList.add('active');
                    });
                    
                    switch (tabId) {
                        case 'dashboard':
                           App.dashboard.show('broca');
                           break;
                        case 'excluirDados':
                           this.renderExclusionList();
                           break;
                        case 'planejamentoColheita':
                           App.forms.planejamentoColheita.resetView();
                           break;
                        case 'cadastros':
                            App.forms.cadastros.resetTalhaoView();
                            break;
                        default:
                            App.charts.destroyAll();
                            break;
                    }
                } else {
                    console.warn(`Aba com ID "${tabId}" não encontrada.`);
                }
                this.closeMenu();
            },

            showFirstAvailableTab() {
                const permissions = App.state.currentUser.permissions || {};
                const menuOrder = ['dashboard', 'planejamentoColheita', 'planejamento', 'lancamentoBroca', 'lancamentoPerda', 'relatorioColheitaCustom', 'relatorioBroca', 'relatorioPerda', 'excluirDados', 'gerenciarUsuarios', 'cadastrarPessoas', 'configuracoesEmpresa', 'cadastros'];
                const firstTab = menuOrder.find(tab => permissions[tab]);
                
                if (firstTab) {
                    this.showTab(firstTab);
                } else {
                    this.showTab('dashboard'); 
                    this.showAlert("Não tem permissão para visualizar nenhuma secção.", "error");
                }
            },
            
            showApp() {
                this.elements.loginScreen.style.display = 'none';
                this.elements.appScreen.style.display = 'flex';
                this.elements.userMenuContainer.style.display = 'block';
            },
            
            showLogin() {
                this.elements.loginScreen.style.display = 'flex';
                this.elements.appScreen.style.display = 'none';
                this.elements.userMenuContainer.style.display = 'none';
                this.closeMenu();
                this.closeUserMenu();
            },

            toggleMenu() {
                this.elements.btnToggleMenu.classList.toggle('open');
                this.elements.menu.classList.toggle('open');
                const isOpen = this.elements.menu.classList.contains('open');
                document.querySelector('main.content').style.filter = isOpen ? 'blur(4px) brightness(0.7)' : '';
                document.querySelector('header').style.filter = isOpen ? 'blur(4px) brightness(0.7)' : '';
            },

            closeMenu() {
                this.elements.btnToggleMenu.classList.remove('open');
                this.elements.menu.classList.remove('open');
                document.querySelector('main.content').style.filter = '';
                document.querySelector('header').style.filter = '';
            },

            toggleUserMenu() {
                this.elements.userMenuToggle.classList.toggle('open');
                this.elements.userMenuDropdown.classList.toggle('show');
            },

            closeUserMenu() {
                this.elements.userMenuToggle.classList.remove('open');
                this.elements.userMenuDropdown.classList.remove('show');
            },

            updateUserInfo() {
                if (App.state.currentUser) {
                    this.elements.userMenuUsername.textContent = App.state.currentUser.email;
                    this.updateDateTime();
                    setInterval(() => this.updateDateTime(), 1000 * 60);
                }
            },

            updateDateTime() {
                const now = new Date();
                const date = now.toLocaleDateString('pt-BR');
                const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                this.elements.currentDateTime.innerHTML = `<i class="fas fa-calendar-alt"></i> ${date} <i class="fas fa-clock" style="margin-left: 10px;"></i> ${time}`;
            },
            
            setTheme(themeId) {
                if (!themeId) return;
                document.body.className = '';
                document.body.classList.add(themeId.replace('theme-', 'theme-'));
                localStorage.setItem('agrovetor_theme', themeId);
                this.elements.themeButtons.forEach(btn => btn.classList.remove('active'));
                const activeBtn = document.getElementById(themeId);
                if (activeBtn) activeBtn.classList.add('active');

                if (App.state.currentUser && App.state.currentUser.theme !== themeId) {
                    const userRef = doc(App.db, 'usuarios', App.state.currentUser.uid);
                    updateDoc(userRef, { theme: themeId }).catch(e => console.error("Erro ao salvar tema:", e));
                }
            },

            renderMenu() {
                const permissions = App.state.currentUser.permissions || {};
                const menuItems = [
                    { id: 'dashboard', icon: 'fa-tachometer-alt', text: 'Dashboard' },
                    { id: 'planejamentoColheita', icon: 'fa-stream', text: 'Plan. Colheita' },
                    { id: 'planejamento', icon: 'fa-calendar-alt', text: 'Plan. Inspeção' },
                    { id: 'lancamentoBroca', icon: 'fa-bug', text: 'Lançar Broca' },
                    { id: 'lancamentoPerda', icon: 'fa-dollar-sign', text: 'Lançar Perda' },
                    { id: 'relatorioColheitaCustom', icon: 'fa-file-invoice', text: 'Relatório Colheita' },
                    { id: 'relatorioBroca', icon: 'fa-chart-bar', text: 'Relatório Broca' },
                    { id: 'relatorioPerda', icon: 'fa-chart-pie', text: 'Relatório Perda' },
                    { id: 'excluirDados', icon: 'fa-trash', text: 'Excluir Lançamentos' },
                    { id: 'gerenciarUsuarios', icon: 'fa-users-cog', text: 'Gerir Utilizadores' },
                    { id: 'cadastrarPessoas', icon: 'fa-id-card', text: 'Cadastrar Pessoas' },
                    { id: 'configuracoesEmpresa', icon: 'fa-building', text: 'Config. Empresa' },
                    { id: 'cadastros', icon: 'fa-book', text: 'Cadastros Fazendas' }
                ];

                this.elements.menu.innerHTML = menuItems
                    .filter(item => permissions[item.id])
                    .map(item => `<button class="menu-btn" data-tab="${item.id}"><i class="fas ${item.icon}"></i> ${item.text}</button>`).join('');

                this.elements.menu.querySelectorAll('.menu-btn').forEach(btn => {
                    btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
                });
            },
            
            populateSelect(selectElement, data, valueKey, textKey, defaultOptionText = '') {
                if (!selectElement) return;
                const currentValue = selectElement.value;
                selectElement.innerHTML = ''; 
                if (defaultOptionText) {
                    const defaultOption = document.createElement('option');
                    defaultOption.value = '';
                    defaultOption.textContent = defaultOptionText;
                    selectElement.appendChild(defaultOption);
                }
                data.sort((a,b) => a[textKey].localeCompare(b[textKey])).forEach(item => {
                    const option = document.createElement('option');
                    option.value = item[valueKey];
                    option.textContent = item[textKey];
                    selectElement.appendChild(option);
                });
                selectElement.value = currentValue;
            },

            showAlert(message, type = 'success', duration = 4000) {
                this.elements.alertContainer.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
                this.elements.alertContainer.className = `show ${type}`;
                setTimeout(() => {
                    this.elements.alertContainer.className = '';
                }, duration);
            },
            
            showLoading(show, text = 'A processar...') {
                if (show) {
                    document.getElementById('loading-progress-text').textContent = text;
                    this.elements.loadingOverlay.style.display = 'flex';
                } else {
                    this.elements.loadingOverlay.style.display = 'none';
                }
            },
            
            renderExclusionList() {
                const container = App.elements.listaExclusao;
                container.innerHTML = '';
            
                const combinedList = [
                    ...App.state.lancamentosBroca.map(item => ({...item, type: 'Broca', typeId: 'lancamentos_broca'})),
                    ...App.state.lancamentosPerda.map(item => ({...item, type: 'Perda', typeId: 'lancamentos_perda'}))
                ];
            
                combinedList.sort((a, b) => new Date(b.data) - new Date(a.data));
            
                if (combinedList.length === 0) {
                    container.innerHTML = '<p>Nenhum lançamento encontrado.</p>';
                    return;
                }
            
                combinedList.forEach(item => {
                    const fazendaNome = App.helpers.getFazendaNome(item.codigo) || `Código: ${item.codigo}`;
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'exclusion-item';
                    itemDiv.innerHTML = `
                        <div class="item-info">
                            <span class="item-type ${item.type.toLowerCase()}">${item.type}</span>
                            <span class="item-date">${new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            <span class="item-farm"><strong>Fazenda:</strong> ${fazendaNome}</span>
                            <span class="item-plot"><strong>Talhão:</strong> ${item.talhao}</span>
                            <span class="item-result"><strong>Resultado:</strong> ${item.resultado}</span>
                        </div>
                        <button class="btn-danger-outline btn-delete-entry"><i class="fas fa-trash-alt"></i> Excluir</button>
                    `;
            
                    itemDiv.querySelector('.btn-delete-entry').addEventListener('click', () => {
                        App.ui.modals.showConfirmation(
                            'Confirmar Exclusão',
                            `Tem a certeza de que deseja excluir este lançamento de ${item.type}? Esta ação não pode ser desfeita.`,
                            async () => {
                                try {
                                    await deleteDoc(doc(App.db, item.typeId, item.id));
                                    App.ui.showAlert('Lançamento excluído com sucesso!', 'success');
                                } catch (error) {
                                    console.error("Erro ao excluir lançamento:", error);
                                    App.ui.showAlert('Erro ao excluir o lançamento.', 'error');
                                }
                            }
                        );
                    });
            
                    container.appendChild(itemDiv);
                });
            },
            
            renderUsersList(users) {
                const list = App.elements.gerenciarUsuarios.usersList;
                list.innerHTML = '';
                if (!users) return;
            
                users.sort((a, b) => a.email.localeCompare(b.email)).forEach(user => {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user-item';
                    userDiv.innerHTML = `
                        <div class="user-info">
                            <span class="user-email"><i class="fas fa-envelope"></i> ${user.email}</span>
                            <span class="user-role"><i class="fas fa-user-tag"></i> ${user.role || 'N/D'}</span>
                        </div>
                        <div class="user-actions">
                            <button class="btn-secondary btn-edit-user"><i class="fas fa-edit"></i> Editar</button>
                        </div>
                    `;
                    userDiv.querySelector('.btn-edit-user').addEventListener('click', () => App.forms.gerenciarUsuarios.editUser(user));
                    list.appendChild(userDiv);
                });
            },

            renderPersonnelList(people) {
                const list = App.elements.cadastrarPessoas.list;
                list.innerHTML = '';
                if (!people) return;
            
                people.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(person => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'person-item';
                    itemDiv.innerHTML = `
                        <div class="person-info">
                            <span class="person-name"><i class="fas fa-user"></i> ${person.nome}</span>
                            <span class="person-id"><i class="fas fa-id-badge"></i> Matrícula: ${person.matricula}</span>
                        </div>
                        <div class="person-actions">
                            <button class="btn-secondary btn-edit-person"><i class="fas fa-edit"></i></button>
                            <button class="btn-danger-outline btn-delete-person"><i class="fas fa-trash"></i></button>
                        </div>
                    `;
                    itemDiv.querySelector('.btn-edit-person').addEventListener('click', () => App.forms.cadastrarPessoas.edit(person));
                    itemDiv.querySelector('.btn-delete-person').addEventListener('click', () => App.forms.cadastrarPessoas.delete(person.id));
                    list.appendChild(itemDiv);
                });
            },

            renderPlanosInspecao(planos) {
                const container = App.elements.planejamento.lista;
                container.innerHTML = '';
            
                planos.sort((a, b) => new Date(a.data) - new Date(b.data));
            
                if (planos.length === 0) {
                    container.innerHTML = '<p>Nenhum plano de inspeção agendado.</p>';
                    return;
                }
            
                planos.forEach(plano => {
                    const fazendaNome = App.helpers.getFazendaNome(plano.fazenda) || 'N/D';
                    const responsavelNome = App.helpers.getPersonNameByMatricula(plano.responsavel) || 'N/D';
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'plan-item';
                    itemDiv.innerHTML = `
                        <div class="plan-header">
                            <span class="plan-type ${plano.tipo.toLowerCase()}">${plano.tipo}</span>
                            <span class="plan-date"><i class="fas fa-calendar-day"></i> ${new Date(plano.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div class="plan-body">
                            <p><strong>Fazenda:</strong> ${fazendaNome}</p>
                            <p><strong>Talhão:</strong> ${plano.talhao}</p>
                            <p><strong>Responsável:</strong> ${responsavelNome}</p>
                            <p><strong>Meta:</strong> ${plano.meta}</p>
                            ${plano.obs ? `<p class="plan-obs"><strong>Obs:</strong> ${plano.obs}</p>` : ''}
                        </div>
                        <div class="plan-actions">
                             <button class="btn-danger-outline btn-delete-plan"><i class="fas fa-trash-alt"></i> Excluir</button>
                        </div>
                    `;
            
                    itemDiv.querySelector('.btn-delete-plan').addEventListener('click', () => {
                        App.ui.modals.showConfirmation(
                            'Confirmar Exclusão',
                            `Tem a certeza de que deseja excluir este plano de inspeção?`,
                            async () => {
                                try {
                                    await deleteDoc(doc(App.db, 'planos_inspecao', plano.id));
                                    App.ui.showAlert('Plano excluído com sucesso!', 'success');
                                } catch (error) {
                                    console.error("Erro ao excluir plano:", error);
                                    App.ui.showAlert('Erro ao excluir o plano.', 'error');
                                }
                            }
                        );
                    });
            
                    container.appendChild(itemDiv);
                });
            },
            
            renderHarvestPlansList(plans) {
                const list = App.elements.planejamentoColheita.plansList;
                list.innerHTML = '';
                if (!plans) return;

                plans.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(plan => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'harvest-plan-list-item';
                    itemDiv.innerHTML = `
                        <div class="plan-list-info">
                            <span class="plan-list-name"><i class="fas fa-stream"></i> ${plan.nome}</span>
                            <span class="plan-list-date">Início: ${new Date(plan.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div class="plan-list-actions">
                            <button class="btn-secondary btn-edit-plan"><i class="fas fa-edit"></i> Editar</button>
                            <button class="btn-danger-outline btn-delete-plan"><i class="fas fa-trash"></i> Excluir</button>
                        </div>
                    `;
                    itemDiv.querySelector('.btn-edit-plan').addEventListener('click', () => App.forms.planejamentoColheita.showEditor(plan.id));
                    itemDiv.querySelector('.btn-delete-plan').addEventListener('click', () => {
                        App.ui.modals.showConfirmation(
                            'Confirmar Exclusão',
                            `Tem a certeza de que deseja excluir o plano de colheita "${plan.nome}"? Esta ação não pode ser desfeita.`,
                            async () => {
                                try {
                                    await deleteDoc(doc(App.db, 'planos_colheita', plan.id));
                                    App.ui.showAlert('Plano de colheita excluído com sucesso!', 'success');
                                } catch (error) {
                                    console.error("Erro ao excluir plano de colheita:", error);
                                    App.ui.showAlert('Erro ao excluir plano.', 'error');
                                }
                            }
                        );
                    });
                    list.appendChild(itemDiv);
                });
            },

            renderCompanyConfig() {
                const logoUrl = App.state.companyConfig.logoUrl;
                if (logoUrl) {
                    App.elements.configuracoesEmpresa.logoPreview.src = logoUrl;
                    App.elements.configuracoesEmpresa.logoPreview.style.display = 'block';
                    App.elements.configuracoesEmpresa.removeLogoBtn.style.display = 'inline-block';
                } else {
                    App.elements.configuracoesEmpresa.logoPreview.style.display = 'none';
                    App.elements.configuracoesEmpresa.removeLogoBtn.style.display = 'none';
                }
            },
            
            modals: {
                 show(modalName) { App.elements.modals[modalName].overlay.classList.add('show'); },
                 hide(modalName) { App.elements.modals[modalName].overlay.classList.remove('show'); },
                 getAll() { return Object.values(App.elements.modals).map(m => m.overlay); },
                 hideAll() { this.getAll().forEach(m => { if(m) m.classList.remove('show'); }); },
                 showConfirmation(title, message, onConfirm) {
                    const modal = App.elements.modals.confirmation;
                    modal.title.textContent = title;
                    modal.message.textContent = message;
                    
                    const newConfirmBtn = modal.confirmBtn.cloneNode(true);
                    modal.confirmBtn.parentNode.replaceChild(newConfirmBtn, modal.confirmBtn);
                    modal.confirmBtn = newConfirmBtn;
                    
                    modal.confirmBtn.onclick = () => {
                        onConfirm();
                        this.hide('confirmation');
                    };
                    
                    this.show('confirmation');
                 },
                 showAdminPasswordConfirmation(callback) {
                    App.state.adminActionCallback = callback;
                    this.show('adminPassword');
                 }
            }
        },
        
        // --- GRÁFICOS ---
        charts: {
            createChart(canvasId, type, data, options = {}) {
                this.destroyChart(canvasId);
                const ctx = document.getElementById(canvasId);
                if (ctx) {
                    const defaultOptions = {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top' },
                            title: { display: false }
                        }
                    };
                    const chart = new Chart(ctx, { type, data, options: { ...defaultOptions, ...options } });
                    App.state.activeCharts[canvasId] = chart;
                    return chart;
                }
            },

            destroyChart(canvasId) {
                if (App.state.activeCharts[canvasId]) {
                    App.state.activeCharts[canvasId].destroy();
                    delete App.state.activeCharts[canvasId];
                }
            },
            
            destroyAll() {
                 Object.keys(App.state.activeCharts).forEach(id => this.destroyChart(id));
            },

            renderBrocaDashboardCharts() {
                this.destroyAll();
                if(App.state.lancamentosBroca.length > 0) {
                    this.renderTop10FazendasBroca();
                    this.renderBrocaMensal();
                    this.renderBrocaPosicao();
                    this.renderAreaAvaliadaBroca();
                }
            },

            renderPerdaDashboardCharts() {
                this.destroyAll();
                 if(App.state.lancamentosPerda.length > 0) {
                    this.renderTop10FazendasPerda();
                    this.renderPerdaPorTipoDetalhado();
                    this.renderPerdaMensal();
                    this.renderAreaAvaliadaPerda();
                }
            },

            renderTop10FazendasBroca() {
                const fazendasMap = new Map();
                App.state.lancamentosBroca.forEach(item => {
                    const fazendaNome = App.helpers.getFazendaNome(item.codigo) || `Cód: ${item.codigo}`;
                    if (!fazendasMap.has(fazendaNome)) {
                        fazendasMap.set(fazendaNome, { totalEntrenos: 0, totalBrocadoPonderado: 0 });
                    }
                    const fazenda = fazendasMap.get(fazendaNome);
                    fazenda.totalEntrenos += Number(item.entrenos);
                    fazenda.totalBrocadoPonderado += (Number(item.brocaBase) * 1) + (Number(item.brocaMeio) * 2) + (Number(item.brocaTopo) * 3);
                });

                const fazendasArray = Array.from(fazendasMap.entries()).map(([nome, data]) => {
                    const indice = data.totalEntrenos > 0 ? (data.totalBrocadoPonderado / (data.totalEntrenos * 3)) * 100 : 0;
                    return { nome, indice };
                });

                fazendasArray.sort((a, b) => b.indice - a.indice);
                const top10 = fazendasArray.slice(0, 10).reverse();

                this.createChart('graficoTop10FazendasBroca', 'bar', {
                    labels: top10.map(f => f.nome),
                    datasets: [{
                        label: 'Índice de Broca Ponderado (%)',
                        data: top10.map(f => f.indice.toFixed(2)),
                        backgroundColor: 'rgba(211, 47, 47, 0.6)',
                        borderColor: 'rgba(211, 47, 47, 1)',
                        borderWidth: 1
                    }]
                }, { indexAxis: 'y' });
            },

            renderBrocaMensal() {
                const dataByMonth = {};
                App.state.lancamentosBroca.forEach(item => {
                    if (!item.data) return;
                    const date = new Date(item.data + 'T00:00:00');
                    const month = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
                    if (!dataByMonth[month]) {
                        dataByMonth[month] = { totalIndicePonderado: 0, totalEntrenos: 0, date: date };
                    }
                    const brocadoPonderado = (Number(item.brocaBase) * 1) + (Number(item.brocaMeio) * 2) + (Number(item.brocaTopo) * 3);
                    dataByMonth[month].totalIndicePonderado += brocadoPonderado;
                    dataByMonth[month].totalEntrenos += (Number(item.entrenos) * 3);
                });

                const sortedMonths = Object.keys(dataByMonth).sort((a,b) => dataByMonth[a].date - dataByMonth[b].date);
                const labels = sortedMonths;
                const data = sortedMonths.map(month => {
                    const monthData = dataByMonth[month];
                    return monthData.totalEntrenos > 0 ? ((monthData.totalIndicePonderado / monthData.totalEntrenos) * 100).toFixed(2) : 0;
                });

                this.createChart('graficoBrocaMensal', 'line', {
                    labels,
                    datasets: [{
                        label: 'Índice Ponderado Mensal (%)',
                        data,
                        fill: true,
                        borderColor: 'rgba(211, 47, 47, 1)',
                        backgroundColor: 'rgba(211, 47, 47, 0.2)',
                        tension: 0.4
                    }]
                });
            },

            renderBrocaPosicao() {
                const totalBase = App.state.lancamentosBroca.reduce((sum, item) => sum + Number(item.brocaBase), 0);
                const totalMeio = App.state.lancamentosBroca.reduce((sum, item) => sum + Number(item.brocaMeio), 0);
                const totalTopo = App.state.lancamentosBroca.reduce((sum, item) => sum + Number(item.brocaTopo), 0);
                
                this.createChart('graficoBrocaPosicao', 'doughnut', {
                    labels: ['Base', 'Meio', 'Topo'],
                    datasets: [{
                        label: 'Posição da Broca (Nº de Insetos)',
                        data: [totalBase, totalMeio, totalTopo],
                        backgroundColor: ['#d32f2f', '#c62828', '#b71c1c']
                    }]
                });
            },

            renderAreaAvaliadaBroca() {
                 const talhoesAvaliados = new Map();
                 App.state.lancamentosBroca.forEach(l => {
                     const key = `${l.codigo}-${l.talhao.toUpperCase().trim()}`;
                     talhoesAvaliados.set(key, { fazendaId: l.codigo, talhaoNome: l.talhao.toUpperCase().trim() });
                 });
                 
                 let areaTotal = 0;
                 for (const talhaoInfo of talhoesAvaliados.values()) {
                     const fazendaData = App.state.fazendas.find(f => f.id === talhaoInfo.fazendaId);
                     if (fazendaData && fazendaData.talhoes) {
                         const talhaoData = fazendaData.talhoes.find(t => t.nome.toUpperCase().trim() === talhaoInfo.talhaoNome);
                         if(talhaoData && talhaoData.area) areaTotal += Number(talhaoData.area);
                     }
                 }
                 this.createChart('graficoAreaAvaliadaBroca', 'bar', {
                     labels: [''],
                     datasets: [{
                         label: 'Área Inspecionada (ha)',
                         data: [areaTotal.toFixed(2)],
                         backgroundColor: 'rgba(211, 47, 47, 0.6)',
                         maxBarThickness: 100
                     }]
                 });
            },

            renderTop10FazendasPerda() {
                 const fazendasMap = new Map();
                 App.state.lancamentosPerda.forEach(item => {
                     const fazendaNome = App.helpers.getFazendaNome(item.codigo) || `Cód: ${item.codigo}`;
                     if (!fazendasMap.has(fazendaNome)) fazendasMap.set(fazendaNome, { totalPerda: 0, count: 0 });
                     const fazenda = fazendasMap.get(fazendaNome);
                     fazenda.totalPerda += parseFloat(item.resultado.replace('kg','').replace(',','.'));
                     fazenda.count++;
                 });
                 
                 const fazendasArray = Array.from(fazendasMap.entries()).map(([nome, data]) => ({ nome, media: data.count > 0 ? data.totalPerda / data.count : 0 }));
                 fazendasArray.sort((a, b) => b.media - a.media);
                 const top10 = fazendasArray.slice(0, 10).reverse();

                 this.createChart('graficoTop10FazendasPerda', 'bar', {
                     labels: top10.map(f => f.nome),
                     datasets: [{
                         label: 'Perda Média (kg)',
                         data: top10.map(f => f.media.toFixed(2)),
                         backgroundColor: 'rgba(245, 124, 0, 0.6)',
                         borderColor: 'rgba(245, 124, 0, 1)',
                         borderWidth: 1
                     }]
                 }, { indexAxis: 'y' });
            },

            renderPerdaPorTipoDetalhado() {
                const totais = { canaInteira: 0, tolete: 0, toco: 0, ponta: 0, estilhaco: 0, pedaco: 0 };
                App.state.lancamentosPerda.forEach(item => {
                    for (const tipo in totais) totais[tipo] += Number(item[tipo] || 0);
                });
                this.createChart('graficoPerdaPorTipoDetalhado', 'doughnut', {
                    labels: ['Cana Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço'],
                    datasets: [{
                        label: 'Composição da Perda (Amostras)',
                        data: Object.values(totais),
                        backgroundColor: ['#f57c00', '#fb8c00', '#ff9800', '#ffa726', '#ffb74d', '#ffcc80']
                    }]
                });
            },
            
            renderPerdaMensal() {
                 const dataByMonth = {};
                 App.state.lancamentosPerda.forEach(item => {
                    if (!item.data) return;
                    const date = new Date(item.data + 'T00:00:00');
                    const month = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
                    if (!dataByMonth[month]) dataByMonth[month] = { totalPerda: 0, count: 0, date: date };
                    dataByMonth[month].totalPerda += parseFloat(item.resultado.replace('kg','').replace(',','.'));
                    dataByMonth[month].count++;
                });
                const sortedMonths = Object.keys(dataByMonth).sort((a,b) => dataByMonth[a].date - dataByMonth[b].date);
                const labels = sortedMonths;
                const data = sortedMonths.map(month => (dataByMonth[month].totalPerda / dataByMonth[month].count).toFixed(2));
                this.createChart('graficoPerdaMensal', 'line', {
                    labels,
                    datasets: [{
                        label: 'Perda Média Mensal (kg)',
                        data,
                        fill: true,
                        borderColor: 'rgba(245, 124, 0, 1)',
                        backgroundColor: 'rgba(245, 124, 0, 0.2)',
                        tension: 0.4
                    }]
                });
            },

            renderAreaAvaliadaPerda() {
                 const talhoesAvaliados = new Map();
                 App.state.lancamentosPerda.forEach(l => {
                     const key = `${l.codigo}-${l.talhao.toUpperCase().trim()}`;
                     talhoesAvaliados.set(key, { fazendaId: l.codigo, talhaoNome: l.talhao.toUpperCase().trim() });
                 });
                 let areaTotal = 0;
                 for (const talhaoInfo of talhoesAvaliados.values()) {
                     const fazendaData = App.state.fazendas.find(f => f.id === talhaoInfo.fazendaId);
                     if (fazendaData && fazendaData.talhoes) {
                         const talhaoData = fazendaData.talhoes.find(t => t.nome.toUpperCase().trim() === talhaoInfo.talhaoNome);
                         if (talhaoData && talhaoData.area) areaTotal += Number(talhaoData.area);
                     }
                 }
                 this.createChart('graficoAreaAvaliadaPerda', 'bar', {
                     labels: [''],
                     datasets: [{
                         label: 'Área com Aferição (ha)',
                         data: [areaTotal.toFixed(2)],
                         backgroundColor: 'rgba(245, 124, 0, 0.6)',
                         maxBarThickness: 100
                     }]
                 });
            }
        },
        
        forms: {
            bindAll() {
                this.broca.bindEvents();
                this.perda.bindEvents();
                this.cadastros.bindEvents();
                this.planejamento.bindEvents();
                this.planejamentoColheita.bindEvents();
                this.gerenciarUsuarios.bindEvents();
                this.cadastrarPessoas.bindEvents();
                this.configuracoesEmpresa.bindEvents();
                this.modals.bindEvents();
            },
            broca: {
                bindEvents() {
                    const form = App.elements.formBroca;
                    form.btnSalvar.addEventListener('click', () => this.salvar());
                    ['entrenos', 'brocaBase', 'brocaMeio', 'brocaTopo'].forEach(id => {
                        form[id].addEventListener('input', () => this.calcularTotalBrocado());
                    });
                     form.codigo.addEventListener('change', () => {
                        const fazendaId = App.elements.formBroca.codigo.value;
                        const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                        const talhoes = fazenda ? fazenda.talhoes.map(t => ({id: t.nome, nome: t.nome})) : [];
                        App.ui.populateSelect(App.elements.formBroca.talhao, talhoes, 'id', 'nome', 'Selecione...');
                        this.findVariety();
                     });
                     form.talhao.addEventListener('change', () => this.findVariety());
                },
                calcularTotalBrocado() {
                    const form = App.elements.formBroca;
                    const total = Number(form.brocaBase.value) + Number(form.brocaMeio.value) + Number(form.brocaTopo.value);
                    form.brocado.value = total;
                    this.calcularResultado();
                },
                calcularResultado() {
                    const form = App.elements.formBroca;
                    const entrenos = Number(form.entrenos.value);
                    const brocadoPonderado = (Number(form.brocaBase.value) * 1) + (Number(form.brocaMeio.value) * 2) + (Number(form.brocaTopo.value) * 3);
                    const totalEntrenosPontuacao = entrenos * 3;
                    if (totalEntrenosPontuacao > 0) {
                        const resultado = ((brocadoPonderado / totalEntrenosPontuacao) * 100).toFixed(2);
                        form.resultado.textContent = `Resultado: ${resultado.replace('.', ',')}%`;
                    } else {
                        form.resultado.textContent = 'Resultado: 0,00%';
                    }
                },
                async findVariety() {
                    const form = App.elements.formBroca;
                    const fazendaId = form.codigo.value;
                    const talhaoNome = form.talhao.value;
                    const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                    if (fazenda && fazenda.talhoes && talhaoNome) {
                        const talhao = fazenda.talhoes.find(t => t.nome === talhaoNome);
                        form.varietyDisplay.textContent = talhao ? `Variedade: ${talhao.variedade}` : 'Variedade: N/D';
                    } else {
                        form.varietyDisplay.textContent = 'Variedade: N/D';
                    }
                },
                async salvar() {
                    const form = App.elements.formBroca;
                    const data = {
                        codigo: form.codigo.value,
                        data: form.data.value,
                        talhao: form.talhao.value,
                        entrenos: form.entrenos.value,
                        brocaBase: form.brocaBase.value,
                        brocaMeio: form.brocaMeio.value,
                        brocaTopo: form.brocaTopo.value,
                        brocado: form.brocado.value,
                        resultado: form.resultado.textContent.replace('Resultado: ', ''),
                        timestamp: serverTimestamp(),
                        userId: App.state.currentUser.uid
                    };
                    if (!data.codigo || !data.data || !data.talhao || !data.entrenos) {
                        App.ui.showAlert('Preencha todos os campos obrigatórios.', 'error');
                        return;
                    }
                    try {
                        App.ui.showLoading(true);
                        await addDoc(collection(App.db, 'lancamentos_broca'), data);
                        App.ui.showAlert('Lançamento salvo com sucesso!', 'success');
                        this._resetForm();
                    } catch (error) {
                        console.error("Erro ao salvar lançamento de broca:", error);
                        App.ui.showAlert('Falha ao salvar. Tente novamente.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                _resetForm() {
                    App.elements.formBroca.form.reset();
                    App.elements.formBroca.resultado.textContent = 'Resultado: 0,00%';
                    App.elements.formBroca.varietyDisplay.textContent = 'Variedade: N/D';
                    App.ui.populateSelect(App.elements.formBroca.talhao, [], 'id', 'nome', 'Selecione a fazenda');
                }
            },
            perda: { 
                bindEvents() {
                    const form = App.elements.formPerda;
                    form.btnSalvarPerda.addEventListener('click', () => this.salvar());
                    ['canaInteira', 'tolete', 'toco', 'ponta', 'estilhaco', 'pedaco'].forEach(id => {
                        form[id].addEventListener('input', () => this.calcularResultado());
                    });
                    form.codigoPerda.addEventListener('change', () => {
                        const fazendaId = App.elements.formPerda.codigoPerda.value;
                        const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                        const talhoes = fazenda ? fazenda.talhoes.map(t => ({id: t.nome, nome: t.nome})) : [];
                        App.ui.populateSelect(App.elements.formPerda.talhaoPerda, talhoes, 'id', 'nome', 'Selecione...');
                        this.findVariety();
                    });
                    form.talhaoPerda.addEventListener('change', () => this.findVariety());
                    form.matriculaOperador.addEventListener('change', () => this.findOperatorName());
                    form.matriculaOperador.addEventListener('input', App.helpers.debounce(() => this.findOperatorName(), 500));
                },
                calcularResultado() {
                    const form = App.elements.formPerda;
                    const total = (
                        Number(form.canaInteira.value) + Number(form.tolete.value) + 
                        Number(form.toco.value) + Number(form.ponta.value) + 
                        Number(form.estilhaco.value) + Number(form.pedaco.value)
                    );
                    const resultado = (total * 10).toFixed(2);
                    form.resultadoPerda.textContent = `Resultado: ${resultado.replace('.',',')} kg`;
                },
                async findVariety() {
                    const form = App.elements.formPerda;
                    const fazendaId = form.codigoPerda.value;
                    const talhaoNome = form.talhaoPerda.value;
                    const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                    if (fazenda && fazenda.talhoes && talhaoNome) {
                        const talhao = fazenda.talhoes.find(t => t.nome === talhaoNome);
                        form.varietyDisplayPerda.textContent = talhao ? `Variedade: ${talhao.variedade}` : 'Variedade: N/D';
                    } else {
                        form.varietyDisplayPerda.textContent = 'Variedade: N/D';
                    }
                },
                async findOperatorName() {
                    const form = App.elements.formPerda;
                    const matricula = form.matriculaOperador.value;
                    const pessoa = App.state.pessoas.find(p => p.matricula === matricula);
                    form.operadorNome.textContent = pessoa ? `Nome: ${pessoa.nome}` : 'Nome: Operador não encontrado';
                },
                async salvar() {
                    const form = App.elements.formPerda;
                    const data = {
                        data: form.dataPerda.value,
                        codigo: form.codigoPerda.value,
                        talhao: form.talhaoPerda.value,
                        frenteServico: form.frenteServico.value,
                        turno: form.turno.value,
                        frotaEquipamento: form.frotaEquipamento.value,
                        matriculaOperador: form.matriculaOperador.value,
                        canaInteira: form.canaInteira.value,
                        tolete: form.tolete.value,
                        toco: form.toco.value,
                        ponta: form.ponta.value,
                        estilhaco: form.estilhaco.value,
                        pedaco: form.pedaco.value,
                        resultado: form.resultadoPerda.textContent.replace('Resultado: ', ''),
                        timestamp: serverTimestamp(),
                        userId: App.state.currentUser.uid
                    };
                    if (!data.data || !data.codigo || !data.talhao || !data.frenteServico || !data.matriculaOperador) {
                        App.ui.showAlert('Preencha todos os campos obrigatórios.', 'error');
                        return;
                    }
                    try {
                        App.ui.showLoading(true);
                        await addDoc(collection(App.db, 'lancamentos_perda'), data);
                        App.ui.showAlert('Lançamento salvo com sucesso!', 'success');
                        this._resetForm();
                    } catch (error) {
                        console.error("Erro ao salvar lançamento de perda:", error);
                        App.ui.showAlert('Falha ao salvar. Tente novamente.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                _resetForm() {
                    App.elements.formPerda.form.reset();
                    App.elements.formPerda.resultadoPerda.textContent = 'Resultado: 0,00 kg';
                    App.elements.formPerda.varietyDisplayPerda.textContent = 'Variedade: N/D';
                    App.elements.formPerda.operadorNome.textContent = 'Nome:';
                    App.ui.populateSelect(App.elements.formPerda.talhaoPerda, [], 'id', 'nome', 'Selecione a fazenda');
                }
            },
            cadastros: { 
                bindEvents() {
                    const elements = App.elements.cadastros;
                    elements.csvUploadArea.addEventListener('click', () => elements.csvFileInput.click());
                    elements.csvUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('dragover'); });
                    elements.csvUploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('dragover'); });
                    elements.csvUploadArea.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('dragover'); this.handleCsvUpload(e.dataTransfer.files[0]); });
                    elements.csvFileInput.addEventListener('change', (e) => this.handleCsvUpload(e.target.files[0]));
                    elements.btnDownloadCsvTemplate.addEventListener('click', () => this.downloadCsvTemplate());
                    elements.btnSaveFarm.addEventListener('click', () => this.saveFarm());
                    elements.farmSelect.addEventListener('change', (e) => this.loadTalhoesForFarm(e.target.value));
                    elements.btnSaveTalhao.addEventListener('click', () => this.saveTalhao());
                },
                downloadCsvTemplate() {
                    const header = "CodigoFazenda,NomeFazenda,CodigoTalhao,NomeTalhao,Area,ProducaoEstimada,Variedade,Ciclo,Distancia,DataUltimaColheita\n";
                    const example = "1001,Fazenda Exemplo,1,T-01,150.5,12000,RB966928,CANA PLANTA,25.5,2023-04-15\n";
                    const csvContent = "data:text/csv;charset=utf-8," + header + example;
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "template_fazendas_talhoes.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },
                handleCsvUpload(file) {
                    if (!file || !file.type.match('text/csv')) {
                        App.ui.showAlert('Por favor, selecione um ficheiro CSV.', 'error');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const csv = event.target.result;
                        const lines = csv.split('\n').filter(line => line.trim() !== '');
                        if (lines.length <= 1) {
                            App.ui.showAlert('Ficheiro CSV vazio ou inválido.', 'error');
                            return;
                        }
                        
                        App.ui.showLoading(true, 'A processar CSV...');
                        try {
                            const fazendasMap = new Map();
                            const headers = lines[0].trim().split(',').map(h => h.trim());
                            
                            const requiredHeaders = ['CodigoFazenda', 'NomeFazenda', 'CodigoTalhao', 'NomeTalhao', 'Area'];
                            if (!requiredHeaders.every(h => headers.includes(h))) {
                                throw new Error(`O cabeçalho do CSV deve conter: ${requiredHeaders.join(', ')}`);
                            }

                            for (let i = 1; i < lines.length; i++) {
                                const values = lines[i].trim().split(',');
                                const row = headers.reduce((obj, header, index) => {
                                    obj[header] = values[index];
                                    return obj;
                                }, {});

                                if (!fazendasMap.has(row.CodigoFazenda)) {
                                    fazendasMap.set(row.CodigoFazenda, {
                                        id: row.CodigoFazenda,
                                        nome: row.NomeFazenda,
                                        talhoes: []
                                    });
                                }
                                fazendasMap.get(row.CodigoFazenda).talhoes.push({
                                    id: row.CodigoTalhao,
                                    nome: row.NomeTalhao,
                                    area: parseFloat(row.Area) || 0,
                                    producao: parseFloat(row.ProducaoEstimada) || 0,
                                    variedade: row.Variedade || '',
                                    corte: row.Ciclo || '',
                                    distancia: parseFloat(row.Distancia) || 0,
                                    ultimaColheita: row.DataUltimaColheita || ''
                                });
                            }
                            
                            const batch = writeBatch(App.db);
                            for (const [id, fazendaData] of fazendasMap) {
                                const fazendaRef = doc(App.db, "fazendas", id);
                                batch.set(fazendaRef, { nome: fazendaData.nome, talhoes: fazendaData.talhoes });
                            }
                            await batch.commit();
                            App.ui.showAlert(`${fazendasMap.size} fazendas e seus talhões foram importados/atualizados com sucesso!`, 'success');
                        } catch (error) {
                            console.error("Erro ao processar CSV:", error);
                            App.ui.showAlert(`Erro ao processar CSV: ${error.message}`, 'error', 6000);
                        } finally {
                            App.ui.showLoading(false);
                            App.elements.cadastros.csvFileInput.value = '';
                        }
                    };
                    reader.readAsText(file);
                },
                async saveFarm() {
                    const id = App.elements.cadastros.farmCode.value;
                    const nome = App.elements.cadastros.farmName.value;
                    if (!id || !nome) {
                        App.ui.showAlert('Código e Nome da Fazenda são obrigatórios.', 'error');
                        return;
                    }
                    try {
                        App.ui.showLoading(true);
                        const fazendaRef = doc(App.db, "fazendas", id);
                        await setDoc(fazendaRef, { nome: nome }, { merge: true });
                        App.ui.showAlert('Fazenda salva com sucesso!', 'success');
                        document.getElementById('formSaveFarm').reset();
                    } catch (error) {
                        console.error("Erro ao salvar fazenda:", error);
                        App.ui.showAlert('Erro ao salvar fazenda.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                async loadTalhoesForFarm(farmId) {
                    if (!farmId) {
                        this.resetTalhaoView();
                        return;
                    }
                    const fazenda = App.state.fazendas.find(f => f.id === farmId);
                    if (fazenda) {
                        App.elements.cadastros.selectedFarmName.textContent = fazenda.nome;
                        App.elements.cadastros.talhaoManagementContainer.hidden = false;
                        this.renderTalhaoList(fazenda.talhoes || []);
                    } else {
                        this.resetTalhaoView();
                    }
                },
                renderTalhaoList(talhoes) {
                    const list = App.elements.cadastros.talhaoList;
                    list.innerHTML = '';
                    if (!talhoes || talhoes.length === 0) {
                        list.innerHTML = '<li>Nenhum talhão cadastrado para esta fazenda.</li>';
                        return;
                    }
                    talhoes.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(talhao => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <span>${talhao.nome} (${talhao.area || 0} ha)</span>
                            <div>
                                <button class="btn-secondary btn-sm btn-edit-talhao"><i class="fas fa-edit"></i></button>
                                <button class="btn-danger-outline btn-sm btn-delete-talhao"><i class="fas fa-trash"></i></button>
                            </div>
                        `;
                        li.querySelector('.btn-edit-talhao').addEventListener('click', () => this.editTalhao(talhao));
                        li.querySelector('.btn-delete-talhao').addEventListener('click', () => this.deleteTalhao(talhao.id));
                        list.appendChild(li);
                    });
                },
                editTalhao(talhao) {
                    const elements = App.elements.cadastros;
                    elements.talhaoId.value = talhao.id;
                    elements.talhaoName.value = talhao.nome;
                    elements.talhaoArea.value = talhao.area || '';
                    elements.talhaoProducao.value = talhao.producao || '';
                    elements.talhaoVariedade.value = talhao.variedade || '';
                    elements.talhaoCorte.value = talhao.corte || '';
                    elements.talhaoDistancia.value = talhao.distancia || '';
                    elements.talhaoUltimaColheita.value = talhao.ultimaColheita || '';
                    elements.talhaoName.focus();
                },
                async saveTalhao() {
                    const elements = App.elements.cadastros;
                    const farmId = elements.farmSelect.value;
                    const fazenda = App.state.fazendas.find(f => f.id === farmId);
                    if (!fazenda) return;

                    const newTalhao = {
                        id: elements.talhaoId.value || `T${Date.now()}`,
                        nome: elements.talhaoName.value,
                        area: parseFloat(elements.talhaoArea.value) || 0,
                        producao: parseFloat(elements.talhaoProducao.value) || 0,
                        variedade: elements.talhaoVariedade.value,
                        corte: elements.talhaoCorte.value,
                        distancia: parseFloat(elements.talhaoDistancia.value) || 0,
                        ultimaColheita: elements.talhaoUltimaColheita.value
                    };
                    
                    if (!newTalhao.nome || !newTalhao.area) {
                        App.ui.showAlert('Nome e Área do Talhão são obrigatórios.', 'error');
                        return;
                    }

                    const talhoes = fazenda.talhoes || [];
                    const existingIndex = talhoes.findIndex(t => t.id === newTalhao.id);
                    if (existingIndex > -1) {
                        talhoes[existingIndex] = newTalhao;
                    } else {
                        talhoes.push(newTalhao);
                    }

                    try {
                        App.ui.showLoading(true);
                        const fazendaRef = doc(App.db, "fazendas", farmId);
                        await updateDoc(fazendaRef, { talhoes: talhoes });
                        App.ui.showAlert('Talhão salvo com sucesso!', 'success');
                        document.getElementById('formSaveTalhao').reset();
                        elements.talhaoId.value = '';
                    } catch (error) {
                        console.error("Erro ao salvar talhão:", error);
                        App.ui.showAlert('Erro ao salvar talhão.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                async deleteTalhao(talhaoId) {
                    App.ui.modals.showConfirmation(
                        'Confirmar Exclusão',
                        `Tem a certeza de que deseja excluir este talhão?`,
                        async () => {
                            const farmId = App.elements.cadastros.farmSelect.value;
                            const fazenda = App.state.fazendas.find(f => f.id === farmId);
                            if (!fazenda || !fazenda.talhoes) return;

                            const updatedTalhoes = fazenda.talhoes.filter(t => t.id !== talhaoId);
                            try {
                                App.ui.showLoading(true);
                                const fazendaRef = doc(App.db, "fazendas", farmId);
                                await updateDoc(fazendaRef, { talhoes: updatedTalhoes });
                                App.ui.showAlert('Talhão excluído com sucesso!', 'success');
                            } catch (error) {
                                console.error("Erro ao excluir talhão:", error);
                                App.ui.showAlert('Erro ao excluir talhão.', 'error');
                            } finally {
                                App.ui.showLoading(false);
                            }
                        }
                    );
                },
                resetTalhaoView() {
                    const elements = App.elements.cadastros;
                    elements.talhaoManagementContainer.hidden = true;
                    elements.selectedFarmName.textContent = '';
                    elements.talhaoList.innerHTML = '';
                    document.getElementById('formSaveTalhao').reset();
                }
             },
            planejamento: { 
                bindEvents() {
                    App.elements.planejamento.btnAgendar.addEventListener('click', () => this.agendarInspecao());
                    App.elements.planejamento.fazenda.addEventListener('change', (e) => {
                        const fazendaId = e.target.value;
                        const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                        const talhoes = fazenda ? fazenda.talhoes.map(t => ({id: t.nome, nome: t.nome})) : [];
                        App.ui.populateSelect(App.elements.planejamento.talhao, talhoes, 'id', 'nome', 'Selecione...');
                    });
                },
                async agendarInspecao() {
                    const form = App.elements.planejamento;
                    const data = {
                        tipo: form.tipo.value,
                        fazenda: form.fazenda.value,
                        talhao: form.talhao.value,
                        data: form.data.value,
                        responsavel: form.responsavel.value,
                        meta: form.meta.value,
                        obs: form.obs.value,
                        timestamp: serverTimestamp(),
                        userId: App.state.currentUser.uid
                    };
            
                    if (!data.tipo || !data.fazenda || !data.talhao || !data.data || !data.responsavel) {
                        App.ui.showAlert('Preencha todos os campos obrigatórios.', 'error');
                        return;
                    }
            
                    try {
                        App.ui.showLoading(true);
                        await addDoc(collection(App.db, 'planos_inspecao'), data);
                        App.ui.showAlert('Inspeção agendada com sucesso!', 'success');
                        this.resetForm();
                    } catch (error) {
                        console.error("Erro ao agendar inspeção:", error);
                        App.ui.showAlert('Erro ao agendar inspeção.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                resetForm() {
                    App.elements.planejamento.form.reset();
                    App.ui.populateSelect(App.elements.planejamento.talhao, [], 'id', 'nome', 'Selecione a fazenda primeiro');
                }
            },
            planejamentoColheita: { 
                bindEvents() {
                    const elements = App.elements.planejamentoColheita;
                    elements.btnAddNew.addEventListener('click', () => this.showEditor());
                    elements.btnCancelPlan.addEventListener('click', () => this.resetView());
                    elements.btnSavePlan.addEventListener('click', () => this.savePlan());
                    elements.fazendaSelect.addEventListener('change', () => this.populateTalhaoSelection());
                    elements.btnAddOrUpdate.addEventListener('click', () => this.addOrUpdateSequenceGroup());
                    elements.btnCancelEdit.addEventListener('click', () => this.resetSequenceGroupForm());
                },
                resetView() {
                    const elements = App.elements.planejamentoColheita;
                    elements.plansListContainer.style.display = 'block';
                    elements.editor.style.display = 'none';
                    App.state.editingHarvestPlanId = null;
                    App.state.editingHarvestPlan = null;
                },
                showEditor(planId = null) {
                    const elements = App.elements.planejamentoColheita;
                    elements.plansListContainer.style.display = 'none';
                    elements.editor.style.display = 'block';
                    document.getElementById('harvest-plan-form').reset();
                    this.resetSequenceGroupForm();
                    elements.tableBody.innerHTML = '';
                    elements.summary.textContent = '';
            
                    if (planId) {
                        App.state.editingHarvestPlanId = planId;
                        App.state.editingHarvestPlan = JSON.parse(JSON.stringify(App.state.planosColheita.find(p => p.id === planId)));
                        if (App.state.editingHarvestPlan) {
                            elements.frontName.value = App.state.editingHarvestPlan.nome;
                            elements.startDate.value = App.state.editingHarvestPlan.dataInicio;
                            elements.dailyRate.value = App.state.editingHarvestPlan.taxaDiaria;
                            this.renderSequenceTable();
                        }
                    } else {
                        App.state.editingHarvestPlanId = null;
                        App.state.editingHarvestPlan = {
                            nome: '',
                            dataInicio: '',
                            taxaDiaria: '',
                            sequencia: []
                        };
                    }
                },
                populateTalhaoSelection() {
                    const elements = App.elements.planejamentoColheita;
                    const fazendaId = elements.fazendaSelect.value;
                    const list = elements.talhaoSelectionList;
                    list.innerHTML = '';
            
                    if (fazendaId) {
                        const fazenda = App.state.fazendas.find(f => f.id === fazendaId);
                        if (fazenda && fazenda.talhoes) {
                            fazenda.talhoes.forEach(talhao => {
                                const li = document.createElement('li');
                                const checkbox = document.createElement('input');
                                checkbox.type = 'checkbox';
                                checkbox.id = `talhao-${talhao.id}`;
                                checkbox.value = talhao.id;
                                checkbox.dataset.nome = talhao.nome;
                                checkbox.dataset.area = talhao.area;
                                checkbox.dataset.producao = talhao.producao;
                                checkbox.dataset.variedade = talhao.variedade;
                                checkbox.dataset.corte = talhao.corte;

                                const label = document.createElement('label');
                                label.htmlFor = `talhao-${talhao.id}`;
                                label.textContent = `${talhao.nome} (${talhao.area} ha)`;
                                
                                li.appendChild(checkbox);
                                li.appendChild(label);
                                list.appendChild(li);
                            });
                        }
                    }
                },
                addOrUpdateSequenceGroup() {
                    const elements = App.elements.planejamentoColheita;
                    const fazendaId = elements.fazendaSelect.value;
                    const fazendaNome = elements.fazendaSelect.options[elements.fazendaSelect.selectedIndex].text;
                    const selectedTalhoes = Array.from(elements.talhaoSelectionList.querySelectorAll('input:checked')).map(cb => {
                        return {
                            id: cb.value,
                            nome: cb.dataset.nome,
                            area: parseFloat(cb.dataset.area),
                            producao: parseFloat(cb.dataset.producao),
                            variedade: cb.dataset.variedade,
                            corte: cb.dataset.corte
                        };
                    });

                    if(!fazendaId || selectedTalhoes.length === 0) {
                        App.ui.showAlert('Selecione uma fazenda e pelo menos um talhão.', 'error');
                        return;
                    }

                    const groupData = {
                        id: elements.editingGroupId.value || `G${Date.now()}`,
                        fazendaId: fazendaId,
                        fazendaNome: fazendaNome,
                        talhoes: selectedTalhoes,
                        atr: elements.atrInput.value,
                        maturador: elements.maturadorInput.value,
                        dataAplicacaoMaturador: elements.maturadorDate.value
                    };
                    
                    const existingIndex = App.state.editingHarvestPlan.sequencia.findIndex(g => g.id === groupData.id);
                    if (existingIndex > -1) {
                        App.state.editingHarvestPlan.sequencia[existingIndex] = groupData;
                    } else {
                        App.state.editingHarvestPlan.sequencia.push(groupData);
                    }
                    this.renderSequenceTable();
                    this.resetSequenceGroupForm();
                },
                renderSequenceTable() {
                    const elements = App.elements.planejamentoColheita;
                    const tableBody = elements.tableBody;
                    tableBody.innerHTML = '';
                    if (!App.state.editingHarvestPlan) return;
            
                    App.state.editingHarvestPlan.sequencia.forEach((group, index) => {
                        const row = document.createElement('tr');
                        row.dataset.groupId = group.id;
                        row.draggable = true;
                        
                        const totalArea = group.talhoes.reduce((sum, t) => sum + t.area, 0).toFixed(2);
                        const totalProd = group.talhoes.reduce((sum, t) => sum + t.producao, 0).toFixed(2);
            
                        row.innerHTML = `
                            <td>${index + 1}</td>
                            <td>${group.fazendaNome}</td>
                            <td>${group.talhoes.map(t => t.nome).join(', ')}</td>
                            <td>${totalArea}</td>
                            <td>${totalProd}</td>
                            <td>
                                <button class="btn-secondary btn-sm btn-edit-seq"><i class="fas fa-edit"></i></button>
                                <button class="btn-danger-outline btn-sm btn-delete-seq"><i class="fas fa-trash"></i></button>
                            </td>
                        `;
                        row.querySelector('.btn-edit-seq').addEventListener('click', () => this.editSequenceGroup(group.id));
                        row.querySelector('.btn-delete-seq').addEventListener('click', () => this.deleteSequenceGroup(group.id));
                        tableBody.appendChild(row);
                    });
                    this.handleDragAndDrop();
                    this.calculateHarvestPlan();
                },
                editSequenceGroup(groupId) {
                    const group = App.state.editingHarvestPlan.sequencia.find(g => g.id === groupId);
                    if (group) {
                        const elements = App.elements.planejamentoColheita;
                        elements.addOrEditTitle.textContent = 'Editar Grupo de Talhões';
                        elements.editingGroupId.value = group.id;
                        elements.fazendaSelect.value = group.fazendaId;
                        this.populateTalhaoSelection();
                        
                        group.talhoes.forEach(talhao => {
                            const cb = document.getElementById(`talhao-${talhao.id}`);
                            if (cb) cb.checked = true;
                        });

                        elements.atrInput.value = group.atr || '';
                        elements.maturadorInput.value = group.maturador || '';
                        elements.maturadorDate.value = group.dataAplicacaoMaturador || '';
                    }
                },
                deleteSequenceGroup(groupId) {
                    if (App.state.editingHarvestPlan) {
                        App.state.editingHarvestPlan.sequencia = App.state.editingHarvestPlan.sequencia.filter(g => g.id !== groupId);
                        this.renderSequenceTable();
                    }
                },
                resetSequenceGroupForm() {
                     const elements = App.elements.planejamentoColheita;
                     elements.addOrEditTitle.textContent = 'Adicionar Grupo de Talhões';
                     elements.editingGroupId.value = '';
                     document.getElementById('harvest-sequence-form').reset();
                     elements.talhaoSelectionList.innerHTML = '<li>Selecione uma fazenda para ver os talhões</li>';
                },
                calculateHarvestPlan() {
                    const summaryEl = App.elements.planejamentoColheita.summary;
                    summaryEl.innerHTML = '';
                    if (!App.state.editingHarvestPlan) return;

                    const taxaDiaria = parseFloat(App.elements.planejamentoColheita.dailyRate.value);
                    const dataInicio = App.elements.planejamentoColheita.startDate.value;

                    if (!taxaDiaria || !dataInicio) return;
                    
                    let dataAtual = new Date(dataInicio + 'T00:00:00');
                    let totalAreaColhida = 0;
                    let totalProducaoColhida = 0;
                    let diasTotais = 0;

                    const table = document.createElement('table');
                    table.className = 'summary-table';
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Ordem</th>
                                <th>Fazenda/Talhões</th>
                                <th>Área (ha)</th>
                                <th>Produção (t)</th>
                                <th>Data Início</th>
                                <th>Data Fim</th>
                                <th>Dias</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    `;
                    const tbody = table.querySelector('tbody');

                    App.state.editingHarvestPlan.sequencia.forEach((group, index) => {
                        const producaoGrupo = group.talhoes.reduce((sum, t) => sum + t.producao, 0);
                        const areaGrupo = group.talhoes.reduce((sum, t) => sum + t.area, 0);
                        const diasParaColher = producaoGrupo > 0 ? Math.ceil(producaoGrupo / taxaDiaria) : 0;

                        const dataFim = new Date(dataAtual);
                        dataFim.setDate(dataFim.getDate() + (diasParaColher > 0 ? diasParaColher -1 : 0));
                        
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${index + 1}</td>
                            <td>${group.fazendaNome} - ${group.talhoes.map(t=>t.nome).join(', ')}</td>
                            <td>${areaGrupo.toFixed(2)}</td>
                            <td>${producaoGrupo.toFixed(2)}</td>
                            <td>${dataAtual.toLocaleDateString('pt-BR')}</td>
                            <td>${dataFim.toLocaleDateString('pt-BR')}</td>
                            <td>${diasParaColher}</td>
                        `;
                        tbody.appendChild(row);

                        dataAtual.setDate(dataFim.getDate() + 1);
                        totalAreaColhida += areaGrupo;
                        totalProducaoColhida += producaoGrupo;
                        diasTotais += diasParaColher;
                    });
                    
                    summaryEl.appendChild(table);
                    const totalDiv = document.createElement('div');
                    totalDiv.className = 'summary-totals';
                    totalDiv.innerHTML = `
                        <strong>Total:</strong> ${diasTotais} dias de colheita | 
                        ${totalAreaColhida.toFixed(2)} ha | 
                        ${totalProducaoColhida.toFixed(2)} t
                    `;
                    summaryEl.appendChild(totalDiv);
                },
                async savePlan() {
                    const elements = App.elements.planejamentoColheita;
                    const plan = App.state.editingHarvestPlan;
                    plan.nome = elements.frontName.value;
                    plan.dataInicio = elements.startDate.value;
                    plan.taxaDiaria = elements.dailyRate.value;

                    if (!plan.nome || !plan.dataInicio || !plan.taxaDiaria) {
                        App.ui.showAlert('Preencha Nome da Frente, Data de Início e Taxa Diária.', 'error');
                        return;
                    }
                    if (plan.sequencia.length === 0) {
                        App.ui.showAlert('Adicione pelo menos um grupo de talhões à sequência.', 'error');
                        return;
                    }
                    
                    App.ui.showLoading(true, 'A salvar plano...');
                    try {
                        const dataToSave = {
                            nome: plan.nome,
                            dataInicio: plan.dataInicio,
                            taxaDiaria: plan.taxaDiaria,
                            sequencia: plan.sequencia,
                            updatedAt: serverTimestamp(),
                            userId: App.state.currentUser.uid
                        };

                        if (App.state.editingHarvestPlanId) {
                            const planRef = doc(App.db, 'planos_colheita', App.state.editingHarvestPlanId);
                            await updateDoc(planRef, dataToSave);
                        } else {
                            dataToSave.createdAt = serverTimestamp();
                            await addDoc(collection(App.db, 'planos_colheita'), dataToSave);
                        }
                        App.ui.showAlert('Plano de colheita salvo com sucesso!', 'success');
                        this.resetView();
                    } catch (error) {
                        console.error("Erro ao salvar plano de colheita:", error);
                        App.ui.showAlert('Erro ao salvar plano.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                handleDragAndDrop() {
                    const tableBody = App.elements.planejamentoColheita.tableBody;
                    const rows = tableBody.querySelectorAll('tr');
                    
                    rows.forEach(row => {
                        row.addEventListener('dragstart', (e) => {
                           App.state.draggedElement = e.target;
                           e.dataTransfer.effectAllowed = 'move';
                           e.dataTransfer.setData('text/html', e.target.innerHTML);
                           setTimeout(() => e.target.classList.add('dragging'), 0);
                        });
                        row.addEventListener('dragend', (e) => {
                            e.target.classList.remove('dragging');
                        });
                        row.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            const targetRow = e.target.closest('tr');
                            if (targetRow && targetRow !== App.state.draggedElement) {
                                const rect = targetRow.getBoundingClientRect();
                                const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > .5;
                                tableBody.insertBefore(App.state.draggedElement, (next && targetRow.nextSibling) || targetRow);
                            }
                        });
                    });

                    tableBody.addEventListener('drop', (e) => {
                        e.preventDefault();
                        const newSequence = [];
                        const newRows = tableBody.querySelectorAll('tr');
                        newRows.forEach(row => {
                            const groupId = row.dataset.groupId;
                            const group = App.state.editingHarvestPlan.sequencia.find(g => g.id === groupId);
                            if (group) newSequence.push(group);
                        });
                        App.state.editingHarvestPlan.sequencia = newSequence;
                        this.renderSequenceTable();
                    });
                },
            },
            gerenciarUsuarios: { 
                bindEvents() {
                    const elements = App.elements.gerenciarUsuarios;
                    elements.btnCreateUser.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.createUser();
                    });
                },
                async createUser() {
                    const elements = App.elements.gerenciarUsuarios;
                    const email = elements.newUserUsername.value;
                    const password = elements.newUserPassword.value;
                    const role = elements.newUserRole.value;
                    const permissions = this._getPermissionsFromCheckboxes(elements.permissionCheckboxes);
            
                    if (!email || !password || !role) {
                        App.ui.showAlert('Email, Senha e Função são obrigatórios.', 'error');
                        return;
                    }
            
                    App.ui.showLoading(true, "A criar utilizador...");
                    try {
                        const backendUrl = 'https://agrovetor-backend-phi.vercel.app/create-user';
                        const response = await fetch(backendUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password, role, permissions })
                        });

                        const result = await response.json();

                        if (!response.ok) {
                            throw new Error(result.error || 'Erro desconhecido do servidor');
                        }
                        
                        App.ui.showAlert(`Utilizador ${email} criado com sucesso!`, 'success');
                        elements.form.reset();

                    } catch (error) {
                        console.error("Erro ao criar utilizador:", error);
                        App.ui.showAlert(error.message, 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                editUser(user) {
                    const modal = App.elements.modals.userEdit;
                    modal.title.textContent = `Editar Utilizador: ${user.email}`;
                    modal.userId.value = user.id;
                    modal.username.value = user.email;
                    modal.role.value = user.role;
                    this._setCheckboxesFromPermissions(user.permissions || {}, modal.permissionGrid.querySelectorAll('input[type="checkbox"]'));
                    App.ui.modals.show('userEdit');
                },
                _getPermissionsFromCheckboxes(checkboxes) {
                    const permissions = {};
                    checkboxes.forEach(cb => {
                        permissions[cb.name] = cb.checked;
                    });
                    return permissions;
                },
                _setCheckboxesFromPermissions(permissions, checkboxes) {
                    checkboxes.forEach(cb => {
                        cb.checked = !!permissions[cb.name];
                    });
                }
            },
            cadastrarPessoas: {
                bindEvents() {
                    const elements = App.elements.cadastrarPessoas;
                    elements.btnSave.addEventListener('click', (e) => { e.preventDefault(); this.savePersonnel(); });
                    elements.csvUploadArea.addEventListener('click', () => elements.csvInput.click());
                    elements.csvInput.addEventListener('change', (e) => this.handleCsvUpload(e.target.files[0]));
                    elements.btnDownloadTemplate.addEventListener('click', () => this.downloadCsvTemplate());
                },
                async savePersonnel() {
                    const elements = App.elements.cadastrarPessoas;
                    const id = elements.personnelId.value;
                    const matricula = elements.matricula.value;
                    const nome = elements.name.value;

                    if (!matricula || !nome) {
                        App.ui.showAlert('Matrícula e Nome são obrigatórios.', 'error');
                        return;
                    }
                    
                    const data = { matricula, nome };
                    App.ui.showLoading(true);
                    try {
                        if (id) {
                            await setDoc(doc(App.db, 'pessoas', id), data);
                            App.ui.showAlert('Pessoa atualizada com sucesso!', 'success');
                        } else {
                            await addDoc(collection(App.db, 'pessoas'), data);
                             App.ui.showAlert('Pessoa cadastrada com sucesso!', 'success');
                        }
                        this.resetForm();
                    } catch (error) {
                         console.error("Erro ao salvar pessoa:", error);
                         App.ui.showAlert('Erro ao salvar pessoa.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                edit(person) {
                    const elements = App.elements.cadastrarPessoas;
                    elements.personnelId.value = person.id;
                    elements.matricula.value = person.matricula;
                    elements.name.value = person.nome;
                },
                delete(personId) {
                    App.ui.modals.showConfirmation(
                        'Confirmar Exclusão',
                        `Tem a certeza de que deseja excluir esta pessoa?`,
                        async () => {
                            try {
                                App.ui.showLoading(true);
                                await deleteDoc(doc(App.db, 'pessoas', personId));
                                App.ui.showAlert('Pessoa excluída com sucesso!', 'success');
                            } catch (error) {
                                console.error("Erro ao excluir pessoa:", error);
                                App.ui.showAlert('Erro ao excluir pessoa.', 'error');
                            } finally {
                                App.ui.showLoading(false);
                            }
                        }
                    );
                },
                handleCsvUpload(file) {
                    if (!file || !file.type.match('text/csv')) {
                        App.ui.showAlert('Por favor, selecione um ficheiro CSV.', 'error');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const csv = event.target.result;
                        const lines = csv.split('\n').filter(line => line.trim() !== '');
                        if (lines.length <= 1) {
                            App.ui.showAlert('Ficheiro CSV vazio ou inválido.', 'error');
                            return;
                        }
                        App.ui.showLoading(true, 'A processar CSV de Pessoas...');
                        try {
                            const batch = writeBatch(App.db);
                            const headers = lines[0].trim().split(',').map(h => h.trim());
                            const matriculaIndex = headers.indexOf('Matricula');
                            const nomeIndex = headers.indexOf('Nome');

                            if(matriculaIndex === -1 || nomeIndex === -1) {
                                throw new Error('Cabeçalho do CSV deve conter "Matricula" e "Nome".');
                            }

                            for (let i = 1; i < lines.length; i++) {
                                const values = lines[i].trim().split(',');
                                const matricula = values[matriculaIndex];
                                const nome = values[nomeIndex];
                                if (matricula && nome) {
                                    const newDocRef = doc(collection(App.db, "pessoas"));
                                    batch.set(newDocRef, { matricula, nome });
                                }
                            }
                            await batch.commit();
                            App.ui.showAlert(`${lines.length - 1} pessoas importadas com sucesso!`, 'success');
                        } catch (error) {
                            console.error("Erro ao importar CSV de pessoas:", error);
                            App.ui.showAlert(`Erro ao importar: ${error.message}`, 'error');
                        } finally {
                            App.ui.showLoading(false);
                            App.elements.cadastrarPessoas.csvInput.value = '';
                        }
                    };
                    reader.readAsText(file);
                },
                downloadCsvTemplate() {
                    const csvContent = "data:text/csv;charset=utf-8," + "Matricula,Nome\n12345,João da Silva\n";
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "template_pessoas.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },
                resetForm() {
                    App.elements.cadastrarPessoas.form.reset();
                    App.elements.cadastrarPessoas.personnelId.value = '';
                }
            },
            configuracoesEmpresa: { 
                bindEvents() {
                    const elements = App.elements.configuracoesEmpresa;
                    elements.logoUploadArea.addEventListener('click', () => elements.logoInput.click());
                    elements.logoInput.addEventListener('change', (e) => this.handleLogoUpload(e.target.files[0]));
                    elements.removeLogoBtn.addEventListener('click', () => this.removeLogo());
                },
                handleLogoUpload(file) {
                    if (!file || !file.type.match('image.*')) {
                        App.ui.showAlert('Por favor, selecione um ficheiro de imagem.', 'error');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64String = e.target.result;
                        this.saveLogo(base64String);
                    };
                    reader.readAsDataURL(file);
                },
                async saveLogo(base64String) {
                    App.ui.showLoading(true, 'A enviar logo...');
                    try {
                        const backendUrl = 'https://agrovetor-backend-phi.vercel.app/upload-logo'; 
                        await fetch(backendUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ logo: base64String })
                        });
                        App.ui.showAlert('Logo atualizado com sucesso!', 'success');
                        await App.db_ops.fetchCompanyConfig();
                    } catch (error) {
                        console.error("Erro ao enviar logo:", error);
                        App.ui.showAlert('Erro ao enviar o logo.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                async removeLogo() {
                     App.ui.modals.showConfirmation(
                        'Remover Logo',
                        'Tem a certeza de que deseja remover o logo da empresa?',
                        async () => {
                            App.ui.showLoading(true, 'A remover logo...');
                            try {
                                const configRef = doc(App.db, 'configuracoes', 'empresa');
                                await updateDoc(configRef, { logoUrl: deleteField() });
                                App.ui.showAlert('Logo removido com sucesso.', 'success');
                                App.state.companyConfig.logoUrl = null;
                                App.ui.renderCompanyConfig();
                            } catch (error) {
                                console.error("Erro ao remover logo:", error);
                                App.ui.showAlert('Erro ao remover o logo.', 'error');
                            } finally {
                                App.ui.showLoading(false);
                            }
                        }
                     );
                }
            },
            modals: {
                bindEvents() {
                    const modals = App.elements.modals;
                    modals.userEdit.closeBtn.addEventListener('click', () => App.ui.modals.hide('userEdit'));
                    modals.confirmation.closeBtn.addEventListener('click', () => App.ui.modals.hide('confirmation'));
                    modals.confirmation.cancelBtn.addEventListener('click', () => App.ui.modals.hide('confirmation'));
                    modals.changePassword.closeBtn.addEventListener('click', () => App.ui.modals.hide('changePassword'));
                    modals.changePassword.cancelBtn.addEventListener('click', () => App.ui.modals.hide('changePassword'));
                    modals.adminPassword.closeBtn.addEventListener('click', () => App.ui.modals.hide('adminPassword'));
                    modals.adminPassword.cancelBtn.addEventListener('click', () => App.ui.modals.hide('adminPassword'));
                    modals.chart.closeBtn.addEventListener('click', () => App.ui.modals.hide('chart'));

                    modals.userEdit.btnSave.addEventListener('click', () => this.saveUserChanges());
                    modals.userEdit.btnResetPass.addEventListener('click', () => this.resetUserPassword());
                    modals.userEdit.btnDelete.addEventListener('click', () => this.deleteUser());
                    modals.changePassword.saveBtn.addEventListener('click', () => this.changePassword());
                    modals.adminPassword.confirmBtn.addEventListener('click', async () => {
                        const password = App.elements.modals.adminPassword.passwordInput.value;
                        if (!password) {
                            App.ui.showAlert('Por favor, insira a senha de administrador.', 'error');
                            return;
                        }
                        
                        try {
                            const user = App.auth.currentUser;
                            const credential = EmailAuthProvider.credential(user.email, password);
                            await reauthenticateWithCredential(user, credential);
                            
                            if (typeof App.state.adminActionCallback === 'function') {
                                App.state.adminActionCallback();
                            }
                        } catch(error) {
                            App.ui.showAlert('Senha de administrador incorreta.', 'error');
                        } finally {
                             App.ui.modals.hide('adminPassword');
                             App.elements.modals.adminPassword.passwordInput.value = '';
                             App.state.adminActionCallback = null;
                        }
                    });
                },
                async saveUserChanges() {
                    const modal = App.elements.modals.userEdit;
                    const userId = modal.userId.value;
                    const role = modal.role.value;
                    const permissions = App.forms.gerenciarUsuarios._getPermissionsFromCheckboxes(modal.permissionGrid.querySelectorAll('input'));

                    App.ui.showLoading(true, 'A salvar alterações...');
                    try {
                        const userRef = doc(App.db, 'usuarios', userId);
                        await updateDoc(userRef, { role, permissions });
                        App.ui.showAlert('Utilizador atualizado com sucesso!', 'success');
                        App.ui.modals.hide('userEdit');
                    } catch (error) {
                        console.error("Erro ao atualizar utilizador:", error);
                        App.ui.showAlert('Erro ao atualizar utilizador.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                },
                async resetUserPassword() {
                    const email = App.elements.modals.userEdit.username.value;
                    App.ui.modals.showConfirmation(
                        'Redefinir Senha',
                        `Um email para redefinição de senha será enviado para ${email}. Confirma?`,
                        async () => {
                            try {
                                App.ui.showLoading(true);
                                await sendPasswordResetEmail(App.auth, email);
                                App.ui.showAlert(`Email de redefinição enviado para ${email}.`, 'success');
                            } catch (error) {
                                console.error("Erro ao redefinir senha:", error);
                                App.ui.showAlert('Erro ao enviar email de redefinição.', 'error');
                            } finally {
                                App.ui.showLoading(false);
                            }
                        }
                    );
                },
                async deleteUser() {
                    const userId = App.elements.modals.userEdit.userId.value;
                    const email = App.elements.modals.userEdit.username.value;
                     App.ui.modals.showConfirmation(
                        'EXCLUIR UTILIZADOR',
                        `Esta ação é IRREVERSÍVEL. Tem a CERTEZA de que deseja excluir o utilizador ${email}?`,
                        async () => {
                            App.ui.showLoading(true, `A excluir ${email}...`);
                            try {
                                const backendUrl = 'https://agrovetor-backend-phi.vercel.app/delete-user';
                                const response = await fetch(backendUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ uid: userId })
                                });
                                if (!response.ok) {
                                    const result = await response.json();
                                    throw new Error(result.error);
                                }
                                App.ui.showAlert('Utilizador excluído com sucesso.', 'success');
                                App.ui.modals.hide('userEdit');
                            } catch(error) {
                                console.error("Erro ao excluir utilizador:", error);
                                App.ui.showAlert(`Erro ao excluir utilizador: ${error.message}`, 'error');
                            } finally {
                                App.ui.showLoading(false);
                            }
                        }
                    );
                },
                async changePassword() {
                    const modal = App.elements.modals.changePassword;
                    const currentPassword = modal.currentPassword.value;
                    const newPassword = modal.newPassword.value;
                    const confirmNewPassword = modal.confirmNewPassword.value;

                    if (newPassword !== confirmNewPassword) {
                        App.ui.showAlert('As novas senhas não coincidem.', 'error');
                        return;
                    }
                    if (newPassword.length < 6) {
                        App.ui.showAlert('A nova senha deve ter pelo menos 6 caracteres.', 'error');
                        return;
                    }

                    App.ui.showLoading(true, 'A alterar senha...');
                    try {
                        const user = App.auth.currentUser;
                        const credential = EmailAuthProvider.credential(user.email, currentPassword);
                        await reauthenticateWithCredential(user, credential);
                        await updatePassword(user, newPassword);
                        App.ui.showAlert('Senha alterada com sucesso!', 'success');
                        App.ui.modals.hide('changePassword');
                        modal.overlay.querySelector('form').reset();
                    } catch (error) {
                        console.error("Erro ao alterar senha:", error);
                        App.ui.showAlert('Erro ao alterar senha. Verifique a sua senha atual.', 'error');
                    } finally {
                        App.ui.showLoading(false);
                    }
                }
            }
        },
        
        relatorios: {
            bindAll() {
                this.broca.bindEvents();
                this.perda.bindEvents();
                this.colheitaCustom.bindEvents();
            },
            async _fetchAndDownloadReport(endpoint, filters, filename) {
                App.ui.showLoading(true, `A gerar ${filename}...`);
                try {
                     const backendUrl = `https://agrovetor-backend-phi.vercel.app/${endpoint}`;
                     const response = await fetch(backendUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(filters)
                    });
            
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || `Falha no servidor: ${response.statusText}`);
                    }
            
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } catch (error) {
                    console.error(`Erro ao gerar relatório ${filename}:`, error);
                    App.ui.showAlert(`Erro ao gerar relatório: ${error.message}`, 'error');
                } finally {
                    App.ui.showLoading(false);
                }
            },
            broca: { 
                bindEvents() {
                    App.elements.btnPDFBrocamento.addEventListener('click', () => this.generate('pdf'));
                    App.elements.btnExcelBrocamento.addEventListener('click', () => this.generate('csv'));
                },
                generate(format) {
                    const filters = {
                        fazenda: App.elements.fazendaFiltroBrocamento.value,
                        inicio: App.elements.inicioBrocamento.value,
                        fim: App.elements.fimBrocamento.value,
                        tipo: App.elements.tipoRelatorioBroca.value,
                        logoUrl: App.state.companyConfig.logoUrl || null
                    };
                    App.relatorios._fetchAndDownloadReport(`relatorio/broca/${format}`, filters, `relatorio_broca.${format}`);
                }
            },
            perda: { 
                bindEvents() {
                    App.elements.btnPDFPerda.addEventListener('click', () => this.generate('pdf'));
                    App.elements.btnExcelPerda.addEventListener('click', () => this.generate('csv'));
                },
                generate(format) {
                    const filters = {
                        fazenda: App.elements.fazendaFiltroPerda.value,
                        talhao: App.elements.talhaoFiltroPerda.value,
                        operador: App.elements.operadorFiltroPerda.value,
                        frente: App.elements.frenteFiltroPerda.value,
                        inicio: App.elements.inicioPerda.value,
                        fim: App.elements.fimPerda.value,
                        tipo: App.elements.tipoRelatorioPerda.value,
                        logoUrl: App.state.companyConfig.logoUrl || null
                    };
                    App.relatorios._fetchAndDownloadReport(`relatorio/perda/${format}`, filters, `relatorio_perda.${format}`);
                }
            },
            colheitaCustom: {
                bindEvents() {
                    App.elements.relatorioColheitaCustom.planoSelect.addEventListener('change', (e) => this.renderOptions(e.target.value));
                    App.elements.relatorioColheitaCustom.btnPDF.addEventListener('click', () => this.generate('pdf'));
                    App.elements.relatorioColheitaCustom.btnExcel.addEventListener('click', () => this.generate('csv'));
                },
                renderOptions(planId) {
                    const container = App.elements.relatorioColheitaCustom.optionsContainer;
                    container.innerHTML = '';
                    if (!planId) return;

                    const headers = [
                        { id: 'ordem', label: 'Ordem', checked: true },
                        { id: 'fazenda', label: 'Fazenda', checked: true },
                        { id: 'talhao', label: 'Talhão', checked: true },
                        { id: 'area', label: 'Área (ha)', checked: true },
                        { id: 'producao', label: 'Produção (t)', checked: true },
                        { id: 'variedade', label: 'Variedade', checked: true },
                        { id: 'idade', label: 'Idade (Corte)', checked: true },
                        { id: 'atr', label: 'ATR', checked: false },
                        { id: 'maturador', label: 'Maturador', checked: false },
                        { id: 'diasAplicacao', label: 'Dias Aplic.', checked: false },
                        { id: 'entrada', label: 'Entrada Colheita', checked: true },
                        { id: 'saida', label: 'Saída Colheita', checked: true }
                    ];

                    headers.forEach(header => {
                        container.innerHTML += `
                            <div>
                                <input type="checkbox" id="col-${header.id}" data-column="${header.id}" ${header.checked ? 'checked' : ''}>
                                <label for="col-${header.id}">${header.label}</label>
                            </div>
                        `;
                    });
                },
                generate(format) {
                    const planId = App.elements.relatorioColheitaCustom.planoSelect.value;
                    if (!planId) {
                        App.ui.showAlert('Selecione um plano de colheita.', 'error');
                        return;
                    }

                    const selectedColumns = {};
                    App.elements.relatorioColheitaCustom.optionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        selectedColumns[cb.dataset.column] = cb.checked;
                    });

                    const filters = {
                        planId: planId,
                        selectedColumns: JSON.stringify(selectedColumns),
                        logoUrl: App.state.companyConfig.logoUrl || null
                    };
                    
                    App.relatorios._fetchAndDownloadReport(`relatorio/colheita/${format}`, filters, `relatorio_colheita_custom.${format}`);
                }
            }
        },
        
        pwa: {
            registerServiceWorker() {
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', () => {
                        navigator.serviceWorker.register('./service-worker.js')
                            .then(reg => console.log('ServiceWorker registration successful.', reg))
                            .catch(err => console.log('ServiceWorker registration failed: ', err));
                    });
                    window.addEventListener('beforeinstallprompt', (e) => {
                        e.preventDefault();
                        App.state.deferredInstallPrompt = e;
                        if(App.elements.installAppBtn) App.elements.installAppBtn.style.display = 'flex';
                    });
                }
            },
            install() {
                if (App.state.deferredInstallPrompt) {
                    App.state.deferredInstallPrompt.prompt();
                    App.state.deferredInstallPrompt.userChoice.then(choiceResult => {
                        if (choiceResult.outcome === 'accepted') {
                            console.log('User accepted the A2HS prompt');
                        }
                        App.state.deferredInstallPrompt = null;
                        if(App.elements.installAppBtn) App.elements.installAppBtn.style.display = 'none';
                    });
                }
            }
        },

        auth_guards: {
             canView(tabId) { return !!App.state.currentUser?.permissions?.[tabId]; },
             isAdmin() { return App.state.currentUser?.role === 'admin'; },
        },
        
        helpers: {
            getFazendaNome(codigo) {
                const fazenda = App.state.fazendas.find(f => f.id === codigo);
                return fazenda ? fazenda.nome : `Cód: ${codigo}`;
            },
             getPersonNameByMatricula(matricula) {
                const pessoa = App.state.pessoas.find(p => p.matricula === matricula);
                return pessoa ? pessoa.nome : `Matrícula: ${matricula}`;
            },
            getFirebaseAuthErrorMessage(error) {
                switch (error.code) {
                    case 'auth/user-not-found': return 'Utilizador não encontrado.';
                    case 'auth/wrong-password': return 'Senha incorreta.';
                    case 'auth/invalid-email': return 'Email inválido.';
                    case 'auth/network-request-failed': return 'Falha na rede. Verifique a sua conexão.';
                    case 'auth/email-already-in-use': return 'Este email já está a ser utilizado por outra conta.';
                    default: return `Ocorreu um erro: ${error.message}`;
                }
            },
            debounce(func, delay) {
                let timeout;
                return function(...args) {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), delay);
                };
            }
        }
    };

    App.init();
});
