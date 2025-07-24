// FIREBASE: Importe os módulos necessários do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, getDocs, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";


document.addEventListener('DOMContentLoaded', () => {

    // FIREBASE: Configuração e inicialização do Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyBFXgXKDIBo9JD9vuGik5VDYZFDb_tbCrY", // Substitua pela sua chave de API
        authDomain: "agrovetor-v2.firebaseapp.com",
        projectId: "agrovetor-v2",
        storageBucket: "agrovetor-v2.appspot.com",
        messagingSenderId: "782518751171",
        appId: "1:782518751171:web:d223838d70b7492c686121"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const storage = getStorage(app);

    const App = {
        elements: {
            // Telas
            loginScreen: document.getElementById('loginScreen'),
            appScreen: document.getElementById('appScreen'),
            content: document.getElementById('content'),
            
            // Login
            loginForm: document.getElementById('loginForm'),
            loginUser: document.getElementById('loginUser'),
            loginPass: document.getElementById('loginPass'),
            btnLogin: document.getElementById('btnLogin'),
            loginMessage: document.getElementById('loginMessage'),
            
            // Seleção de usuário offline
            offlineUserSelection: document.getElementById('offlineUserSelection'),
            offlineUserList: document.getElementById('offlineUserList'),

            // Header e Menu
            headerTitle: document.querySelector('header h1'),
            btnToggleMenu: document.getElementById('btnToggleMenu'),
            menu: document.getElementById('menu'),
            userMenuContainer: document.getElementById('user-menu-container'),
            userMenuToggle: document.getElementById('user-menu-toggle'),
            userMenuDropdown: document.getElementById('user-menu-dropdown'),
            userMenuUsername: document.getElementById('userMenuUsername'),
            currentDateTime: document.getElementById('currentDateTime'),
            logoutBtn: document.getElementById('logoutBtn'),
            installAppBtn: document.getElementById('installAppBtn'),
            changePasswordBtn: document.getElementById('changePasswordBtn'),

            // Tema
            themeButtons: document.querySelectorAll('.theme-button'),

            // Alertas e Loading
            alertContainer: document.getElementById('alertContainer'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingProgressText: document.getElementById('loading-progress-text'),
            
            // Abas
            tabs: document.querySelectorAll('.tab-content'),

            // Lançamento Broca
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
            btnSalvarBrocamento: document.getElementById('btnSalvarBrocamento'),

            // Relatório Broca
            fazendaFiltroBrocamento: document.getElementById('fazendaFiltroBrocamento'),
            inicioBrocamento: document.getElementById('inicioBrocamento'),
            fimBrocamento: document.getElementById('fimBrocamento'),
            tipoRelatorioBroca: document.getElementById('tipoRelatorioBroca'),
            btnPDFBrocamento: document.getElementById('btnPDFBrocamento'),
            btnExcelBrocamento: document.getElementById('btnExcelBrocamento'),

            // Lançamento Perda
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
            btnSalvarPerda: document.getElementById('btnSalvarPerda'),

            // Relatório Perda
            fazendaFiltroPerda: document.getElementById('fazendaFiltroPerda'),
            talhaoFiltroPerda: document.getElementById('talhaoFiltroPerda'),
            operadorFiltroPerda: document.getElementById('operadorFiltroPerda'),
            frenteFiltroPerda: document.getElementById('frenteFiltroPerda'),
            inicioPerda: document.getElementById('inicioPerda'),
            fimPerda: document.getElementById('fimPerda'),
            tipoRelatorioPerda: document.getElementById('tipoRelatorioPerda'),
            btnPDFPerda: document.getElementById('btnPDFPerda'),
            btnExcelPerda: document.getElementById('btnExcelPerda'),

            // Excluir Lançamentos
            listaExclusao: document.getElementById('listaExclusao'),
            
            // Cadastros
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
            
            // Gerir Utilizadores
            newUserUsername: document.getElementById('newUserUsername'),
            newUserPassword: document.getElementById('newUserPassword'),
            newUserRole: document.getElementById('newUserRole'),
            permissionCheckboxes: document.querySelectorAll('#gerenciarUsuarios .permission-grid input[type="checkbox"]'),
            btnCreateUser: document.getElementById('btnCreateUser'),
            usersList: document.getElementById('usersList'),

            // Modal Edição de Utilizador
            userEditModal: document.getElementById('userEditModal'),
            userEditModalTitle: document.getElementById('userEditModalTitle'),
            userEditModalCloseBtn: document.getElementById('userEditModalCloseBtn'),
            editingUserId: document.getElementById('editingUserId'),
            editUserUsername: document.getElementById('editUserUsername'),
            editUserRole: document.getElementById('editUserRole'),
            editUserPermissionGrid: document.getElementById('editUserPermissionGrid'),
            btnSaveUserChanges: document.getElementById('btnSaveUserChanges'),
            btnResetPassword: document.getElementById('btnResetPassword'),
            btnDeleteUser: document.getElementById('btnDeleteUser'),

            // Modal de Confirmação
            confirmationModal: document.getElementById('confirmationModal'),
            confirmationModalTitle: document.getElementById('confirmationModalTitle'),
            confirmationModalMessage: document.getElementById('confirmationModalMessage'),
            confirmationModalCloseBtn: document.getElementById('confirmationModalCloseBtn'),
            confirmationModalCancelBtn: document.getElementById('confirmationModalCancelBtn'),
            confirmationModalConfirmBtn: document.getElementById('confirmationModalConfirmBtn'),

            // Modal de Alteração de Senha
            changePasswordModal: document.getElementById('changePasswordModal'),
            changePasswordModalCloseBtn: document.getElementById('changePasswordModalCloseBtn'),
            currentPassword: document.getElementById('currentPassword'),
            newPassword: document.getElementById('newPassword'),
            confirmNewPassword: document.getElementById('confirmNewPassword'),
            changePasswordModalCancelBtn: document.getElementById('changePasswordModalCancelBtn'),
            changePasswordModalSaveBtn: document.getElementById('changePasswordModalSaveBtn'),

            // Modal de Confirmação de Senha de Admin
            adminPasswordConfirmModal: document.getElementById('adminPasswordConfirmModal'),
            adminPasswordConfirmModalCloseBtn: document.getElementById('adminPasswordConfirmModalCloseBtn'),
            adminConfirmPassword: document.getElementById('adminConfirmPassword'),
            adminPasswordConfirmModalCancelBtn: document.getElementById('adminPasswordConfirmModalCancelBtn'),
            adminPasswordConfirmModalConfirmBtn: document.getElementById('adminPasswordConfirmModalConfirmBtn'),

            // Cadastro de Pessoas
            personnelCsvUploadArea: document.getElementById('personnelCsvUploadArea'),
            personnelCsvInput: document.getElementById('personnelCsvInput'),
            btnDownloadPersonnelCsvTemplate: document.getElementById('btnDownloadPersonnelCsvTemplate'),
            personnelId: document.getElementById('personnelId'),
            personnelMatricula: document.getElementById('personnelMatricula'),
            personnelName: document.getElementById('personnelName'),
            btnSavePersonnel: document.getElementById('btnSavePersonnel'),
            personnelList: document.getElementById('personnelList'),

            // Configurações da Empresa
            logoUploadArea: document.getElementById('logoUploadArea'),
            logoInput: document.getElementById('logoInput'),
            logoPreview: document.getElementById('logoPreview'),
            removeLogoBtn: document.getElementById('removeLogoBtn'),

            // Planeamento de Inspeções
            planoTipo: document.getElementById('planoTipo'),
            planoFazenda: document.getElementById('planoFazenda'),
            planoTalhao: document.getElementById('planoTalhao'),
            planoData: document.getElementById('planoData'),
            planoResponsavel: document.getElementById('planoResponsavel'),
            planoMeta: document.getElementById('planoMeta'),
            planoObs: document.getElementById('planoObs'),
            btnAgendarInspecao: document.getElementById('btnAgendarInspecao'),
            btnSugerirPlano: document.getElementById('btnSugerirPlano'),
            listaPlanejamento: document.getElementById('listaPlanejamento'),

            // Dashboard
            btnAnalisarDashboard: document.getElementById('btnAnalisarDashboard'),
            aiAnalysisCard: document.getElementById('ai-analysis-card'),
            aiAnalysisContent: document.getElementById('ai-analysis-content'),
            kpiBrocamento: document.getElementById('kpi-brocamento'),
            kpiPerda: document.getElementById('kpi-perda'),
            kpiInspecoes: document.getElementById('kpi-inspecoes'),
            kpiFazendas: document.getElementById('kpi-fazendas'),
            chartModal: document.getElementById('chartModal'),
            chartModalTitle: document.getElementById('chartModalTitle'),
            chartModalCloseBtn: document.getElementById('chartModalCloseBtn'),
            expandedChartCanvas: document.getElementById('expandedChartCanvas').getContext('2d'),

            // Planeamento de Colheita
            harvestPlanEditor: document.getElementById('harvest-plan-editor'),
            harvestPlansListContainer: document.getElementById('harvest-plans-list-container'),
            harvestPlansList: document.getElementById('harvest-plans-list'),
            btnAddNewHarvestPlan: document.getElementById('btnAddNewHarvestPlan'),
            harvestFrontName: document.getElementById('harvestFrontName'),
            harvestStartDate: document.getElementById('harvestStartDate'),
            harvestDailyRate: document.getElementById('harvestDailyRate'),
            harvestFazenda: document.getElementById('harvestFazenda'),
            harvestAtr: document.getElementById('harvestAtr'),
            harvestMaturador: document.getElementById('harvestMaturador'),
            harvestMaturadorDate: document.getElementById('harvestMaturadorDate'),
            harvestTalhaoSelectionList: document.getElementById('harvestTalhaoSelectionList'),
            btnAddOrUpdateHarvestSequence: document.getElementById('btnAddOrUpdateHarvestSequence'),
            btnOptimizeHarvest: document.getElementById('btnOptimizeHarvest'),
            btnCancelEditSequence: document.getElementById('btnCancelEditSequence'),
            addOrEditSequenceTitle: document.getElementById('addOrEditSequenceTitle'),
            editingGroupId: document.getElementById('editingGroupId'),
            harvestPlanTableBody: document.querySelector('#harvestPlanTable tbody'),
            harvestSummary: document.getElementById('harvestSummary'),
            btnSaveHarvestPlan: document.getElementById('btnSaveHarvestPlan'),
            btnCancelHarvestPlan: document.getElementById('btnCancelHarvestPlan'),
            
            // Relatório Customizado de Colheita
            planoRelatorioSelect: document.getElementById('planoRelatorioSelect'),
            reportOptionsContainer: document.getElementById('reportOptionsContainer'),
            btnGerarRelatorioCustomPDF: document.getElementById('btnGerarRelatorioCustomPDF'),
            btnGerarRelatorioCustomExcel: document.getElementById('btnGerarRelatorioCustomExcel'),
        },

        state: {
            currentUser: null,
            userPermissions: [],
            fazendas: [],
            personnel: [],
            inspecoesBroca: [],
            inspecoesPerda: [],
            inspectionPlans: [],
            harvestPlans: [],
            unsubscribes: [],
            deferredInstallPrompt: null,
            charts: {},
            currentHarvestPlan: null, // O plano de colheita que está a ser editado
            isOffline: !navigator.onLine,
            users: [], // Lista de todos os utilizadores para acesso offline
            companyLogoUrl: '', // URL do logotipo da empresa
        },

        init() {
            this.pwa.registerServiceWorker();
            this.logic.theme.init();
            this.logic.auth.checkAuthState();
            this.utils.updateDateTime();
            setInterval(this.utils.updateDateTime, 1000 * 60); // Atualiza a cada minuto
            
            // Adiciona listener para o estado online/offline
            window.addEventListener('online', () => this.handleConnectionChange(false));
            window.addEventListener('offline', () => this.handleConnectionChange(true));
        },

        handleConnectionChange(isOffline) {
            App.state.isOffline = isOffline;
            if (isOffline) {
                App.utils.showAlert('Está offline. Algumas funcionalidades podem ser limitadas.', 'warning');
            } else {
                App.utils.showAlert('Está online novamente.', 'info');
                // Tenta sincronizar dados pendentes se necessário
            }
        },

        logic: {
            auth: {
                checkAuthState() {
                    onAuthStateChanged(auth, user => {
                        if (user) {
                            App.state.currentUser = user;
                            this.fetchUserData(user.uid);
                        } else {
                            App.state.currentUser = null;
                            App.elements.loginScreen.style.display = 'flex';
                            App.elements.appScreen.style.display = 'none';
                            App.utils.showLoading(false);
                            if (App.state.isOffline) {
                                App.logic.auth.showOfflineUserSelection();
                            }
                        }
                    });
                },

                async fetchUserData(uid) {
                    try {
                        const userDocRef = doc(db, "users", uid);
                        const userDoc = await getDoc(userDocRef);
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            App.state.userPermissions = userData.permissions || [];
                            App.state.currentUser.displayName = userData.email; // Usar email como nome de exibição
                            App.logic.auth.showApp();
                        } else {
                            console.error("Documento do utilizador não encontrado.");
                            this.logout();
                        }
                    } catch (error) {
                        console.error("Erro ao buscar dados do utilizador:", error);
                        if (App.state.isOffline) {
                            console.log("Tentando carregar dados do utilizador do cache offline.");
                            // Tenta carregar dados do cache ou mostra uma mensagem
                        }
                        this.logout();
                    }
                },

                login(event) {
                    event.preventDefault();
                    App.utils.showLoading(true);
                    const email = App.elements.loginUser.value;
                    const password = App.elements.loginPass.value;
                    signInWithEmailAndPassword(auth, email, password)
                        .catch(error => {
                            App.elements.loginMessage.textContent = App.utils.translateAuthError(error.code);
                        })
                        .finally(() => {
                            App.utils.showLoading(false);
                        });
                },

                logout() {
                    signOut(auth).then(() => {
                        App.state.unsubscribes.forEach(unsub => unsub());
                        App.state.unsubscribes = [];
                        Object.keys(App.state).forEach(key => {
                            if (key !== 'isOffline' && key !== 'users') {
                                App.state[key] = Array.isArray(App.state[key]) ? [] : null;
                            }
                        });
                        App.elements.loginScreen.style.display = 'flex';
                        App.elements.appScreen.style.display = 'none';
                        App.elements.userMenuContainer.style.display = 'none';
                        document.body.classList.remove('mobile-menu-open');
                        App.elements.menu.classList.remove('open');
                        App.elements.btnToggleMenu.classList.remove('open');
                    }).catch((error) => {
                        console.error('Erro ao fazer logout:', error);
                    });
                },
                
                async showOfflineUserSelection() {
                    App.elements.loginForm.style.display = 'none';
                    App.elements.offlineUserSelection.style.display = 'block';
                    const userListDiv = App.elements.offlineUserList;
                    userListDiv.innerHTML = '<p>A carregar utilizadores...</p>';

                    try {
                        const querySnapshot = await getDocs(collection(db, "users"));
                        App.state.users = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    } catch (error) {
                        console.warn("Não foi possível buscar utilizadores do Firestore (provavelmente offline). Usando dados em cache se disponíveis.");
                    }

                    if (App.state.users && App.state.users.length > 0) {
                        userListDiv.innerHTML = '';
                        App.state.users.forEach(user => {
                            const btn = document.createElement('button');
                            btn.className = 'offline-user-btn';
                            btn.innerHTML = `<i class="fas fa-user"></i> ${user.email}`;
                            btn.onclick = () => this.loginOffline(user);
                            userListDiv.appendChild(btn);
                        });
                    } else {
                        userListDiv.innerHTML = '<p>Nenhum perfil de utilizador encontrado para acesso offline. Conecte-se à internet pelo menos uma vez para sincronizar.</p>';
                    }
                },
                
                loginOffline(user) {
                    App.state.currentUser = { uid: user.id, email: user.email, displayName: user.email };
                    App.state.userPermissions = user.permissions || [];
                    App.utils.showAlert(`Bem-vindo de volta, ${user.email}! (Modo Offline)`, 'info');
                    this.showApp();
                },

                showApp() {
                    App.elements.loginScreen.style.display = 'none';
                    App.elements.appScreen.style.display = 'flex';
                    App.elements.userMenuContainer.style.display = 'block';
                    App.elements.userMenuUsername.textContent = App.state.currentUser.displayName || App.state.currentUser.email;

                    App.logic.ui.setupMenu();
                    App.logic.ui.setupEventListeners();
                    App.logic.data.loadInitialData();
                    
                    enableIndexedDbPersistence(db, { cacheSizeBytes: CACHE_SIZE_UNLIMITED })
                      .catch((err) => {
                          if (err.code == 'failed-precondition') {
                              console.warn("A persistência offline falhou. Múltiplas abas abertas?");
                          } else if (err.code == 'unimplemented') {
                              console.warn("O navegador atual não suporta persistência offline.");
                          }
                      });
                }
            },

            ui: {
                setupMenu() {
                    const permissions = App.state.userPermissions;
                    const menuContainer = App.elements.menu;
                    menuContainer.innerHTML = ''; 

                    const createMenuItem = (id, icon, text, hasSubmenu = false) => {
                        const button = document.createElement('button');
                        button.id = `menu-${id}`;
                        button.className = 'menu-btn';
                        button.innerHTML = `<i class="${icon}"></i><span>${text}</span>`;
                        if (hasSubmenu) {
                            button.innerHTML += `<i class="fas fa-chevron-right arrow"></i>`;
                        }
                        return button;
                    };
                    
                    const createSubMenu = (id, title, items) => {
                        const submenuContainer = document.createElement('div');
                        submenuContainer.id = `submenu-${id}`;
                        submenuContainer.className = 'submenu-content';

                        const backButton = document.createElement('button');
                        backButton.className = 'submenu-back-btn';
                        backButton.innerHTML = `<i class="fas fa-chevron-left"></i> ${title}`;
                        backButton.onclick = (e) => {
                            e.stopPropagation();
                            submenuContainer.classList.remove('active');
                        };
                        submenuContainer.appendChild(backButton);

                        items.forEach(item => {
                            if (permissions.includes(item.id)) {
                                const button = document.createElement('button');
                                button.id = `menu-${item.id}`;
                                button.className = 'submenu-btn';
                                button.innerHTML = `<i class="${item.icon}"></i><span>${item.text}</span>`;
                                button.onclick = () => this.showTab(item.id);
                                submenuContainer.appendChild(button);
                            }
                        });
                        return submenuContainer;
                    };
                    
                    const menuWrapper = document.createElement('div');
                    menuWrapper.className = 'menu-content';
                    menuContainer.appendChild(menuWrapper);

                    if (permissions.includes('dashboard')) {
                        const btn = createMenuItem('dashboard', 'fas fa-tachometer-alt', 'Dashboard');
                        btn.onclick = () => this.showTab('dashboard');
                        menuWrapper.appendChild(btn);
                    }
                    
                    const planItems = [
                        { id: 'planejamentoColheita', icon: 'fas fa-stream', text: 'Planeamento de Colheita' },
                        { id: 'planejamento', icon: 'fas fa-calendar-alt', text: 'Planeamento de Inspeções' }
                    ];
                    if (planItems.some(item => permissions.includes(item.id))) {
                        const planMenuBtn = createMenuItem('planejamentos', 'fas fa-tasks', 'Planeamentos', true);
                        const planSubMenu = createSubMenu('planejamentos', 'Planeamentos', planItems);
                        planMenuBtn.onclick = () => planSubMenu.classList.add('active');
                        menuWrapper.appendChild(planMenuBtn);
                        menuContainer.appendChild(planSubMenu);
                    }

                    const launchItems = [
                        { id: 'lancamentoBroca', icon: 'fas fa-bug', text: 'Lançamento Broca' },
                        { id: 'lancamentoPerda', icon: 'fas fa-dollar-sign', text: 'Lançamento Perda' }
                    ];
                    if (launchItems.some(item => permissions.includes(item.id))) {
                        const launchMenuBtn = createMenuItem('lancamentos', 'fas fa-edit', 'Lançamentos', true);
                        const launchSubMenu = createSubMenu('lancamentos', 'Lançamentos', launchItems);
                        launchMenuBtn.onclick = () => launchSubMenu.classList.add('active');
                        menuWrapper.appendChild(launchMenuBtn);
                        menuContainer.appendChild(launchSubMenu);
                    }

                    const reportItems = [
                        { id: 'relatorioBroca', icon: 'fas fa-chart-bar', text: 'Relatório Broca' },
                        { id: 'relatorioPerda', icon: 'fas fa-chart-pie', text: 'Relatório Perda' },
                        { id: 'relatorioColheitaCustom', icon: 'fas fa-file-invoice', text: 'Relatório de Colheita' }
                    ];
                    if (reportItems.some(item => permissions.includes(item.id))) {
                        const reportMenuBtn = createMenuItem('relatorios', 'fas fa-print', 'Relatórios', true);
                        const reportSubMenu = createSubMenu('relatorios', 'Relatórios', reportItems);
                        reportMenuBtn.onclick = () => reportSubMenu.classList.add('active');
                        menuWrapper.appendChild(reportMenuBtn);
                        menuContainer.appendChild(reportSubMenu);
                    }

                    const registerItems = [
                        { id: 'cadastros', icon: 'fas fa-tractor', text: 'Fazendas e Talhões' },
                        { id: 'cadastrarPessoas', icon: 'fas fa-id-card', text: 'Cadastro de Pessoas' }
                    ];
                    if (registerItems.some(item => permissions.includes(item.id))) {
                        const registerMenuBtn = createMenuItem('cadastrosMenu', 'fas fa-book', 'Cadastros', true);
                        const registerSubMenu = createSubMenu('cadastrosMenu', 'Cadastros', registerItems);
                        registerMenuBtn.onclick = () => registerSubMenu.classList.add('active');
                        menuWrapper.appendChild(registerMenuBtn);
                        menuContainer.appendChild(registerSubMenu);
                    }
                    
                    const configItems = [
                        { id: 'gerenciarUsuarios', icon: 'fas fa-users-cog', text: 'Gerir Utilizadores' },
                        { id: 'configuracoesEmpresa', icon: 'fas fa-building', text: 'Configurações da Empresa' }
                    ];
                    if (configItems.some(item => permissions.includes(item.id))) {
                        const configMenuBtn = createMenuItem('configuracoes', 'fas fa-cog', 'Configurações', true);
                        const configSubMenu = createSubMenu('configuracoes', 'Configurações', configItems);
                        configMenuBtn.onclick = () => configSubMenu.classList.add('active');
                        menuWrapper.appendChild(configMenuBtn);
                        menuContainer.appendChild(configSubMenu);
                    }

                    if (permissions.includes('excluir')) {
                        const btn = createMenuItem('excluirDados', 'fas fa-trash', 'Excluir Lançamentos');
                        btn.onclick = () => this.showTab('excluirDados');
                        menuWrapper.appendChild(btn);
                    }
                },
                
                showTab(tabId) {
                    App.elements.tabs.forEach(tab => {
                        tab.classList.remove('active');
                        tab.hidden = true;
                    });
                    const activeTab = document.getElementById(tabId);
                    const menuItem = document.getElementById(`menu-${tabId}`);

                    if (activeTab && menuItem) {
                        activeTab.classList.add('active');
                        activeTab.hidden = false;
                        App.elements.headerTitle.innerHTML = menuItem.innerHTML;
                        
                        // Executa funções específicas ao abrir a aba
                        const tabFunctions = {
                            'relatorioBroca': () => App.logic.relatorioBroca.loadFazendas(),
                            'relatorioPerda': () => App.logic.relatorioPerda.loadFilters(),
                            'excluirDados': () => App.logic.excluir.loadEntries(),
                            'gerenciarUsuarios': () => App.logic.usuarios.loadUsers(),
                            'cadastros': () => App.logic.cadastros.loadFarmsForSelection(),
                            'cadastrarPessoas': () => App.logic.cadastros.personnel.loadPersonnel(),
                            'configuracoesEmpresa': () => App.logic.configuracoes.loadLogo(),
                            'planejamento': () => App.logic.planejamento.loadSelects(),
                            'dashboard': () => App.logic.dashboard.renderAllCharts(),
                            'planejamentoColheita': () => App.logic.planejamentoColheita.init(),
                            'relatorioColheitaCustom': () => App.logic.relatorioColheitaCustom.loadHarvestPlans(),
                        };
                        
                        if (tabFunctions[tabId]) {
                            tabFunctions[tabId]();
                        }

                    } else {
                        this.showInitialTab();
                    }
                    
                    App.elements.menu.classList.remove('open');
                    App.elements.btnToggleMenu.classList.remove('open');
                    document.body.classList.remove('mobile-menu-open');
                    App.elements.menu.querySelectorAll('.submenu-content.active').forEach(sm => sm.classList.remove('active'));
                },

                showInitialTab() {
                    const permissions = App.state.userPermissions;
                    const defaultTab = 'dashboard';
                    if (permissions.includes(defaultTab)) {
                        this.showTab(defaultTab);
                    } else if (permissions.length > 0) {
                        this.showTab(permissions[0]);
                    } else {
                        App.utils.showAlert("Não tem permissão para aceder a nenhuma página.", "error");
                        App.logic.auth.logout();
                    }
                },

                setupEventListeners() {
                    App.elements.btnLogin.addEventListener('click', App.logic.auth.login);
                    App.elements.logoutBtn.addEventListener('click', App.logic.auth.logout);
                    App.elements.changePasswordBtn.addEventListener('click', App.logic.usuarios.showChangePasswordModal);

                    App.elements.btnToggleMenu.addEventListener('click', () => {
                        App.elements.btnToggleMenu.classList.toggle('open');
                        App.elements.menu.classList.toggle('open');
                        document.body.classList.toggle('mobile-menu-open');
                    });
                    
                    App.elements.userMenuToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isExpanded = App.elements.userMenuToggle.getAttribute('aria-expanded') === 'true';
                        App.elements.userMenuToggle.setAttribute('aria-expanded', !isExpanded);
                        App.elements.userMenuDropdown.classList.toggle('show');
                    });
                    document.addEventListener('click', (event) => {
                        if (!App.elements.userMenuContainer.contains(event.target)) {
                            App.elements.userMenuDropdown.classList.remove('show');
                            App.elements.userMenuToggle.setAttribute('aria-expanded', 'false');
                        }
                    });

                    App.elements.installAppBtn.addEventListener('click', App.pwa.promptInstall);

                    App.elements.btnSalvarBrocamento.addEventListener('click', () => App.logic.lancamentoBroca.handleSave());
                    ['brocaBase', 'brocaMeio', 'brocaTopo'].forEach(id => {
                        document.getElementById(id).addEventListener('input', App.logic.lancamentoBroca.calcularTotalBrocado);
                    });
                    App.elements.talhao.addEventListener('change', () => App.logic.utils.fetchVariety(App.elements.codigo.value, App.elements.talhao.value, App.elements.varietyDisplay));
                    App.elements.codigo.addEventListener('change', () => App.logic.utils.fetchVariety(App.elements.codigo.value, App.elements.talhao.value, App.elements.varietyDisplay));

                    App.elements.btnPDFBrocamento.addEventListener('click', () => App.logic.relatorioBroca.gerarRelatorio('pdf'));
                    App.elements.btnExcelBrocamento.addEventListener('click', () => App.logic.relatorioBroca.gerarRelatorio('csv'));
                    
                    App.elements.btnSalvarPerda.addEventListener('click', () => App.logic.lancamentoPerda.handleSave());
                    App.elements.matriculaOperador.addEventListener('change', App.logic.lancamentoPerda.fetchOperatorName);
                    App.elements.talhaoPerda.addEventListener('change', () => App.logic.utils.fetchVariety(App.elements.codigoPerda.value, App.elements.talhaoPerda.value, App.elements.varietyDisplayPerda));
                    App.elements.codigoPerda.addEventListener('change', () => App.logic.utils.fetchVariety(App.elements.codigoPerda.value, App.elements.talhaoPerda.value, App.elements.varietyDisplayPerda));

                    App.elements.btnPDFPerda.addEventListener('click', () => App.logic.relatorioPerda.gerarRelatorio('pdf'));
                    App.elements.btnExcelPerda.addEventListener('click', () => App.logic.relatorioPerda.gerarRelatorio('csv'));

                    App.logic.cadastros.init();
                    App.logic.usuarios.init();
                    App.logic.configuracoes.init();
                    App.logic.planejamento.init();
                    App.logic.dashboard.init();
                    App.logic.planejamentoColheita.initEventListeners();
                    App.logic.relatorioColheitaCustom.init();
                }
            },

            data: {
                loadInitialData() {
                    App.utils.showLoading(true, 'A carregar dados iniciais...');
                    const promises = [
                        this.fetchFazendas(),
                        this.fetchPersonnel(),
                        this.fetchInspections('brocamento', 'inspecoesBroca'),
                        this.fetchInspections('perda', 'inspecoesPerda'),
                        this.fetchInspectionPlans(),
                        this.fetchHarvestPlans(),
                        this.fetchCompanyLogo(),
                        App.state.userPermissions.includes('gerenciarUsuarios') ? this.fetchAllUsers() : Promise.resolve(),
                    ];

                    Promise.all(promises)
                        .then(() => {
                            App.logic.ui.showInitialTab();
                            App.logic.lancamentoBroca.loadFazendas();
                            App.logic.lancamentoPerda.loadFazendas();
                        })
                        .catch(error => {
                            console.error("Erro ao carregar dados iniciais:", error);
                            App.utils.showAlert('Erro ao carregar dados. Verifique a sua ligação.', 'error');
                        })
                        .finally(() => {
                            App.utils.showLoading(false);
                        });
                },

                _createSubscription(collectionName, stateKey, callback) {
                    const q = query(collection(db, collectionName));
                    const unsubscribe = onSnapshot(q, (querySnapshot) => {
                        App.state[stateKey] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        if (callback) callback();
                    }, (error) => {
                        console.error(`Erro ao buscar ${collectionName}: `, error);
                    });
                    App.state.unsubscribes.push(unsubscribe);
                },

                fetchFazendas() { this._createSubscription('fazendas', 'fazendas'); },
                fetchPersonnel() { this._createSubscription('personnel', 'personnel'); },
                fetchAllUsers() { this._createSubscription('users', 'users'); },
                fetchInspections(type, stateKey) { 
                    this._createSubscription(type, stateKey, () => {
                        if(document.getElementById('dashboard').classList.contains('active')) {
                            App.logic.dashboard.renderAllCharts();
                        }
                    });
                },
                fetchInspectionPlans() {
                    this._createSubscription('inspection_plans', 'inspectionPlans', () => {
                        if (document.getElementById('planejamento').classList.contains('active')) {
                            App.logic.planejamento.renderPlans();
                        }
                    });
                },
                fetchHarvestPlans() {
                    this._createSubscription('harvest_plans', 'harvestPlans', () => {
                        if (document.getElementById('planejamentoColheita').classList.contains('active')) {
                            App.logic.planejamentoColheita.renderPlanList();
                        }
                        if (document.getElementById('relatorioColheitaCustom').classList.contains('active')) {
                            App.logic.relatorioColheitaCustom.loadHarvestPlans();
                        }
                    });
                },
                async fetchCompanyLogo() {
                    try {
                        const configDoc = await getDoc(doc(db, 'config', 'company'));
                        if (configDoc.exists() && configDoc.data().logoUrl) {
                            App.state.companyLogoUrl = configDoc.data().logoUrl;
                        }
                    } catch (error) {
                        console.error("Erro ao buscar logotipo da empresa:", error);
                    }
                }
            },

            lancamentoBroca: {
                loadFazendas() {
                    const select = App.elements.codigo;
                    select.innerHTML = '<option value="">Selecione a Fazenda...</option>';
                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        select.appendChild(option);
                    });
                },
                calcularTotalBrocado() {
                    const base = parseInt(App.elements.brocaBase.value) || 0;
                    const meio = parseInt(App.elements.brocaMeio.value) || 0;
                    const topo = parseInt(App.elements.brocaTopo.value) || 0;
                    App.elements.brocado.value = base + meio + topo;
                },
                handleSave() {
                    const data = {
                        codigo: App.elements.codigo.value,
                        data: App.elements.data.value,
                        talhao: App.elements.talhao.value,
                        entrenos: parseInt(App.elements.entrenos.value),
                        brocaBase: parseInt(App.elements.brocaBase.value) || 0,
                        brocaMeio: parseInt(App.elements.brocaMeio.value) || 0,
                        brocaTopo: parseInt(App.elements.brocaTopo.value) || 0,
                        brocado: parseInt(App.elements.brocado.value),
                        responsavel: App.state.currentUser.email,
                        createdAt: serverTimestamp()
                    };

                    if (!data.codigo || !data.data || !data.talhao || isNaN(data.entrenos) || data.entrenos <= 0) {
                        App.utils.showAlert('Preencha todos os campos obrigatórios corretamente.', 'warning');
                        return;
                    }
                    
                    const brocamento = (data.brocado / data.entrenos) * 100;
                    App.elements.resultado.textContent = `Brocamento: ${brocamento.toFixed(2)}%`;

                    App.utils.showConfirmationModal(
                        'Confirmar Lançamento',
                        'Tem a certeza que deseja guardar este lançamento de brocamento?',
                        async () => {
                            App.utils.showLoading(true, 'A guardar...');
                            try {
                                const plan = App.state.inspectionPlans.find(p => 
                                    p.fazendaCode === data.codigo &&
                                    p.talhao.toLowerCase() === data.talhao.toLowerCase() &&
                                    p.status === 'pendente'
                                );
                                if (plan) {
                                    await updateDoc(doc(db, "inspection_plans", plan.id), { status: 'concluido' });
                                    App.utils.showAlert('Plano de inspeção atualizado para "Concluído".', 'info');
                                }

                                await addDoc(collection(db, "brocamento"), data);
                                App.utils.showAlert('Lançamento guardado com sucesso!', 'success');
                                this.clearForm();
                            } catch (error) {
                                console.error("Erro ao guardar brocamento: ", error);
                                App.utils.showAlert('Erro ao guardar lançamento.', 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                },
                clearForm() {
                    App.elements.codigo.value = '';
                    App.elements.data.value = '';
                    App.elements.talhao.value = '';
                    App.elements.entrenos.value = '';
                    App.elements.brocaBase.value = '';
                    App.elements.brocaMeio.value = '';
                    App.elements.brocaTopo.value = '';
                    App.elements.brocado.value = '';
                    App.elements.resultado.textContent = '';
                    App.elements.varietyDisplay.textContent = '';
                }
            },

            relatorioBroca: {
                loadFazendas() {
                    const select = App.elements.fazendaFiltroBrocamento;
                    const currentValue = select.value;
                    const allOption = select.querySelector('option[value=""]');
                    select.innerHTML = '';
                    if (allOption) select.appendChild(allOption);

                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        select.appendChild(option);
                    });
                    select.value = currentValue;
                },
                gerarRelatorio(format) {
                    const filters = {
                        fazenda: App.elements.fazendaFiltroBrocamento.value,
                        inicio: App.elements.inicioBrocamento.value,
                        fim: App.elements.fimBrocamento.value,
                        tipo: App.elements.tipoRelatorioBroca.value,
                        logoUrl: App.state.companyLogoUrl || ''
                    };

                    if (!filters.inicio || !filters.fim) {
                        App.utils.showAlert('As datas de início e fim são obrigatórias.', 'warning');
                        return;
                    }
                    
                    App.utils.fetchAndDownloadReport(`brocamento/${format}`, filters, `relatorio_brocamento.${format}`);
                }
            },

            lancamentoPerda: {
                loadFazendas() {
                    const select = App.elements.codigoPerda;
                    select.innerHTML = '<option value="">Selecione a Fazenda...</option>';
                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        select.appendChild(option);
                    });
                },
                fetchOperatorName() {
                    const matricula = App.elements.matriculaOperador.value;
                    const nameDisplay = App.elements.operadorNome;
                    if (!matricula) {
                        nameDisplay.textContent = '';
                        return;
                    }
                    const operator = App.state.personnel.find(p => p.matricula === matricula);
                    if (operator) {
                        nameDisplay.textContent = operator.name;
                        nameDisplay.style.color = 'var(--color-primary)';
                    } else {
                        nameDisplay.textContent = 'Operador não encontrado';
                        nameDisplay.style.color = 'var(--color-danger)';
                    }
                },
                handleSave() {
                    const operator = App.state.personnel.find(p => p.matricula === App.elements.matriculaOperador.value);

                    const data = {
                        data: App.elements.dataPerda.value,
                        codigo: App.elements.codigoPerda.value,
                        talhao: App.elements.talhaoPerda.value,
                        frenteServico: App.elements.frenteServico.value,
                        turno: App.elements.turno.value,
                        frotaEquipamento: App.elements.frotaEquipamento.value,
                        matriculaOperador: App.elements.matriculaOperador.value,
                        nomeOperador: operator ? operator.name : 'N/A',
                        canaInteira: parseFloat(App.elements.canaInteira.value) || 0,
                        tolete: parseFloat(App.elements.tolete.value) || 0,
                        toco: parseFloat(App.elements.toco.value) || 0,
                        ponta: parseFloat(App.elements.ponta.value) || 0,
                        estilhaco: parseFloat(App.elements.estilhaco.value) || 0,
                        pedaco: parseFloat(App.elements.pedaco.value) || 0,
                        responsavel: App.state.currentUser.email,
                        createdAt: serverTimestamp()
                    };

                    const totalPerda = data.canaInteira + data.tolete + data.toco + data.ponta + data.estilhaco + data.pedaco;
                    data.totalPerda = totalPerda;

                    if (!data.data || !data.codigo || !data.talhao || !data.frenteServico || !data.turno || !data.frotaEquipamento || !data.matriculaOperador) {
                        App.utils.showAlert('Preencha todos os campos obrigatórios.', 'warning');
                        return;
                    }
                    
                    App.elements.resultadoPerda.textContent = `Total de Perda: ${totalPerda.toFixed(2)} kg`;
                    
                    App.utils.showConfirmationModal(
                        'Confirmar Lançamento',
                        'Tem a certeza que deseja guardar este lançamento de perda?',
                        async () => {
                            App.utils.showLoading(true, 'A guardar...');
                            try {
                                const plan = App.state.inspectionPlans.find(p => 
                                    p.fazendaCode === data.codigo &&
                                    p.talhao.toLowerCase() === data.talhao.toLowerCase() &&
                                    p.status === 'pendente'
                                );
                                if (plan) {
                                    await updateDoc(doc(db, "inspection_plans", plan.id), { status: 'concluido' });
                                    App.utils.showAlert('Plano de inspeção atualizado para "Concluído".', 'info');
                                }

                                await addDoc(collection(db, "perda"), data);
                                App.utils.showAlert('Lançamento de perda guardado com sucesso!', 'success');
                                this.clearForm();
                            } catch (error) {
                                console.error("Erro ao guardar perda: ", error);
                                App.utils.showAlert('Erro ao guardar lançamento.', 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                },
                clearForm() {
                    document.getElementById('lancamentoPerda').querySelectorAll('input, select').forEach(el => {
                        if(el.type !== 'button' && el.tagName !== 'BUTTON') el.value = '';
                    });
                    App.elements.resultadoPerda.textContent = '';
                    App.elements.operadorNome.textContent = '';
                    App.elements.varietyDisplayPerda.textContent = '';
                }
            },

            relatorioPerda: {
                loadFilters() {
                    const fazendaSelect = App.elements.fazendaFiltroPerda;
                    const operadorSelect = App.elements.operadorFiltroPerda;

                    fazendaSelect.innerHTML = '<option value="">Todas</option>';
                    operadorSelect.innerHTML = '<option value="">Todos</option>';
                    
                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        fazendaSelect.appendChild(option);
                    });

                    const sortedPersonnel = [...App.state.personnel].sort((a, b) => a.name.localeCompare(b.name));
                    sortedPersonnel.forEach(person => {
                        const option = document.createElement('option');
                        option.value = person.matricula;
                        option.textContent = `${person.matricula} - ${person.name}`;
                        operadorSelect.appendChild(option);
                    });
                },
                gerarRelatorio(format) {
                    const filters = {
                        fazenda: App.elements.fazendaFiltroPerda.value,
                        talhao: App.elements.talhaoFiltroPerda.value,
                        operador: App.elements.operadorFiltroPerda.value,
                        frente: App.elements.frenteFiltroPerda.value,
                        inicio: App.elements.inicioPerda.value,
                        fim: App.elements.fimPerda.value,
                        tipo: App.elements.tipoRelatorioPerda.value,
                        logoUrl: App.state.companyLogoUrl || ''
                    };

                    if (!filters.inicio || !filters.fim) {
                        App.utils.showAlert('As datas de início e fim são obrigatórias.', 'warning');
                        return;
                    }

                    App.utils.fetchAndDownloadReport(`perda/${format}`, filters, `relatorio_perda.${format}`);
                }
            },
            
            relatorioColheitaCustom: {
                init() {
                    App.elements.btnGerarRelatorioCustomPDF.addEventListener('click', () => this.gerarRelatorio('pdf'));
                    App.elements.btnGerarRelatorioCustomExcel.addEventListener('click', () => this.gerarRelatorio('csv'));
                },

                // [FUNÇÃO ALTERADA]
                loadHarvestPlans() {
                    const select = App.elements.planoRelatorioSelect;
                    const currentValue = select.value; // Salva o valor selecionado
                    
                    // Limpa e adiciona a opção "Todos os Planos"
                    select.innerHTML = '<option value="">Selecione uma opção...</option>';
                    select.innerHTML += '<option value="all">TODOS OS PLANOS</option>';
                    
                    const plans = App.state.harvestPlans || [];
                    if (plans.length === 0) {
                        select.innerHTML += '<option value="" disabled>Nenhum plano de colheita encontrado</option>';
                    } else {
                        const sortedPlans = [...plans].sort((a, b) => a.name.localeCompare(b.name));
                        sortedPlans.forEach(plan => {
                            const option = document.createElement('option');
                            option.value = plan.id;
                            option.textContent = plan.name;
                            select.appendChild(option);
                        });
                    }
                    select.value = currentValue; // Restaura o valor selecionado
                },

                gerarRelatorio(format) {
                    const planId = App.elements.planoRelatorioSelect.value;
                    if (!planId) {
                        App.utils.showAlert('Por favor, selecione um plano de colheita ou "Todos os Planos".', 'warning');
                        return;
                    }

                    const selectedColumns = {};
                    document.querySelectorAll('#reportOptionsContainer input[type="checkbox"]').forEach(cb => {
                        selectedColumns[cb.dataset.column] = cb.checked;
                    });

                    const filters = {
                        planId: planId,
                        selectedColumns: JSON.stringify(selectedColumns),
                        logoUrl: App.state.companyLogoUrl || ''
                    };
                    
                    App.utils.fetchAndDownloadReport(`colheita/${format}`, filters, `relatorio_colheita_custom.${format}`);
                }
            },

            pwa: {
                registerServiceWorker() {
                    if ('serviceWorker' in navigator) {
                        window.addEventListener('load', () => {
                            navigator.serviceWorker.register('./service-worker.js')
                                .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
                                .catch(error => console.log('ServiceWorker registration failed: ', error));
                        });

                        window.addEventListener('beforeinstallprompt', (e) => {
                            e.preventDefault();
                            App.state.deferredInstallPrompt = e;
                            App.elements.installAppBtn.style.display = 'flex';
                        });
                    }
                },
                async promptInstall() {
                    if (App.state.deferredInstallPrompt) {
                        App.state.deferredInstallPrompt.prompt();
                        const { outcome } = await App.state.deferredInstallPrompt.userChoice;
                        if (outcome === 'accepted') {
                            App.utils.showAlert('Aplicação instalada com sucesso!', 'success');
                        }
                        App.state.deferredInstallPrompt = null;
                        App.elements.installAppBtn.style.display = 'none';
                    }
                }
            },

            theme: {
                init() {
                    App.elements.themeButtons.forEach(button => {
                        button.addEventListener('click', (e) => this.setTheme(e.currentTarget.id));
                    });
                    const savedTheme = localStorage.getItem('agrovetor_theme') || 'theme-green';
                    this.setTheme(savedTheme);
                },
                setTheme(themeId) {
                    document.body.className = ''; // Limpa todas as classes
                    const themeName = themeId.replace('theme-', '');
                    document.body.classList.add(themeName);
                    if (themeName === 'dark') {
                        document.body.classList.add('theme-dark');
                    }
                    localStorage.setItem('agrovetor_theme', themeId);
                    App.elements.themeButtons.forEach(btn => {
                        btn.classList.toggle('active', btn.id === themeId);
                    });
                    Object.values(App.state.charts).forEach(chart => {
                        if(chart) App.logic.dashboard.updateChartTheme(chart);
                    });
                }
            },
            
            excluir: {
                async loadEntries() {
                    const container = App.elements.listaExclusao;
                    container.innerHTML = '<p>A carregar lançamentos...</p>';
                    
                    const brocaEntries = App.state.inspecoesBroca.map(e => ({...e, type: 'brocamento', typeLabel: 'Broca'}));
                    const perdaEntries = App.state.inspecoesPerda.map(e => ({...e, type: 'perda', typeLabel: 'Perda'}));
                    
                    const allEntries = [...brocaEntries, ...perdaEntries];
                    allEntries.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

                    if(allEntries.length === 0) {
                        container.innerHTML = '<p>Nenhum lançamento encontrado.</p>';
                        return;
                    }

                    container.innerHTML = '';
                    allEntries.forEach(entry => {
                        const fazenda = App.state.fazendas.find(f => f.code == entry.codigo);
                        const card = document.createElement('div');
                        card.className = 'plano-card';
                        card.style.borderLeftColor = entry.type === 'brocamento' ? 'var(--color-danger)' : 'var(--color-warning)';
                        
                        const entryDate = entry.createdAt ? entry.createdAt.toDate().toLocaleString('pt-BR') : 'Data indisponível';

                        card.innerHTML = `
                            <div class="plano-header">
                                <span class="plano-title"><i class="fas fa-${entry.type === 'brocamento' ? 'bug' : 'dollar-sign'}"></i> ${entry.typeLabel}: ${fazenda ? fazenda.name : `Cód ${entry.codigo}`} - Talhão ${entry.talhao}</span>
                                <button class="btn-excluir" data-id="${entry.id}" data-type="${entry.type}"><i class="fas fa-trash"></i> Excluir</button>
                            </div>
                            <div class="plano-details" style="font-size: 13px;">
                                <div><i class="fas fa-calendar-alt"></i> <strong>Data Lanç.:</strong> ${entryDate}</div>
                                <div><i class="fas fa-user"></i> <strong>Responsável:</strong> ${entry.responsavel}</div>
                            </div>
                        `;
                        container.appendChild(card);
                    });

                    container.querySelectorAll('.btn-excluir').forEach(button => {
                        button.addEventListener('click', (e) => {
                            const id = e.currentTarget.dataset.id;
                            const type = e.currentTarget.dataset.type;
                            this.confirmDelete(id, type);
                        });
                    });
                },
                confirmDelete(id, type) {
                    App.utils.showConfirmationModal(
                        'Confirmar Exclusão',
                        `Tem a certeza que deseja excluir este lançamento de ${type}? Esta ação é irreversível.`,
                        async () => {
                            App.utils.showLoading(true, 'A excluir...');
                            try {
                                await deleteDoc(doc(db, type, id));
                                App.utils.showAlert('Lançamento excluído com sucesso!', 'success');
                            } catch (error) {
                                console.error("Erro ao excluir lançamento:", error);
                                App.utils.showAlert('Erro ao excluir lançamento.', 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                }
            },
            
            usuarios: {
                init() {
                    App.elements.btnCreateUser.addEventListener('click', () => this.handleCreateUser());
                    App.elements.userEditModalCloseBtn.addEventListener('click', () => this.closeUserEditModal());
                    App.elements.btnSaveUserChanges.addEventListener('click', () => this.saveUserChanges());
                    App.elements.btnResetPassword.addEventListener('click', () => this.handleResetPassword());
                    App.elements.btnDeleteUser.addEventListener('click', () => this.handleDeleteUser());
                    App.elements.changePasswordModalCloseBtn.addEventListener('click', () => this.closeChangePasswordModal());
                    App.elements.changePasswordModalCancelBtn.addEventListener('click', () => this.closeChangePasswordModal());
                    App.elements.changePasswordModalSaveBtn.addEventListener('click', () => this.performPasswordChange());
                    App.elements.adminPasswordConfirmModalCloseBtn.addEventListener('click', () => this.closeAdminPasswordConfirmModal());
                    App.elements.adminPasswordConfirmModalCancelBtn.addEventListener('click', () => this.closeAdminPasswordConfirmModal());
                },
                loadUsers() {
                    const container = App.elements.usersList;
                    container.innerHTML = '<p>A carregar utilizadores...</p>';
                    const users = App.state.users;

                    if (!users || users.length === 0) {
                        container.innerHTML = '<p>Nenhum utilizador encontrado.</p>';
                        return;
                    }

                    container.innerHTML = '';
                    users.forEach(user => {
                        const card = document.createElement('div');
                        card.className = 'user-card';
                        card.innerHTML = `
                            <div class="user-header">
                                <strong class="user-title">${user.email}</strong>
                                <span>Perfil: ${user.role || 'Utilizador'}</span>
                                <button class="btn-secondary" style="padding: 8px 12px; margin: 0;"><i class="fas fa-edit"></i> Editar</button>
                            </div>
                        `;
                        card.querySelector('button').addEventListener('click', () => this.openUserEditModal(user));
                        container.appendChild(card);
                    });
                },
                handleCreateUser() {
                    App.utils.showAdminPasswordConfirmModal(
                        'Confirmar Criação de Utilizador',
                        'Para criar um novo utilizador, por favor, confirme a sua senha de administrador.',
                        () => this.createUser()
                    );
                },
                async createUser() {
                    const email = App.elements.newUserUsername.value;
                    const password = App.elements.newUserPassword.value;
                    const role = App.elements.newUserRole.value;
                    const permissions = Array.from(App.elements.permissionCheckboxes)
                        .filter(cb => cb.checked)
                        .map(cb => cb.dataset.permission);

                    if (!email || !password) {
                        App.utils.showAlert('Email e senha são obrigatórios.', 'warning');
                        return;
                    }

                    App.utils.showLoading(true, 'A criar utilizador...');
                    try {
                        // A função `createUser` é uma função de backend que você precisa chamar.
                        // Aqui, simulamos a chamada.
                        const response = await fetch('https://us-central1-agrovetor-v2.cloudfunctions.net/createUser', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password, role, permissions })
                        });

                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.message || 'Erro ao criar utilizador.');
                        }

                        App.utils.showAlert('Utilizador criado com sucesso!', 'success');
                        App.elements.newUserUsername.value = '';
                        App.elements.newUserPassword.value = '';
                    } catch (error) {
                        console.error("Erro ao criar utilizador:", error);
                        App.utils.showAlert(error.message, 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                openUserEditModal(user) {
                    App.elements.editingUserId.value = user.id;
                    App.elements.editUserUsername.value = user.email;
                    App.elements.editUserRole.value = user.role || 'user';
                    
                    const permissionGrid = App.elements.editUserPermissionGrid;
                    permissionGrid.innerHTML = ''; // Limpa
                    const allPermissions = App.logic.usuarios.getAllPermissions();
                    allPermissions.forEach(p => {
                        const isChecked = user.permissions && user.permissions.includes(p.id);
                        const label = document.createElement('label');
                        label.className = 'permission-item';
                        label.innerHTML = `<input type="checkbox" data-permission="${p.id}" ${isChecked ? 'checked' : ''}> <i class="${p.icon}"></i> ${p.label}`;
                        permissionGrid.appendChild(label);
                    });

                    App.elements.userEditModal.classList.add('show');
                },
                closeUserEditModal() {
                    App.elements.userEditModal.classList.remove('show');
                },
                async saveUserChanges() {
                    const userId = App.elements.editingUserId.value;
                    const role = App.elements.editUserRole.value;
                    const permissions = Array.from(App.elements.editUserPermissionGrid.querySelectorAll('input:checked'))
                        .map(cb => cb.dataset.permission);

                    App.utils.showLoading(true, 'A guardar alterações...');
                    try {
                        const userRef = doc(db, 'users', userId);
                        await updateDoc(userRef, { role, permissions });
                        App.utils.showAlert('Utilizador atualizado com sucesso!', 'success');
                        this.closeUserEditModal();
                    } catch (error) {
                        console.error("Erro ao atualizar utilizador:", error);
                        App.utils.showAlert('Erro ao atualizar utilizador.', 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                handleResetPassword() {
                    const email = App.elements.editUserUsername.value;
                    App.utils.showConfirmationModal(
                        'Redefinir Senha',
                        `Tem a certeza que deseja enviar um email de redefinição de senha para ${email}?`,
                        async () => {
                            App.utils.showLoading(true, 'A enviar email...');
                            try {
                                await sendPasswordResetEmail(auth, email);
                                App.utils.showAlert('Email de redefinição de senha enviado!', 'success');
                            } catch (error) {
                                console.error("Erro ao redefinir senha:", error);
                                App.utils.showAlert('Erro ao enviar email de redefinição.', 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                },
                handleDeleteUser() {
                    const userId = App.elements.editingUserId.value;
                    const userEmail = App.elements.editUserUsername.value;
                     App.utils.showConfirmationModal(
                        'EXCLUIR UTILIZADOR',
                        `Esta ação é IRREVERSÍVEL. Tem a certeza absoluta que deseja excluir o utilizador ${userEmail}? Todos os dados associados podem ser perdidos.`,
                        async () => {
                            // A exclusão de um utilizador deve ser feita no backend por razões de segurança.
                            App.utils.showAlert('A funcionalidade de exclusão deve ser implementada no backend.', 'warning');
                        }
                    );
                },
                showChangePasswordModal() {
                    App.elements.changePasswordModal.classList.add('show');
                },
                closeChangePasswordModal() {
                    App.elements.changePasswordModal.classList.remove('show');
                    App.elements.currentPassword.value = '';
                    App.elements.newPassword.value = '';
                    App.elements.confirmNewPassword.value = '';
                },
                async performPasswordChange() {
                    const currentPass = App.elements.currentPassword.value;
                    const newPass = App.elements.newPassword.value;
                    const confirmNewPass = App.elements.confirmNewPassword.value;

                    if(newPass !== confirmNewPass) {
                        App.utils.showAlert('As novas senhas não coincidem.', 'warning');
                        return;
                    }
                    if(newPass.length < 6) {
                        App.utils.showAlert('A nova senha deve ter pelo menos 6 caracteres.', 'warning');
                        return;
                    }

                    App.utils.showLoading(true, 'A alterar senha...');
                    try {
                        const user = auth.currentUser;
                        const credential = EmailAuthProvider.credential(user.email, currentPass);
                        await reauthenticateWithCredential(user, credential);
                        await updatePassword(user, newPass);
                        App.utils.showAlert('Senha alterada com sucesso!', 'success');
                        this.closeChangePasswordModal();
                    } catch (error) {
                        console.error("Erro ao alterar senha:", error);
                        App.utils.showAlert('Erro ao alterar senha. Verifique a sua senha atual.', 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                getAllPermissions() {
                    return [
                        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-tachometer-alt' },
                        { id: 'planejamentoColheita', label: 'Colheita', icon: 'fas fa-tractor' },
                        { id: 'planejamento', label: 'Plan. Inspeção', icon: 'fas fa-calendar-alt' },
                        { id: 'lancamentoBroca', label: 'Lanç. Broca', icon: 'fas fa-bug' },
                        { id: 'lancamentoPerda', label: 'Lanç. Perda', icon: 'fas fa-dollar-sign' },
                        { id: 'relatorioBroca', label: 'Relatório Broca', icon: 'fas fa-chart-bar' },
                        { id: 'relatorioPerda', label: 'Relatório Perda', icon: 'fas fa-chart-pie' },
                        { id: 'excluir', label: 'Excluir Dados', icon: 'fas fa-trash' },
                        { id: 'gerenciarUsuarios', label: 'Gerir Utilizadores', icon: 'fas fa-users-cog' },
                        { id: 'configuracoes', label: 'Cadastros', icon: 'fas fa-cog' },
                        { id: 'cadastrarPessoas', label: 'Cadastrar Pessoas', icon: 'fas fa-id-card' }
                    ];
                },
            },
            
            cadastros: {
                init() {
                    // CSV Upload
                    App.elements.csvUploadArea.addEventListener('click', () => App.elements.csvFileInput.click());
                    App.elements.csvUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-primary)'; });
                    App.elements.csvUploadArea.addEventListener('dragleave', (e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; });
                    App.elements.csvUploadArea.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        if (e.dataTransfer.files.length) {
                            this.handleCsvUpload(e.dataTransfer.files[0]);
                        }
                    });
                    App.elements.csvFileInput.addEventListener('change', (e) => {
                        if (e.target.files.length) {
                            this.handleCsvUpload(e.target.files[0]);
                        }
                    });
                    App.elements.btnDownloadCsvTemplate.addEventListener('click', () => this.downloadCsvTemplate());

                    // Manual Farm/Talhão
                    App.elements.btnSaveFarm.addEventListener('click', () => this.saveFarm());
                    App.elements.farmSelect.addEventListener('change', (e) => this.displayTalhaoManagement(e.target.value));
                    App.elements.btnSaveTalhao.addEventListener('click', () => this.saveTalhao());
                    
                    // Personnel
                    this.personnel.init();
                },
                handleCsvUpload(file) {
                    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
                        App.utils.showAlert('Por favor, selecione um ficheiro CSV.', 'warning');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const csvData = event.target.result;
                        App.utils.showLoading(true, 'A processar ficheiro CSV...');
                        try {
                            const farms = this.parseCsv(csvData);
                            await this.batchUpdateFarms(farms);
                            App.utils.showAlert('Cadastros importados com sucesso!', 'success');
                        } catch (error) {
                            console.error("Erro ao processar CSV:", error);
                            App.utils.showAlert(`Erro no ficheiro CSV: ${error.message}`, 'error');
                        } finally {
                            App.utils.showLoading(false);
                        }
                    };
                    reader.readAsText(file, 'ISO-8859-1'); // Tenta com encoding latino
                },
                parseCsv(csvData) {
                    const lines = csvData.split(/\r\n|\n/);
                    const headers = lines[0].split(';').map(h => h.trim());
                    const requiredHeaders = ['Cód', 'FAZENDA', 'TALHÃO', 'Área', 'Produção', 'Variedade', 'Corte', 'Distancia', 'DataUltimaColheita'];
                    
                    // Validação simples dos cabeçalhos
                    if(requiredHeaders.some(h => !headers.includes(h))) {
                        throw new Error(`Cabeçalhos em falta. O ficheiro deve conter: ${requiredHeaders.join(', ')}`);
                    }

                    const farms = {};
                    for (let i = 1; i < lines.length; i++) {
                        if (!lines[i]) continue;
                        const values = lines[i].split(';');
                        const row = headers.reduce((obj, header, index) => {
                            obj[header] = values[index] ? values[index].trim() : '';
                            return obj;
                        }, {});

                        const farmCode = row['Cód'];
                        if (!farmCode) continue;

                        if (!farms[farmCode]) {
                            farms[farmCode] = {
                                code: farmCode,
                                name: row['FAZENDA'],
                                talhoes: []
                            };
                        }
                        
                        // Formata a data para YYYY-MM-DD
                        let formattedDate = '';
                        if (row['DataUltimaColheita']) {
                            const dateParts = row['DataUltimaColheita'].split('/');
                            if (dateParts.length === 3) {
                                formattedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
                            }
                        }

                        farms[farmCode].talhoes.push({
                            name: row['TALHÃO'],
                            area: parseFloat(row['Área']?.replace(',', '.')) || 0,
                            producao: parseFloat(row['Produção']?.replace(',', '.')) || 0,
                            variedade: row['Variedade'] || '',
                            corte: parseInt(row['Corte']) || 0,
                            distancia: parseFloat(row['Distancia']?.replace(',', '.')) || 0,
                            ultimaColheita: formattedDate
                        });
                    }
                    return Object.values(farms);
                },
                async batchUpdateFarms(farms) {
                    const batch = writeBatch(db);
                    farms.forEach(farmData => {
                        const farmRef = doc(db, "fazendas", farmData.code);
                        batch.set(farmRef, farmData, { merge: true });
                    });
                    await batch.commit();
                },
                downloadCsvTemplate() {
                    const headers = "Cód;FAZENDA;TALHÃO;Área;Produção;Variedade;Corte;Distancia;DataUltimaColheita";
                    const example = "4012;FAZ. LAGOA CERCADA;T-01;50,5;4500;RB92579;2;15,5;25/07/2023";
                    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${example}`;
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "modelo_cadastro_fazendas.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                },
                async saveFarm() {
                    const code = App.elements.farmCode.value;
                    const name = App.elements.farmName.value;
                    if (!code || !name) {
                        App.utils.showAlert('Código e Nome da Fazenda são obrigatórios.', 'warning');
                        return;
                    }
                    App.utils.showLoading(true, 'A guardar fazenda...');
                    try {
                        const farmRef = doc(db, "fazendas", code);
                        await setDoc(farmRef, { code, name, talhoes: [] }, { merge: true });
                        App.utils.showAlert('Fazenda guardada com sucesso!', 'success');
                        App.elements.farmCode.value = '';
                        App.elements.farmName.value = '';
                    } catch (error) {
                        console.error("Erro ao guardar fazenda:", error);
                        App.utils.showAlert('Erro ao guardar fazenda.', 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                loadFarmsForSelection() {
                    const select = App.elements.farmSelect;
                    select.innerHTML = '<option value="">Selecione uma fazenda...</option>';
                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        select.appendChild(option);
                    });
                },
                displayTalhaoManagement(farmCode) {
                    const container = App.elements.talhaoManagementContainer;
                    if (!farmCode) {
                        container.style.display = 'none';
                        return;
                    }
                    const farm = App.state.fazendas.find(f => f.code === farmCode);
                    if (!farm) return;

                    App.elements.selectedFarmName.textContent = farm.name;
                    this.renderTalhaoList(farm.talhoes || []);
                    container.style.display = 'block';
                },
                renderTalhaoList(talhoes) {
                    const listContainer = App.elements.talhaoList;
                    if (!talhoes || talhoes.length === 0) {
                        listContainer.innerHTML = '<p>Nenhum talhão cadastrado para esta fazenda.</p>';
                        return;
                    }
                    const table = document.createElement('table');
                    table.id = 'personnelTable'; // Reutilizando estilo
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Área (ha)</th>
                                <th>Variedade</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${talhoes.map(t => `
                                <tr>
                                    <td>${t.name}</td>
                                    <td>${t.area}</td>
                                    <td>${t.variedade}</td>
                                    <td>
                                        <button class="btn-secondary edit-talhao" style="padding: 4px 8px; font-size: 12px; margin:0 5px;"><i class="fas fa-edit"></i></button>
                                        <button class="btn-excluir delete-talhao" style="padding: 4px 8px; font-size: 12px; margin:0;"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    `;
                    listContainer.innerHTML = '';
                    listContainer.appendChild(table);

                    listContainer.querySelectorAll('.edit-talhao').forEach((btn, index) => {
                        btn.addEventListener('click', () => this.editTalhao(talhoes[index]));
                    });
                    listContainer.querySelectorAll('.delete-talhao').forEach((btn, index) => {
                        btn.addEventListener('click', () => this.deleteTalhao(talhoes[index].name));
                    });
                },
                editTalhao(talhao) {
                    App.elements.talhaoId.value = talhao.name; // Usa o nome como ID temporário
                    App.elements.talhaoName.value = talhao.name;
                    App.elements.talhaoArea.value = talhao.area;
                    App.elements.talhaoProducao.value = talhao.producao;
                    App.elements.talhaoVariedade.value = talhao.variedade;
                    App.elements.talhaoCorte.value = talhao.corte;
                    App.elements.talhaoDistancia.value = talhao.distancia;
                    App.elements.talhaoUltimaColheita.value = talhao.ultimaColheita;
                    App.elements.talhaoName.focus();
                },
                async saveTalhao() {
                    const farmCode = App.elements.farmSelect.value;
                    if (!farmCode) return;

                    const talhaoData = {
                        name: App.elements.talhaoName.value,
                        area: parseFloat(App.elements.talhaoArea.value) || 0,
                        producao: parseFloat(App.elements.talhaoProducao.value) || 0,
                        variedade: App.elements.talhaoVariedade.value,
                        corte: parseInt(App.elements.talhaoCorte.value) || 0,
                        distancia: parseFloat(App.elements.talhaoDistancia.value) || 0,
                        ultimaColheita: App.elements.talhaoUltimaColheita.value
                    };

                    if (!talhaoData.name) {
                        App.utils.showAlert('O nome do talhão é obrigatório.', 'warning');
                        return;
                    }

                    App.utils.showLoading(true, 'A guardar talhão...');
                    try {
                        const farmRef = doc(db, "fazendas", farmCode);
                        const farmDoc = await getDoc(farmRef);
                        if (farmDoc.exists()) {
                            const farmData = farmDoc.data();
                            const talhoes = farmData.talhoes || [];
                            const editingId = App.elements.talhaoId.value;
                            const existingIndex = talhoes.findIndex(t => t.name === editingId);

                            if (existingIndex > -1) {
                                talhoes[existingIndex] = talhaoData; // Atualiza
                            } else {
                                talhoes.push(talhaoData); // Adiciona
                            }
                            await updateDoc(farmRef, { talhoes });
                            App.utils.showAlert('Talhão guardado com sucesso!', 'success');
                            this.clearTalhaoForm();
                        }
                    } catch (error) {
                        console.error("Erro ao guardar talhão:", error);
                        App.utils.showAlert('Erro ao guardar talhão.', 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                async deleteTalhao(talhaoName) {
                    const farmCode = App.elements.farmSelect.value;
                    if (!farmCode) return;

                    App.utils.showConfirmationModal(
                        'Excluir Talhão',
                        `Tem a certeza que deseja excluir o talhão ${talhaoName}?`,
                        async () => {
                            App.utils.showLoading(true, 'A excluir talhão...');
                            try {
                                const farmRef = doc(db, "fazendas", farmCode);
                                const farmDoc = await getDoc(farmRef);
                                if (farmDoc.exists()) {
                                    const farmData = farmDoc.data();
                                    const talhoes = farmData.talhoes.filter(t => t.name !== talhaoName);
                                    await updateDoc(farmRef, { talhoes });
                                    App.utils.showAlert('Talhão excluído com sucesso!', 'success');
                                }
                            } catch (error) {
                                console.error("Erro ao excluir talhão:", error);
                                App.utils.showAlert('Erro ao excluir talhão.', 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                },
                clearTalhaoForm() {
                    App.elements.talhaoId.value = '';
                    App.elements.talhaoName.value = '';
                    App.elements.talhaoArea.value = '';
                    App.elements.talhaoProducao.value = '';
                    App.elements.talhaoVariedade.value = '';
                    App.elements.talhaoCorte.value = '';
                    App.elements.talhaoDistancia.value = '';
                    App.elements.talhaoUltimaColheita.value = '';
                },
                
                personnel: {
                    init() {
                        App.elements.personnelCsvUploadArea.addEventListener('click', () => App.elements.personnelCsvInput.click());
                        App.elements.personnelCsvUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-primary)'; });
                        App.elements.personnelCsvUploadArea.addEventListener('dragleave', (e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; });
                        App.elements.personnelCsvUploadArea.addEventListener('drop', (e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files.length) {
                                this.handleCsvUpload(e.dataTransfer.files[0]);
                            }
                        });
                        App.elements.personnelCsvInput.addEventListener('change', (e) => {
                            if (e.target.files.length) {
                                this.handleCsvUpload(e.target.files[0]);
                            }
                        });
                        App.elements.btnDownloadPersonnelCsvTemplate.addEventListener('click', () => this.downloadCsvTemplate());
                        App.elements.btnSavePersonnel.addEventListener('click', () => this.savePersonnel());
                    },
                    handleCsvUpload(file) {
                        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
                            App.utils.showAlert('Por favor, selecione um ficheiro CSV.', 'warning');
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                            const csvData = event.target.result;
                            App.utils.showLoading(true, 'A processar ficheiro CSV...');
                            try {
                                const people = this.parseCsv(csvData);
                                await this.batchUpdatePersonnel(people);
                                App.utils.showAlert('Pessoas importadas com sucesso!', 'success');
                            } catch (error) {
                                console.error("Erro ao processar CSV de pessoal:", error);
                                App.utils.showAlert(`Erro no ficheiro CSV: ${error.message}`, 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        };
                        reader.readAsText(file, 'ISO-8859-1');
                    },
                    parseCsv(csvData) {
                        const lines = csvData.split(/\r\n|\n/);
                        const headers = lines[0].split(';').map(h => h.trim());
                        if (headers[0] !== 'Matricula' || headers[1] !== 'Nome') {
                            throw new Error('Formato de cabeçalho inválido. Use "Matricula;Nome".');
                        }
                        const people = [];
                        for (let i = 1; i < lines.length; i++) {
                            if (!lines[i]) continue;
                            const values = lines[i].split(';');
                            const matricula = values[0]?.trim();
                            const name = values[1]?.trim();
                            if (matricula && name) {
                                people.push({ matricula, name });
                            }
                        }
                        return people;
                    },
                    async batchUpdatePersonnel(people) {
                        const batch = writeBatch(db);
                        people.forEach(person => {
                            const personRef = doc(db, "personnel", person.matricula);
                            batch.set(personRef, person);
                        });
                        await batch.commit();
                    },
                    downloadCsvTemplate() {
                        const csvContent = `data:text/csv;charset=utf-8,Matricula;Nome\n102030;João da Silva`;
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", "modelo_cadastro_pessoas.csv");
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    },
                    loadPersonnel() {
                        const container = App.elements.personnelList;
                        const people = App.state.personnel;
                        if (!people || people.length === 0) {
                            container.innerHTML = '<p>Nenhuma pessoa cadastrada.</p>';
                            return;
                        }
                        const table = document.createElement('table');
                        table.id = 'personnelTable';
                        table.innerHTML = `
                            <thead><tr><th>Matrícula</th><th>Nome</th><th>Ação</th></tr></thead>
                            <tbody>
                                ${people.sort((a,b) => a.name.localeCompare(b.name)).map(p => `
                                    <tr>
                                        <td>${p.matricula}</td>
                                        <td>${p.name}</td>
                                        <td>
                                            <button class="btn-secondary edit-personnel" style="padding: 4px 8px; font-size: 12px; margin:0 5px;"><i class="fas fa-edit"></i></button>
                                            <button class="btn-excluir delete-personnel" style="padding: 4px 8px; font-size: 12px; margin:0;"><i class="fas fa-trash"></i></button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        `;
                        container.innerHTML = '';
                        container.appendChild(table);

                        container.querySelectorAll('.edit-personnel').forEach((btn, index) => {
                            btn.addEventListener('click', () => this.editPersonnel(people[index]));
                        });
                        container.querySelectorAll('.delete-personnel').forEach((btn, index) => {
                            btn.addEventListener('click', () => this.deletePersonnel(people[index].matricula));
                        });
                    },
                    editPersonnel(person) {
                        App.elements.personnelId.value = person.matricula;
                        App.elements.personnelMatricula.value = person.matricula;
                        App.elements.personnelMatricula.disabled = true;
                        App.elements.personnelName.value = person.name;
                        App.elements.personnelName.focus();
                    },
                    async savePersonnel() {
                        const id = App.elements.personnelId.value;
                        const matricula = App.elements.personnelMatricula.value;
                        const name = App.elements.personnelName.value;

                        if (!matricula || !name) {
                            App.utils.showAlert('Matrícula and Nome são obrigatórios.', 'warning');
                            return;
                        }

                        App.utils.showLoading(true, 'A guardar pessoa...');
                        try {
                            const personRef = doc(db, "personnel", matricula);
                            await setDoc(personRef, { matricula, name });
                            App.utils.showAlert('Pessoa guardada com sucesso!', 'success');
                            this.clearPersonnelForm();
                        } catch (error) {
                            console.error("Erro ao guardar pessoa:", error);
                            App.utils.showAlert('Erro ao guardar pessoa.', 'error');
                        } finally {
                            App.utils.showLoading(false);
                        }
                    },
                    async deletePersonnel(matricula) {
                        App.utils.showConfirmationModal(
                            'Excluir Pessoa',
                            `Tem a certeza que deseja excluir a pessoa com matrícula ${matricula}?`,
                            async () => {
                                App.utils.showLoading(true, 'A excluir...');
                                try {
                                    await deleteDoc(doc(db, "personnel", matricula));
                                    App.utils.showAlert('Pessoa excluída com sucesso!', 'success');
                                } catch (error) {
                                    console.error("Erro ao excluir pessoa:", error);
                                    App.utils.showAlert('Erro ao excluir pessoa.', 'error');
                                } finally {
                                    App.utils.showLoading(false);
                                }
                            }
                        );
                    },
                    clearPersonnelForm() {
                        App.elements.personnelId.value = '';
                        App.elements.personnelMatricula.value = '';
                        App.elements.personnelMatricula.disabled = false;
                        App.elements.personnelName.value = '';
                    }
                }
            },
            
            configuracoes: {
                init() {
                    App.elements.logoUploadArea.addEventListener('click', () => App.elements.logoInput.click());
                    App.elements.logoInput.addEventListener('change', (e) => {
                        if (e.target.files.length) {
                            this.handleLogoUpload(e.target.files[0]);
                        }
                    });
                    App.elements.removeLogoBtn.addEventListener('click', () => this.removeLogo());
                },
                async loadLogo() {
                    App.utils.showLoading(true, 'A carregar configurações...');
                    try {
                        await App.logic.data.fetchCompanyLogo();
                        if (App.state.companyLogoUrl) {
                            App.elements.logoPreview.src = App.state.companyLogoUrl;
                            App.elements.logoPreview.style.display = 'block';
                            App.elements.removeLogoBtn.style.display = 'inline-flex';
                        } else {
                            App.elements.logoPreview.style.display = 'none';
                            App.elements.removeLogoBtn.style.display = 'none';
                        }
                    } catch (error) {
                        console.error("Erro ao carregar logo:", error);
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                handleLogoUpload(file) {
                    if (!file.type.startsWith('image/')) {
                        App.utils.showAlert('Por favor, selecione um ficheiro de imagem.', 'warning');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const base64String = e.target.result;
                        App.utils.showLoading(true, 'A fazer upload do logo...');
                        try {
                            const logoRef = ref(storage, 'config/company_logo.png');
                            const snapshot = await uploadString(logoRef, base64String, 'data_url');
                            const downloadURL = await getDownloadURL(snapshot.ref);
                            
                            await setDoc(doc(db, 'config', 'company'), { logoUrl: downloadURL });
                            App.state.companyLogoUrl = downloadURL;
                            
                            App.elements.logoPreview.src = downloadURL;
                            App.elements.logoPreview.style.display = 'block';
                            App.elements.removeLogoBtn.style.display = 'inline-flex';
                            App.utils.showAlert('Logo atualizado com sucesso!', 'success');
                        } catch (error) {
                            console.error("Erro no upload do logo:", error);
                            App.utils.showAlert('Erro ao fazer upload do logo.', 'error');
                        } finally {
                            App.utils.showLoading(false);
                        }
                    };
                    reader.readAsDataURL(file);
                },
                async removeLogo() {
                    App.utils.showConfirmationModal(
                        'Remover Logo',
                        'Tem a certeza que deseja remover o logotipo da empresa?',
                        async () => {
                            App.utils.showLoading(true, 'A remover logo...');
                            try {
                                const logoRef = ref(storage, 'config/company_logo.png');
                                await deleteObject(logoRef);
                                await deleteDoc(doc(db, 'config', 'company'));
                                
                                App.state.companyLogoUrl = '';
                                App.elements.logoPreview.src = '#';
                                App.elements.logoPreview.style.display = 'none';
                                App.elements.removeLogoBtn.style.display = 'none';
                                App.utils.showAlert('Logo removido com sucesso!', 'success');
                            } catch (error) {
                                if (error.code === 'storage/object-not-found') {
                                    // Se o objeto não existe no storage, apenas limpa do DB
                                    await deleteDoc(doc(db, 'config', 'company'));
                                    App.utils.showAlert('Logo removido com sucesso!', 'success');
                                } else {
                                    console.error("Erro ao remover logo:", error);
                                    App.utils.showAlert('Erro ao remover logo.', 'error');
                                }
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                }
            },
            
            planejamento: {
                init() {
                    App.elements.btnAgendarInspecao.addEventListener('click', () => this.savePlan());
                },
                loadSelects() {
                    const fazendaSelect = App.elements.planoFazenda;
                    const responsavelSelect = App.elements.planoResponsavel;

                    fazendaSelect.innerHTML = '<option value="">Selecione a Fazenda...</option>';
                    responsavelSelect.innerHTML = '<option value="">Selecione o Responsável...</option>';

                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        fazendaSelect.appendChild(option);
                    });

                    const users = App.state.users.filter(u => u.role === 'tecnico' || u.role === 'supervisor' || u.role === 'admin');
                    users.sort((a,b) => a.email.localeCompare(b.email));
                    users.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.email;
                        option.textContent = user.email;
                        responsavelSelect.appendChild(option);
                    });
                },
                async savePlan() {
                    const plan = {
                        type: App.elements.planoTipo.value,
                        fazendaCode: App.elements.planoFazenda.value,
                        talhao: App.elements.planoTalhao.value,
                        dataPrevista: App.elements.planoData.value,
                        responsavel: App.elements.planoResponsavel.value,
                        meta: App.elements.planoMeta.value,
                        obs: App.elements.planoObs.value,
                        status: 'pendente', // pendente, concluido, atrasado
                        createdAt: serverTimestamp(),
                        createdBy: App.state.currentUser.email
                    };

                    if (!plan.type || !plan.fazendaCode || !plan.talhao || !plan.dataPrevista || !plan.responsavel) {
                        App.utils.showAlert('Preencha todos os campos obrigatórios.', 'warning');
                        return;
                    }
                    
                    App.utils.showLoading(true, 'A agendar inspeção...');
                    try {
                        await addDoc(collection(db, "inspection_plans"), plan);
                        App.utils.showAlert('Inspeção agendada com sucesso!', 'success');
                        this.clearForm();
                    } catch (error) {
                        console.error("Erro ao agendar inspeção:", error);
                        App.utils.showAlert('Erro ao agendar inspeção.', 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                renderPlans() {
                    const container = App.elements.listaPlanejamento;
                    container.innerHTML = '';
                    const plans = App.state.inspectionPlans;

                    if (!plans || plans.length === 0) {
                        container.innerHTML = '<p>Nenhuma inspeção agendada.</p>';
                        return;
                    }
                    
                    plans.sort((a, b) => new Date(a.dataPrevista) - new Date(b.dataPrevista));

                    plans.forEach(plan => {
                        const fazenda = App.state.fazendas.find(f => f.code === plan.fazendaCode);
                        const card = document.createElement('div');
                        card.className = 'plano-card';
                        
                        const hoje = new Date();
                        hoje.setHours(0,0,0,0);
                        const dataPrevista = new Date(plan.dataPrevista + 'T00:00:00');
                        let statusClass = plan.status;
                        if (plan.status === 'pendente' && dataPrevista < hoje) {
                            statusClass = 'atrasado';
                        }
                        
                        card.innerHTML = `
                            <div class="plano-header">
                                <span class="plano-title"><i class="fas fa-clipboard-list"></i> ${fazenda ? fazenda.name : `Cód ${plan.fazendaCode}`} - Talhão ${plan.talhao}</span>
                                <span class="plano-status ${statusClass}">${statusClass}</span>
                            </div>
                            <div class="plano-details">
                                <div><i class="fas fa-tag"></i> <strong>Tipo:</strong> ${plan.type}</div>
                                <div><i class="fas fa-calendar-check"></i> <strong>Data:</strong> ${new Date(plan.dataPrevista + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                                <div><i class="fas fa-user-shield"></i> <strong>Responsável:</strong> ${plan.responsavel}</div>
                                ${plan.meta ? `<div><i class="fas fa-bullseye"></i> <strong>Meta:</strong> ${plan.meta}</div>` : ''}
                            </div>
                            ${plan.obs ? `<p style="font-size:14px; margin-top:10px; color: var(--color-text-light);"><i class="fas fa-info-circle"></i> ${plan.obs}</p>` : ''}
                            <div class="plano-actions">
                                ${plan.status === 'pendente' ? `<button class="btn-secondary complete-plan" style="background: var(--color-success); padding: 6px 10px; font-size: 12px;"><i class="fas fa-check"></i> Marcar como Concluído</button>` : ''}
                                <button class="btn-excluir delete-plan" style="padding: 6px 10px; font-size: 12px;"><i class="fas fa-trash"></i> Excluir</button>
                            </div>
                        `;
                        container.appendChild(card);

                        const completeBtn = card.querySelector('.complete-plan');
                        if(completeBtn) {
                            completeBtn.addEventListener('click', () => this.updatePlanStatus(plan.id, 'concluido'));
                        }
                        card.querySelector('.delete-plan').addEventListener('click', () => this.deletePlan(plan.id));
                    });
                },
                async updatePlanStatus(planId, status) {
                    App.utils.showLoading(true, 'A atualizar...');
                    try {
                        const planRef = doc(db, "inspection_plans", planId);
                        await updateDoc(planRef, { status });
                        App.utils.showAlert('Plano atualizado com sucesso!', 'success');
                    } catch (error) {
                        console.error("Erro ao atualizar plano:", error);
                        App.utils.showAlert('Erro ao atualizar plano.', 'error');
                    } finally {
                        App.utils.showLoading(false);
                    }
                },
                deletePlan(planId) {
                    App.utils.showConfirmationModal(
                        'Excluir Plano',
                        'Tem a certeza que deseja excluir este plano de inspeção?',
                        async () => {
                            App.utils.showLoading(true, 'A excluir...');
                            try {
                                await deleteDoc(doc(db, "inspection_plans", planId));
                                App.utils.showAlert('Plano excluído com sucesso!', 'success');
                            } catch (error) {
                                console.error("Erro ao excluir plano:", error);
                                App.utils.showAlert('Erro ao excluir plano.', 'error');
                            } finally {
                                App.utils.showLoading(false);
                            }
                        }
                    );
                },
                clearForm() {
                    App.elements.planoTipo.value = 'broca';
                    App.elements.planoFazenda.value = '';
                    App.elements.planoTalhao.value = '';
                    App.elements.planoData.value = '';
                    App.elements.planoResponsavel.value = '';
                    App.elements.planoMeta.value = '';
                    App.elements.planoObs.value = '';
                }
            },
            
            dashboard: {
                init() {
                    App.elements.btnAnalisarDashboard.addEventListener('click', () => this.getAIAnalysis());
                    document.querySelectorAll('.btn-expand-chart').forEach(btn => {
                        btn.addEventListener('click', (e) => this.expandChart(e.currentTarget.dataset.chartId));
                    });
                    App.elements.chartModalCloseBtn.addEventListener('click', () => this.closeChartModal());
                },
                renderAllCharts() {
                    this.renderKPIs();
                    this.renderChart('graficoBrocamento', this.getTopFarmsBrocamentoData);
                    this.renderChart('graficoPerda', this.getTopFarmsPerdaData);
                    this.renderChart('graficoEvolucaoMensal', this.getEvolucaoMensalData);
                    this.renderChart('graficoInspecoesResponsavel', this.getInspecoesResponsavelData);
                    this.renderChart('graficoPerdaPorTipo', this.getPerdaPorTipoData);
                    this.renderChart('graficoTopOperadores', this.getTopOperadoresData);
                },
                renderKPIs() {
                    // KPI Brocamento
                    const totalEntrenos = App.state.inspecoesBroca.reduce((sum, item) => sum + item.entrenos, 0);
                    const totalBrocados = App.state.inspecoesBroca.reduce((sum, item) => sum + item.brocado, 0);
                    const mediaBrocamento = totalEntrenos > 0 ? (totalBrocados / totalEntrenos) * 100 : 0;
                    App.elements.kpiBrocamento.innerHTML = this.createKpiCard('bug', 'Média Brocamento', `${mediaBrocamento.toFixed(2)}%`, 'var(--color-danger)');

                    // KPI Perda
                    const totalPerdaKg = App.state.inspecoesPerda.reduce((sum, item) => sum + item.totalPerda, 0);
                    App.elements.kpiPerda.innerHTML = this.createKpiCard('balance-scale', 'Perda Total', `${(totalPerdaKg / 1000).toFixed(2)} ton`, 'var(--color-warning)');
                    
                    // KPI Inspeções
                    const totalInspecoes = App.state.inspecoesBroca.length + App.state.inspecoesPerda.length;
                    App.elements.kpiInspecoes.innerHTML = this.createKpiCard('clipboard-check', 'Total Inspeções', totalInspecoes, 'var(--color-info)');

                    // KPI Fazendas
                    const totalFazendas = App.state.fazendas.length;
                    App.elements.kpiFazendas.innerHTML = this.createKpiCard('tractor', 'Total Fazendas', totalFazendas, 'var(--color-primary)');
                },
                createKpiCard(icon, label, value, color) {
                    return `
                        <div class="icon" style="background-color: ${color};"><i class="fas fa-${icon}"></i></div>
                        <div class="text">
                            <div class="value">${value}</div>
                            <div class="label">${label}</div>
                        </div>
                    `;
                },
                renderChart(canvasId, dataFunction) {
                    const ctx = document.getElementById(canvasId)?.getContext('2d');
                    if (!ctx) return;
                    
                    const data = dataFunction.call(this);
                    if (App.state.charts[canvasId]) {
                        App.state.charts[canvasId].destroy();
                    }
                    
                    const chartConfig = {
                        type: data.type,
                        data: data.data,
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    position: 'top',
                                    labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text') }
                                },
                                datalabels: {
                                    display: data.type === 'bar',
                                    color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-light'),
                                    anchor: 'end',
                                    align: 'top',
                                    formatter: (value) => value.toFixed(2)
                                }
                            },
                            scales: data.type === 'bar' || data.type === 'line' ? {
                                y: {
                                    beginAtZero: true,
                                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-light') },
                                    grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-border') }
                                },
                                x: {
                                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-light') },
                                    grid: { display: false }
                                }
                            } : {}
                        },
                        plugins: [ChartDataLabels]
                    };
                    
                    App.state.charts[canvasId] = new Chart(ctx, chartConfig);
                },
                updateChartTheme(chart) {
                    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text');
                    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border');
                    chart.options.plugins.legend.labels.color = textColor;
                    if (chart.options.scales) {
                        chart.options.scales.y.ticks.color = textColor;
                        chart.options.scales.y.grid.color = borderColor;
                        chart.options.scales.x.ticks.color = textColor;
                    }
                    chart.update();
                },
                getTopFarmsBrocamentoData() { /* ... Lógica para dados do gráfico ... */ return {type: 'bar', data: { labels: [], datasets: []}}; },
                getTopFarmsPerdaData() { /* ... Lógica para dados do gráfico ... */ return {type: 'bar', data: { labels: [], datasets: []}}; },
                getEvolucaoMensalData() { /* ... Lógica para dados do gráfico ... */ return {type: 'line', data: { labels: [], datasets: []}}; },
                getInspecoesResponsavelData() { /* ... Lógica para dados do gráfico ... */ return {type: 'pie', data: { labels: [], datasets: []}}; },
                getPerdaPorTipoData() { /* ... Lógica para dados do gráfico ... */ return {type: 'doughnut', data: { labels: [], datasets: []}}; },
                getTopOperadoresData() { /* ... Lógica para dados do gráfico ... */ return {type: 'bar', data: { labels: [], datasets: []}}; },
                getAIAnalysis() { /* ... Lógica para análise com IA ... */ },
                expandChart(canvasId) { /* ... Lógica para expandir gráfico ... */ },
                closeChartModal() { /* ... Lógica para fechar modal do gráfico ... */ }
            },
            
            planejamentoColheita: {
                init() {
                    this.loadFazendasSelect();
                },
                initEventListeners() {
                    App.elements.btnAddNewHarvestPlan.addEventListener('click', () => this.showPlanEditor());
                    App.elements.btnCancelHarvestPlan.addEventListener('click', () => this.hidePlanEditor());
                    App.elements.btnSaveHarvestPlan.addEventListener('click', () => this.saveHarvestPlan());
                    App.elements.harvestFazenda.addEventListener('change', (e) => this.loadTalhoesForSelection(e.target.value));
                    App.elements.btnAddOrUpdateHarvestSequence.addEventListener('click', () => this.addOrUpdateSequenceGroup());
                    App.elements.btnCancelEditSequence.addEventListener('click', () => this.cancelEditSequence());
                },
                showPlanEditor(plan = null) {
                    App.elements.harvestPlansListContainer.style.display = 'none';
                    App.elements.harvestPlanEditor.style.display = 'block';
                    if (plan) {
                        App.state.currentHarvestPlan = plan;
                        this.populateEditor(plan);
                    } else {
                        App.state.currentHarvestPlan = this.getNewPlanStructure();
                        this.populateEditor(App.state.currentHarvestPlan);
                    }
                },
                hidePlanEditor() {
                    App.elements.harvestPlansListContainer.style.display = 'block';
                    App.elements.harvestPlanEditor.style.display = 'none';
                    App.state.currentHarvestPlan = null;
                    this.clearEditor();
                },
                populateEditor(plan) {
                    this.clearEditor();
                    App.elements.harvestFrontName.value = plan.name;
                    App.elements.harvestStartDate.value = plan.startDate;
                    App.elements.harvestDailyRate.value = plan.dailyRate;
                    this.renderSequenceTable();
                },
                clearEditor() {
                    App.elements.harvestFrontName.value = '';
                    App.elements.harvestStartDate.value = '';
                    App.elements.harvestDailyRate.value = 750;
                    App.elements.harvestPlanTableBody.innerHTML = '';
                    App.elements.harvestSummary.innerHTML = '';
                    this.cancelEditSequence();
                },
                getNewPlanStructure() {
                    return { id: null, name: '', startDate: '', dailyRate: 750, sequence: [], createdAt: serverTimestamp(), createdBy: App.state.currentUser.email };
                },
                loadFazendasSelect() {
                    const select = App.elements.harvestFazenda;
                    select.innerHTML = '<option value="">Selecione a Fazenda...</option>';
                    const sortedFarms = [...App.state.fazendas].sort((a, b) => a.name.localeCompare(b.name));
                    sortedFarms.forEach(fazenda => {
                        const option = document.createElement('option');
                        option.value = fazenda.code;
                        option.textContent = `${fazenda.code} - ${fazenda.name}`;
                        select.appendChild(option);
                    });
                },
                loadTalhoesForSelection(farmCode) { /* ... Lógica para carregar talhões ... */ },
                addOrUpdateSequenceGroup() { /* ... Lógica para adicionar/atualizar sequência ... */ },
                cancelEditSequence() { /* ... Lógica para cancelar edição de sequência ... */ },
                renderSequenceTable() { /* ... Lógica para renderizar tabela de sequência ... */ },
                renderPlanList() { /* ... Lógica para renderizar lista de planos ... */ },
                async saveHarvestPlan() { /* ... Lógica para salvar plano de colheita ... */ },
                deleteHarvestPlan(planId) { /* ... Lógica para deletar plano de colheita ... */ }
            }
        },

        utils: {
            showLoading(show, text = 'A processar...') {
                App.elements.loadingOverlay.style.display = show ? 'flex' : 'none';
                App.elements.loadingProgressText.textContent = text;
            },
            showAlert(message, type = 'success', duration = 4000) {
                const container = App.elements.alertContainer;
                container.innerHTML = ''; // Limpa conteúdo anterior
                container.className = `show ${type}`;

                const icon = document.createElement('i');
                const icons = {
                    success: 'fas fa-check-circle',
                    error: 'fas fa-times-circle',
                    warning: 'fas fa-exclamation-triangle',
                    info: 'fas fa-info-circle'
                };
                icon.className = icons[type] || icons.info;
                container.appendChild(icon);

                const textNode = document.createTextNode(` ${message}`);
                container.appendChild(textNode);

                setTimeout(() => {
                    container.classList.remove('show');
                }, duration);
            },
            translateAuthError(code) {
                const messages = {
                    'auth/user-not-found': 'Email ou senha incorretos.',
                    'auth/wrong-password': 'Email ou senha incorretos.',
                    'auth/invalid-credential': 'Email ou senha incorretos.',
                    'auth/invalid-email': 'Formato de email inválido.',
                    'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
                    'auth/email-already-in-use': 'Este email já está a ser utilizado.'
                };
                return messages[code] || 'Ocorreu um erro. Tente novamente.';
            },
            showConfirmationModal(title, message, onConfirm) {
                App.elements.confirmationModalTitle.textContent = title;
                App.elements.confirmationModalMessage.textContent = message;
                App.elements.confirmationModal.classList.add('show');

                const newConfirmBtn = App.elements.confirmationModalConfirmBtn.cloneNode(true);
                App.elements.confirmationModalConfirmBtn.parentNode.replaceChild(newConfirmBtn, App.elements.confirmationModalConfirmBtn);
                App.elements.confirmationModalConfirmBtn = newConfirmBtn;

                App.elements.confirmationModalConfirmBtn.onclick = () => {
                    App.elements.confirmationModal.classList.remove('show');
                    onConfirm();
                };

                const closeModal = () => App.elements.confirmationModal.classList.remove('show');
                App.elements.confirmationModalCancelBtn.onclick = closeModal;
                App.elements.confirmationModalCloseBtn.onclick = closeModal;
            },
            showAdminPasswordConfirmModal(title, message, onConfirm) {
                // Similar a showConfirmationModal, mas para o modal de senha de admin
                const modal = App.elements.adminPasswordConfirmModal;
                modal.querySelector('h2').textContent = title;
                modal.querySelector('p').textContent = message;
                modal.classList.add('show');

                const newConfirmBtn = App.elements.adminPasswordConfirmModalConfirmBtn.cloneNode(true);
                App.elements.adminPasswordConfirmModalConfirmBtn.parentNode.replaceChild(newConfirmBtn, App.elements.adminPasswordConfirmModalConfirmBtn);
                App.elements.adminPasswordConfirmModalConfirmBtn = newConfirmBtn;

                App.elements.adminPasswordConfirmModalConfirmBtn.onclick = async () => {
                    const password = App.elements.adminConfirmPassword.value;
                    if (!password) {
                        App.utils.showAlert('Por favor, insira a sua senha.', 'warning');
                        return;
                    }
                    try {
                        const user = auth.currentUser;
                        const credential = EmailAuthProvider.credential(user.email, password);
                        await reauthenticateWithCredential(user, credential);
                        modal.classList.remove('show');
                        App.elements.adminConfirmPassword.value = '';
                        onConfirm();
                    } catch (error) {
                        App.utils.showAlert('Senha de administrador incorreta.', 'error');
                    }
                };
            },
            closeAdminPasswordConfirmModal() {
                 App.elements.adminPasswordConfirmModal.classList.remove('show');
                 App.elements.adminConfirmPassword.value = '';
            },
            updateDateTime() {
                const now = new Date();
                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                App.elements.currentDateTime.innerHTML = `<i class="fas fa-clock"></i> ${now.toLocaleDateString('pt-BR', options)}`;
            },
            async fetchVariety(farmCode, talhaoName, displayElement) {
                if (!farmCode || !talhaoName) {
                    displayElement.textContent = '';
                    return;
                }
                const farm = App.state.fazendas.find(f => f.code === farmCode);
                if (farm && farm.talhoes) {
                    const talhao = farm.talhoes.find(t => t.name && t.name.toLowerCase() === talhaoName.toLowerCase());
                    if (talhao && talhao.variedade) {
                        displayElement.textContent = `Variedade: ${talhao.variedade}`;
                        displayElement.style.color = 'var(--color-primary)';
                    } else {
                        displayElement.textContent = 'Variedade não encontrada';
                        displayElement.style.color = 'var(--color-warning)';
                    }
                } else {
                    displayElement.textContent = '';
                }
            },
            fetchAndDownloadReport(urlPath, filters, filename) {
                App.utils.showLoading(true, `A gerar ${filename}...`);
                const baseUrl = 'https://agrovetor-backend-1.onrender.com';
                const url = new URL(`${baseUrl}/${urlPath}`);
                Object.keys(filters).forEach(key => url.searchParams.append(key, filters[key]));

                fetch(url)
                    .then(res => {
                        if (!res.ok) {
                            return res.text().then(text => { throw new Error(text || 'Erro no servidor') });
                        }
                        return res.blob();
                    })
                    .then(blob => {
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(link.href);
                        App.utils.showAlert('Relatório gerado com sucesso!', 'success');
                    })
                    .catch(err => {
                        console.error(`Erro ao gerar ${filename}:`, err);
                        App.utils.showAlert(`Erro ao gerar relatório: ${err.message}`, 'error');
                    })
                    .finally(() => {
                        App.utils.showLoading(false);
                    });
            }
        }
    };

    App.init();
});
