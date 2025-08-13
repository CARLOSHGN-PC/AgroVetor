// FIREBASE: Importe os módulos necessários do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, getDocs, enableIndexedDbPersistence, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
// Importa a biblioteca para facilitar o uso do IndexedDB (cache offline)
import { openDB } from 'https://unpkg.com/idb@7.1.1/build/index.js';

document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = {
        apiKey: "AIzaSyBFXgXKDIBo9JD9vuGik5VDYZFDb_tbCrY",
        authDomain: "agrovetor-v2.firebaseapp.com",
        projectId: "agrovetor-v2",
        storageBucket: "agrovetor-v2.firebasestorage.app",
        messagingSenderId: "782518751171",
        appId: "1:782518751171:web:d501ee31c1db33da4eb776",
        measurementId: "G-JN4MSW63JR"
    };

    const firebaseApp = initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);
    const auth = getAuth(firebaseApp);
    const storage = getStorage(firebaseApp);
    
    const secondaryApp = initializeApp(firebaseConfig, "secondary");
    const secondaryAuth = getAuth(secondaryApp);

    enableIndexedDbPersistence(db)
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn("A persistência offline falhou. Múltiplas abas abertas?");
            } else if (err.code == 'unimplemented') {
                console.warn("O navegador atual não suporta a persistência offline.");
            }
        });

    Chart.register(ChartDataLabels);
    Chart.defaults.font.family = "'Poppins', sans-serif";

    // Módulo para gerenciar o banco de dados local (IndexedDB)
    const OfflineDB = {
        dbPromise: null,
        async init() {
            if (this.dbPromise) return;
            this.dbPromise = openDB('agrovetor-offline-storage', 1, {
                upgrade(db) {
                    db.createObjectStore('shapefile-cache');
                },
            });
        },
        async get(key) {
            return (await this.dbPromise).get('shapefile-cache', key);
        },
        async set(key, val) {
            return (await this.dbPromise).put('shapefile-cache', val, key);
        },
    };


    const App = {
        config: {
            appName: "Inspeção e Planejamento de Cana com IA",
            themeKey: 'canaAppTheme',
            inactivityTimeout: 15 * 60 * 1000,
            inactivityWarningTime: 1 * 60 * 1000,
            backendUrl: 'https://agrovetor-backend.onrender.com', // URL do seu backend
            menuConfig: [
                { label: 'Dashboard', icon: 'fas fa-tachometer-alt', target: 'dashboard', permission: 'dashboard' },
                { label: 'Monitoramento Aéreo', icon: 'fas fa-satellite-dish', target: 'monitoramentoAereo', permission: 'monitoramentoAereo' },
                { label: 'Plan. Inspeção', icon: 'fas fa-calendar-alt', target: 'planejamento', permission: 'planejamento' },
                {
                    label: 'Colheita', icon: 'fas fa-tractor',
                    submenu: [
                        { label: 'Planejamento de Colheita', icon: 'fas fa-stream', target: 'planejamentoColheita', permission: 'planejamentoColheita' },
                    ]
                },
                {
                    label: 'Lançamentos', icon: 'fas fa-pen-to-square',
                    submenu: [
                        { label: 'Lançamento Broca', icon: 'fas fa-bug', target: 'lancamentoBroca', permission: 'lancamentoBroca' },
                        { label: 'Lançamento Perda', icon: 'fas fa-dollar-sign', target: 'lancamentoPerda', permission: 'lancamentoPerda' },
                    ]
                },
                {
                    label: 'Relatórios', icon: 'fas fa-chart-line',
                    submenu: [
                        { label: 'Relatório Broca', icon: 'fas fa-chart-bar', target: 'relatorioBroca', permission: 'relatorioBroca' },
                        { label: 'Relatório Perda', icon: 'fas fa-chart-pie', target: 'relatorioPerda', permission: 'relatorioPerda' },
                        { label: 'Rel. Colheita Custom', icon: 'fas fa-file-invoice', target: 'relatorioColheitaCustom', permission: 'planejamentoColheita' },
                        { label: 'Rel. Monitoramento', icon: 'fas fa-map-marked-alt', target: 'relatorioMonitoramento', permission: 'relatorioMonitoramento' },
                    ]
                },
                {
                    label: 'Administrativo', icon: 'fas fa-cogs',
                    submenu: [
                        { label: 'Cadastros', icon: 'fas fa-book', target: 'cadastros', permission: 'configuracoes' },
                        { label: 'Cadastrar Pessoas', icon: 'fas fa-id-card', target: 'cadastrarPessoas', permission: 'cadastrarPessoas' },
                        { label: 'Gerir Utilizadores', icon: 'fas fa-users-cog', target: 'gerenciarUsuarios', permission: 'gerenciarUsuarios' },
                        { label: 'Configurações da Empresa', icon: 'fas fa-building', target: 'configuracoesEmpresa', permission: 'configuracoes' },
                        { label: 'Excluir Lançamentos', icon: 'fas fa-trash', target: 'excluirDados', permission: 'excluir' },
                    ]
                },
            ],
            roles: {
                admin: { dashboard: true, monitoramentoAereo: true, relatorioMonitoramento: true, planejamentoColheita: true, planejamento: true, lancamentoBroca: true, lancamentoPerda: true, relatorioBroca: true, relatorioPerda: true, excluir: true, gerenciarUsuarios: true, configuracoes: true, cadastrarPessoas: true },
                supervisor: { dashboard: true, monitoramentoAereo: true, relatorioMonitoramento: true, planejamentoColheita: true, planejamento: true, relatorioBroca: true, relatorioPerda: true, configuracoes: true, cadastrarPessoas: true, gerenciarUsuarios: true },
                tecnico: { dashboard: true, monitoramentoAereo: true, relatorioMonitoramento: true, lancamentoBroca: true, lancamentoPerda: true, relatorioBroca: true, relatorioPerda: true },
                colaborador: { dashboard: true, monitoramentoAereo: true, lancamentoBroca: true, lancamentoPerda: true },
                user: { dashboard: true }
            }
        },

        state: {
            currentUser: null,
            users: [],
            registros: [],
            perdas: [],
            planos: [],
            fazendas: [],
            personnel: [],
            companyLogo: null,
            activeSubmenu: null,
            charts: {},
            harvestPlans: [],
            activeHarvestPlan: null,
            inactivityTimer: null,
            inactivityWarningTimer: null,
            unsubscribeListeners: [],
            deferredInstallPrompt: null,
            newUserCreationData: null,
            expandedChart: null,
            googleMap: null,
            googleUserMarker: null,
            googleTrapMarkers: {},
            armadilhas: [],
            geoJsonData: null,
            mapPolygons: [],
            selectedMapFeature: null, // NOVO: Armazena a feature do talhão selecionado no mapa
            trapNotifications: [],
            unreadNotificationCount: 0,
            notifiedTrapIds: new Set(), // NOVO: Controla pop-ups já exibidos na sessão
            trapPlacementMode: null,
            trapPlacementData: null,
        },
        
        elements: {
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingProgressText: document.getElementById('loading-progress-text'),
            loginScreen: document.getElementById('loginScreen'),
            appScreen: document.getElementById('appScreen'),
            loginUser: document.getElementById('loginUser'),
            loginPass: document.getElementById('loginPass'),
            btnLogin: document.getElementById('btnLogin'),
            loginMessage: document.getElementById('loginMessage'),
            loginForm: document.getElementById('loginForm'),
            offlineUserSelection: document.getElementById('offlineUserSelection'),
            offlineUserList: document.getElementById('offlineUserList'),
            headerTitle: document.querySelector('header h1'),
            currentDateTime: document.getElementById('currentDateTime'),
            logoutBtn: document.getElementById('logoutBtn'),
            btnToggleMenu: document.getElementById('btnToggleMenu'),
            menu: document.getElementById('menu'),
            content: document.getElementById('content'),
            alertContainer: document.getElementById('alertContainer'),
            notificationContainer: document.getElementById('notification-container'),
            notificationBell: {
                container: document.getElementById('notification-bell-container'),
                toggle: document.getElementById('notification-bell-toggle'),
                count: document.getElementById('notification-count'),
                dropdown: document.getElementById('notification-dropdown'),
                list: document.getElementById('notification-list'), // NOVO
                clearBtn: document.getElementById('clear-notifications-btn'), // NOVO
                noNotifications: document.getElementById('no-notifications'), // NOVO
            },
            userMenu: {
                container: document.getElementById('user-menu-container'),
                toggle: document.getElementById('user-menu-toggle'),
                dropdown: document.getElementById('user-menu-dropdown'),
                username: document.getElementById('userMenuUsername'),
                changePasswordBtn: document.getElementById('changePasswordBtn'),
                themeButtons: document.querySelectorAll('.theme-button')
            },
            confirmationModal: {
                overlay: document.getElementById('confirmationModal'),
                title: document.getElementById('confirmationModalTitle'),
                message: document.getElementById('confirmationModalMessage'),
                confirmBtn: document.getElementById('confirmationModalConfirmBtn'),
                cancelBtn: document.getElementById('confirmationModalCancelBtn'),
                closeBtn: document.getElementById('confirmationModalCloseBtn'),
                inputContainer: document.getElementById('confirmationModalInputContainer'),
                input: document.getElementById('confirmationModalInput'),
            },
            changePasswordModal: {
                overlay: document.getElementById('changePasswordModal'),
                closeBtn: document.getElementById('changePasswordModalCloseBtn'),
                cancelBtn: document.getElementById('changePasswordModalCancelBtn'),
                saveBtn: document.getElementById('changePasswordModalSaveBtn'),
                currentPassword: document.getElementById('currentPassword'),
                newPassword: document.getElementById('newPassword'),
                confirmNewPassword: document.getElementById('confirmNewPassword'),
            },
            adminPasswordConfirmModal: {
                overlay: document.getElementById('adminPasswordConfirmModal'),
                closeBtn: document.getElementById('adminPasswordConfirmModalCloseBtn'),
                cancelBtn: document.getElementById('adminPasswordConfirmModalCancelBtn'),
                confirmBtn: document.getElementById('adminPasswordConfirmModalConfirmBtn'),
                passwordInput: document.getElementById('adminConfirmPassword')
            },
            chartModal: {
                overlay: document.getElementById('chartModal'),
                title: document.getElementById('chartModalTitle'),
                closeBtn: document.getElementById('chartModalCloseBtn'),
                canvas: document.getElementById('expandedChartCanvas'),
            },
            editFarmModal: {
                overlay: document.getElementById('editFarmModal'),
                closeBtn: document.getElementById('editFarmModalCloseBtn'),
                cancelBtn: document.getElementById('editFarmModalCancelBtn'),
                saveBtn: document.getElementById('editFarmModalSaveBtn'),
                nameInput: document.getElementById('editFarmNameInput'),
                editingFarmId: document.getElementById('editingFarmId'),
                typeCheckboxes: document.querySelectorAll('#editFarmTypeCheckboxes input[type="checkbox"]'),
            },
            companyConfig: {
                logoUploadArea: document.getElementById('logoUploadArea'),
                logoInput: document.getElementById('logoInput'),
                logoPreview: document.getElementById('logoPreview'),
                removeLogoBtn: document.getElementById('removeLogoBtn'),
                progressUploadArea: document.getElementById('harvestReportProgressUploadArea'),
                progressInput: document.getElementById('harvestReportProgressInput'),
                btnDownloadProgressTemplate: document.getElementById('btnDownloadProgressTemplate'),
                closedUploadArea: document.getElementById('harvestReportClosedUploadArea'),
                closedInput: document.getElementById('harvestReportClosedInput'),
                btnDownloadClosedTemplate: document.getElementById('btnDownloadClosedTemplate'),
                shapefileUploadArea: document.getElementById('shapefileUploadArea'),
                shapefileInput: document.getElementById('shapefileInput'),
            },
            dashboard: {
                selector: document.getElementById('dashboard-selector'),
                brocaView: document.getElementById('dashboard-broca'),
                perdaView: document.getElementById('dashboard-perda'),
                aereaView: document.getElementById('dashboard-aerea'),
                cardBroca: document.getElementById('card-broca'),
                cardPerda: document.getElementById('card-perda'),
                cardAerea: document.getElementById('card-aerea'),
                btnBackToSelectorBroca: document.getElementById('btn-back-to-selector-broca'),
                btnBackToSelectorPerda: document.getElementById('btn-back-to-selector-perda'),
                btnBackToSelectorAerea: document.getElementById('btn-back-to-selector-aerea'),
                brocaDashboardInicio: document.getElementById('brocaDashboardInicio'),
                brocaDashboardFim: document.getElementById('brocaDashboardFim'),
                btnFiltrarBrocaDashboard: document.getElementById('btnFiltrarBrocaDashboard'),
                perdaDashboardInicio: document.getElementById('perdaDashboardInicio'),
                perdaDashboardFim: document.getElementById('perdaDashboardFim'),
                btnFiltrarPerdaDashboard: document.getElementById('btnFiltrarPerdaDashboard'),
            },
            users: {
                username: document.getElementById('newUserUsername'),
                password: document.getElementById('newUserPassword'),
                role: document.getElementById('newUserRole'),
                permissionsContainer: document.querySelector('#gerenciarUsuarios .permission-grid'),
                permissionCheckboxes: document.querySelectorAll('#gerenciarUsuarios .permission-grid input[type="checkbox"]'),
                btnCreate: document.getElementById('btnCreateUser'),
                list: document.getElementById('usersList')
            },
            userEditModal: {
                overlay: document.getElementById('userEditModal'),
                title: document.getElementById('userEditModalTitle'),
                closeBtn: document.getElementById('userEditModalCloseBtn'),
                editingUserId: document.getElementById('editingUserId'),
                username: document.getElementById('editUserUsername'),
                role: document.getElementById('editUserRole'),
                permissionGrid: document.getElementById('editUserPermissionGrid'),
                btnSaveChanges: document.getElementById('btnSaveUserChanges'),
                btnResetPassword: document.getElementById('btnResetPassword'),
                btnDeleteUser: document.getElementById('btnDeleteUser'),
            },
            personnel: {
                id: document.getElementById('personnelId'),
                matricula: document.getElementById('personnelMatricula'),
                name: document.getElementById('personnelName'),
                btnSave: document.getElementById('btnSavePersonnel'),
                list: document.getElementById('personnelList'),
                csvUploadArea: document.getElementById('personnelCsvUploadArea'),
                csvFileInput: document.getElementById('personnelCsvInput'),
                btnDownloadCsvTemplate: document.getElementById('btnDownloadPersonnelCsvTemplate'),
            },
            cadastros: {
                farmCode: document.getElementById('farmCode'),
                farmName: document.getElementById('farmName'),
                farmTypeCheckboxes: document.querySelectorAll('#farmTypeCheckboxes input[type="checkbox"]'),
                btnSaveFarm: document.getElementById('btnSaveFarm'),
                btnDeleteAllFarms: document.getElementById('btnDeleteAllFarms'),
                farmSelect: document.getElementById('farmSelect'),
                talhaoManagementContainer: document.getElementById('talhaoManagementContainer'),
                selectedFarmName: document.getElementById('selectedFarmName'),
                selectedFarmTypes: document.getElementById('selectedFarmTypes'),
                talhaoList: document.getElementById('talhaoList'),
                talhaoId: document.getElementById('talhaoId'),
                talhaoName: document.getElementById('talhaoName'),
                talhaoArea: document.getElementById('talhaoArea'),
                talhaoTCH: document.getElementById('talhaoTCH'),
                talhaoProducao: document.getElementById('talhaoProducao'),
                talhaoCorte: document.getElementById('talhaoCorte'),
                talhaoVariedade: document.getElementById('talhaoVariedade'),
                talhaoDistancia: document.getElementById('talhaoDistancia'),
                talhaoUltimaColheita: document.getElementById('talhaoUltimaColheita'),
                btnSaveTalhao: document.getElementById('btnSaveTalhao'),
                csvUploadArea: document.getElementById('csvUploadArea'),
                csvFileInput: document.getElementById('csvFileInput'),
                btnDownloadCsvTemplate: document.getElementById('btnDownloadCsvTemplate'),
            },
            planejamento: {
                tipo: document.getElementById('planoTipo'),
                fazenda: document.getElementById('planoFazenda'),
                talhao: document.getElementById('planoTalhao'),
                data: document.getElementById('planoData'),
                responsavel: document.getElementById('planoResponsavel'),
                meta: document.getElementById('planoMeta'),
                obs: document.getElementById('planoObs'),
                btnAgendar: document.getElementById('btnAgendarInspecao'),
                btnSugerir: document.getElementById('btnSugerirPlano'),
                lista: document.getElementById('listaPlanejamento')
            },
            harvest: {
                plansListContainer: document.getElementById('harvest-plans-list-container'),
                plansList: document.getElementById('harvest-plans-list'),
                planEditor: document.getElementById('harvest-plan-editor'),
                btnAddNew: document.getElementById('btnAddNewHarvestPlan'),
                maturador: document.getElementById('harvestMaturador'),
                maturadorDate: document.getElementById('harvestMaturadorDate'),
                btnSavePlan: document.getElementById('btnSaveHarvestPlan'),
                btnCancelPlan: document.getElementById('btnCancelHarvestPlan'),
                frontName: document.getElementById('harvestFrontName'),
                startDate: document.getElementById('harvestStartDate'),
                dailyRate: document.getElementById('harvestDailyRate'),
                fazenda: document.getElementById('harvestFazenda'),
                atr: document.getElementById('harvestAtr'),
                talhaoSelectionList: document.getElementById('harvestTalhaoSelectionList'),
                selectAllTalhoes: document.getElementById('selectAllTalhoes'),
                btnAddOrUpdate: document.getElementById('btnAddOrUpdateHarvestSequence'),
                btnCancelEdit: document.getElementById('btnCancelEditSequence'),
                addOrEditTitle: document.getElementById('addOrEditSequenceTitle'),
                editingGroupId: document.getElementById('editingGroupId'),
                btnOptimize: document.getElementById('btnOptimizeHarvest'),
                tableBody: document.querySelector('#harvestPlanTable tbody'),
                summary: document.getElementById('harvestSummary'),
            },
            broca: {
                form: document.getElementById('lancamentoBroca'),
                codigo: document.getElementById('codigo'),
                data: document.getElementById('data'),
                talhao: document.getElementById('talhao'),
                varietyDisplay: document.getElementById('varietyDisplay'),
                entrenos: document.getElementById('entrenos'),
                base: document.getElementById('brocaBase'),
                meio: document.getElementById('brocaMeio'),
                topo: document.getElementById('brocaTopo'),
                brocado: document.getElementById('brocado'),
                resultado: document.getElementById('resultado'),
                btnSalvar: document.getElementById('btnSalvarBrocamento'),
                filtroFazenda: document.getElementById('fazendaFiltroBrocamento'),
                tipoRelatorio: document.getElementById('tipoRelatorioBroca'),
                filtroInicio: document.getElementById('inicioBrocamento'),
                filtroFim: document.getElementById('fimBrocamento'),
                farmTypeFilter: document.querySelectorAll('#brocaReportFarmTypeFilter input[type="checkbox"]'),
                btnPDF: document.getElementById('btnPDFBrocamento'),
                btnExcel: document.getElementById('btnExcelBrocamento'),
            },
            perda: {
                form: document.getElementById('lancamentoPerda'),
                data: document.getElementById('dataPerda'),
                codigo: document.getElementById('codigoPerda'),
                talhao: document.getElementById('talhaoPerda'),
                varietyDisplay: document.getElementById('varietyDisplayPerda'),
                frente: document.getElementById('frenteServico'),
                turno: document.getElementById('turno'),
                frota: document.getElementById('frotaEquipamento'),
                matricula: document.getElementById('matriculaOperador'),
                operadorNome: document.getElementById('operadorNome'),
                canaInteira: document.getElementById('canaInteira'),
                tolete: document.getElementById('tolete'),
                toco: document.getElementById('toco'),
                ponta: document.getElementById('ponta'),
                estilhaco: document.getElementById('estilhaco'),
                pedaco: document.getElementById('pedaco'),
                resultado: document.getElementById('resultadoPerda'),
                btnSalvar: document.getElementById('btnSalvarPerda'),
                filtroFazenda: document.getElementById('fazendaFiltroPerda'),
                filtroTalhao: document.getElementById('talhaoFiltroPerda'),
                filtroOperador: document.getElementById('operadorFiltroPerda'),
                filtroFrente: document.getElementById('frenteFiltroPerda'),
                filtroInicio: document.getElementById('inicioPerda'),
                filtroFim: document.getElementById('fimPerda'),
                farmTypeFilter: document.querySelectorAll('#perdaReportFarmTypeFilter input[type="checkbox"]'),
                tipoRelatorio: document.getElementById('tipoRelatorioPerda'),
                btnPDF: document.getElementById('btnPDFPerda'),
                btnExcel: document.getElementById('btnExcelPerda'),
            },
            exclusao: {
                lista: document.getElementById('listaExclusao')
            },
            relatorioColheita: {
                select: document.getElementById('planoRelatorioSelect'),
                optionsContainer: document.getElementById('reportOptionsContainer'),
                colunasDetalhadoContainer: document.getElementById('colunas-detalhado-container'),
                tipoRelatorioSelect: document.getElementById('tipoRelatorioColheita'),
                btnPDF: document.getElementById('btnGerarRelatorioCustomPDF'),
                btnExcel: document.getElementById('btnGerarRelatorioCustomExcel'),
            },
            monitoramentoAereo: {
                container: document.getElementById('monitoramentoAereo-container'),
                mapContainer: document.getElementById('map'),
                btnAddTrap: document.getElementById('btnAddTrap'),
                btnCenterMap: document.getElementById('btnCenterMap'),
                infoBox: document.getElementById('talhao-info-box'),
                infoBoxContent: document.getElementById('talhao-info-box-content'),
                infoBoxCloseBtn: document.getElementById('close-info-box'),
                trapInfoBox: document.getElementById('trap-info-box'),
                trapInfoBoxContent: document.getElementById('trap-info-box-content'),
                trapInfoBoxCloseBtn: document.getElementById('close-trap-info-box'),
            },
            relatorioMonitoramento: {
                fazendaFiltro: document.getElementById('monitoramentoFazendaFiltro'),
                inicio: document.getElementById('monitoramentoInicio'),
                fim: document.getElementById('monitoramentoFim'),
                btnPDF: document.getElementById('btnPDFMonitoramento'),
                btnExcel: document.getElementById('btnExcelMonitoramento'),
            },
            trapPlacementModal: {
                overlay: document.getElementById('trapPlacementModal'),
                body: document.getElementById('trapPlacementModalBody'),
                closeBtn: document.getElementById('trapPlacementModalCloseBtn'),
                cancelBtn: document.getElementById('trapPlacementModalCancelBtn'),
                manualBtn: document.getElementById('trapPlacementModalManualBtn'),
                confirmBtn: document.getElementById('trapPlacementModalConfirmBtn'),
            },
            installAppBtn: document.getElementById('installAppBtn'),
        },

        init() {
            OfflineDB.init();
            this.ui.applyTheme(localStorage.getItem(this.config.themeKey) || 'theme-green');
            this.ui.setupEventListeners();
            this.auth.checkSession();
            this.pwa.registerServiceWorker();
        },
        
        auth: {
            async checkSession() {
                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        const userDoc = await App.data.getUserData(user.uid);
                        if (userDoc && userDoc.active) {
                            App.state.currentUser = { ...user, ...userDoc };
                            App.actions.saveUserProfileLocally(App.state.currentUser);
                            App.ui.showAppScreen();
                            App.data.listenToAllData();
                        } else {
                            this.logout();
                            App.ui.showLoginMessage("A sua conta foi desativada ou não foi encontrada.");
                        }
                    } else {
                        const localProfiles = App.actions.getLocalUserProfiles();
                        if (localProfiles.length > 0 && !navigator.onLine) {
                            App.ui.showOfflineUserSelection(localProfiles);
                        } else {
                            App.ui.showLoginScreen();
                        }
                    }
                });
            },
            async login() {
                const email = App.elements.loginUser.value.trim();
                const password = App.elements.loginPass.value;
                if (!email || !password) {
                    App.ui.showLoginMessage("Preencha e-mail e senha.");
                    return;
                }
                App.ui.setLoading(true, "A autenticar...");
                try {
                    await signInWithEmailAndPassword(auth, email, password);
                } catch (error) {
                    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        App.ui.showLoginMessage("E-mail ou senha inválidos.");
                    } else if (error.code === 'auth/network-request-failed') {
                        App.ui.showLoginMessage("Erro de rede. Verifique sua conexão e tente novamente.");
                    } else {
                        App.ui.showLoginMessage("Ocorreu um erro ao fazer login.");
                    }
                    console.error("Erro de login:", error.code, error.message);
                } finally {
                    App.ui.setLoading(false);
                }
            },
            async loginOffline(userId) {
                const localProfiles = App.actions.getLocalUserProfiles();
                const userProfile = localProfiles.find(p => p.uid === userId);
                if (userProfile) {
                    App.state.currentUser = userProfile;
                    App.ui.showAppScreen();
                    App.mapModule.loadOfflineShapes();
                    App.data.listenToAllData();
                }
            },
            async logout() {
                if (navigator.onLine) {
                    await signOut(auth);
                }
                App.data.cleanupListeners();
                App.state.currentUser = null;
                clearTimeout(App.state.inactivityTimer);
                clearTimeout(App.state.inactivityWarningTimer);
                App.ui.showLoginScreen();
            },
            initiateUserCreation() {
                const els = App.elements.users;
                const email = els.username.value.trim();
                const password = els.password.value;
                const role = els.role.value;
                if (!email || !password) { App.ui.showAlert("Preencha e-mail e senha.", "error"); return; }

                const permissions = {};
                els.permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    permissions[cb.dataset.permission] = cb.checked;
                });

                App.state.newUserCreationData = { email, password, role, permissions };
                App.ui.showAdminPasswordConfirmModal();
            },
            async createUserAfterAdminConfirmation() {
                const { email, password, role, permissions } = App.state.newUserCreationData;
                const adminPassword = App.elements.adminPasswordConfirmModal.passwordInput.value;

                if (!adminPassword) {
                    App.ui.showAlert("Por favor, insira a sua senha de administrador para confirmar.", "error");
                    return;
                }

                App.ui.setLoading(true, "A criar utilizador...");
                try {
                    const adminUser = auth.currentUser;
                    const credential = EmailAuthProvider.credential(adminUser.email, adminPassword);
                    await reauthenticateWithCredential(adminUser, credential);
                    
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                    const newUser = userCredential.user;

                    await signOut(secondaryAuth);

                    const userData = {
                        username: email.split('@')[0],
                        email: email,
                        role: role,
                        active: true,
                        permissions: permissions
                    };
                    await App.data.createUserData(newUser.uid, userData);
                    
                    App.ui.showAlert(`Utilizador ${email} criado com sucesso!`);
                    App.elements.users.username.value = ''; 
                    App.elements.users.password.value = ''; 
                    App.elements.users.role.value = 'user';
                    App.ui.updatePermissionsForRole('user');
                    App.ui.closeAdminPasswordConfirmModal();

                } catch (error) {
                    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        App.ui.showAlert("A sua senha de administrador está incorreta.", "error");
                    } else if (error.code === 'auth/email-already-in-use') {
                        App.ui.showAlert("Este e-mail já está em uso por outro utilizador.", "error");
                    } else if (error.code === 'auth/weak-password') {
                        App.ui.showAlert("A senha do novo utilizador deve ter pelo menos 6 caracteres.", "error");
                    } else {
                        App.ui.showAlert("Erro ao criar utilizador.", "error");
                        console.error("Erro ao criar utilizador:", error);
                    }
                } finally {
                    App.state.newUserCreationData = null;
                    App.elements.adminPasswordConfirmModal.passwordInput.value = '';
                    App.ui.setLoading(false);
                }
            },
            async deleteUser(userId) {
                const userToDelete = App.state.users.find(u => u.id === userId);
                if (!userToDelete) return;
                
                App.ui.showConfirmationModal(`Tem a certeza que deseja EXCLUIR o utilizador ${userToDelete.username}? Esta ação não pode ser desfeita.`, async () => {
                    try {
                        await App.data.updateDocument('users', userId, { active: false });
                        App.actions.removeUserProfileLocally(userId);
                        App.ui.showAlert(`Utilizador ${userToDelete.username} desativado.`);
                        App.ui.closeUserEditModal();
                    } catch (error) {
                        App.ui.showAlert("Erro ao desativar utilizador.", "error");
                    }
                });
            },
            async toggleUserStatus(userId) {
                const user = App.state.users.find(u => u.id === userId);
                if (!user) return;
                const newStatus = !user.active;
                await App.data.updateDocument('users', userId, { active: newStatus });
                App.ui.showAlert(`Utilizador ${user.username} ${newStatus ? 'ativado' : 'desativado'}.`);
            },
            async resetUserPassword(userId) {
                const user = App.state.users.find(u => u.id === userId);
                if (!user || !user.email) return;

                App.ui.showConfirmationModal(`Deseja enviar um e-mail de redefinição de senha para ${user.email}?`, async () => {
                    try {
                        await sendPasswordResetEmail(auth, user.email);
                        App.ui.showAlert(`E-mail de redefinição enviado para ${user.email}.`, 'success');
                    } catch (error) {
                        App.ui.showAlert("Erro ao enviar e-mail de redefinição.", "error");
                        console.error(error);
                    }
                });
            },
            async saveUserChanges(userId) {
                const modalEls = App.elements.userEditModal;
                const role = modalEls.role.value;
                const permissions = {};
                modalEls.permissionGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    permissions[cb.dataset.permission] = cb.checked;
                });
                
                await App.data.updateDocument('users', userId, { role, permissions });
                App.ui.showAlert("Alterações guardadas com sucesso!");
                App.ui.closeUserEditModal();
            }
        },

        data: {
            cleanupListeners() {
                App.state.unsubscribeListeners.forEach(unsubscribe => unsubscribe());
                App.state.unsubscribeListeners = [];
            },
            listenToAllData() {
                this.cleanupListeners();
                
                const collectionsToListen = [ 'users', 'fazendas', 'personnel', 'registros', 'perdas', 'planos', 'harvestPlans', 'armadilhas' ];
                
                collectionsToListen.forEach(collectionName => {
                    const q = collection(db, collectionName);
                    const unsubscribe = onSnapshot(q, (querySnapshot) => {
                        const data = [];
                        querySnapshot.forEach((doc) => {
                            data.push({ id: doc.id, ...doc.data() });
                        });
                        App.state[collectionName] = data;
                        
                        if (collectionName === 'armadilhas') {
                            if (App.state.googleMap) {
                                App.mapModule.loadTraps();
                            }
                            App.mapModule.checkTrapStatusAndNotify();
                        }

                        App.ui.renderAllDynamicContent();
                    }, (error) => {
                        console.error(`Erro ao ouvir a coleção ${collectionName}: `, error);
                    });
                    App.state.unsubscribeListeners.push(unsubscribe);
                });
                
                const configDocRef = doc(db, 'config', 'company');
                const unsubscribeConfig = onSnapshot(configDocRef, (doc) => {
                    App.state.companyLogo = doc.exists() ? doc.data().logoBase64 : null; 
                    App.ui.renderLogoPreview();
                });
                App.state.unsubscribeListeners.push(unsubscribeConfig);

                const shapefileDocRef = doc(db, 'config', 'shapefile');
                const unsubscribeShapefile = onSnapshot(shapefileDocRef, (doc) => {
                    if (doc.exists() && doc.data().shapefileURL) {
                        App.mapModule.loadAndCacheShapes(doc.data().shapefileURL);
                    }
                });
                App.state.unsubscribeListeners.push(unsubscribeShapefile);
            },
            async getDocument(collectionName, docId, options) {
                return await getDoc(doc(db, collectionName, docId)).then(docSnap => {
                    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
                });
            },
            async addDocument(collectionName, data) {
                return await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() });
            },
            async setDocument(collectionName, docId, data) {
                return await setDoc(doc(db, collectionName, docId), data, { merge: true });
            },
            async updateDocument(collectionName, docId, data) {
                return await updateDoc(doc(db, collectionName, docId), data);
            },
            async deleteDocument(collectionName, docId) {
                return await deleteDoc(doc(db, collectionName, docId));
            },
            async getUserData(uid, options = {}) {
                return this.getDocument('users', uid, options);
            },
            async createUserData(uid, data) {
                return this.setDocument('users', uid, data);
            },
        },
        
        ui: {
            _getThemeColors() {
                const styles = getComputedStyle(document.documentElement);
                return {
                    primary: styles.getPropertyValue('--color-primary').trim(),
                    primaryLight: styles.getPropertyValue('--color-primary-light').trim(),
                    text: styles.getPropertyValue('--color-text').trim(),
                    border: styles.getPropertyValue('--color-border').trim(),
                };
            },
            setLoading(isLoading, progressText = "A processar...") {
                App.elements.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
                App.elements.loadingProgressText.textContent = progressText;
            },
            showLoginScreen() {
                App.elements.loginForm.style.display = 'block';
                App.elements.offlineUserSelection.style.display = 'none';
                App.elements.loginScreen.style.display = 'flex';
                App.elements.appScreen.style.display = 'none';
                
                if (App.elements.userMenu && App.elements.userMenu.container) {
                    App.elements.userMenu.container.style.display = 'none';
                }
                if (App.elements.notificationBell && App.elements.notificationBell.container) {
                    App.elements.notificationBell.container.style.display = 'none';
                }

                App.elements.loginUser.value = '';
                App.elements.loginPass.value = '';
                App.elements.loginUser.focus();
                this.closeAllMenus();
            },
            showOfflineUserSelection(profiles) {
                App.elements.loginForm.style.display = 'none';
                App.elements.offlineUserSelection.style.display = 'block';
                const { offlineUserList } = App.elements;
                offlineUserList.innerHTML = '';
                profiles.forEach(profile => {
                    const btn = document.createElement('button');
                    btn.className = 'offline-user-btn';
                    btn.dataset.uid = profile.uid;
                    btn.innerHTML = `<i class="fas fa-user-circle"></i> ${profile.username || profile.email}`;
                    btn.addEventListener('click', () => App.auth.loginOffline(profile.uid));
                    offlineUserList.appendChild(btn);
                });
                App.elements.loginScreen.style.display = 'flex';
                App.elements.appScreen.style.display = 'none';
            },
            showAppScreen() {
                const { currentUser } = App.state;
                App.elements.loginScreen.style.display = 'none';
                App.elements.appScreen.style.display = 'flex';
                App.elements.userMenu.container.style.display = 'block';
                App.elements.notificationBell.container.style.display = 'block';
                App.elements.userMenu.username.textContent = currentUser.username || currentUser.email;
                
                // ALTERAÇÃO PONTO 3: Alterar título do cabeçalho
                App.elements.headerTitle.innerHTML = `<i class="fas fa-leaf"></i> AgroVetor`;

                this.updateDateTime();
                setInterval(() => this.updateDateTime(), 60000);

                // Adiciona verificação periódica para o status das armadilhas
                setInterval(() => {
                    if (App.state.armadilhas.length > 0) {
                        App.mapModule.checkTrapStatusAndNotify();
                    }
                }, 60000); // Verifica a cada minuto

                this.renderMenu();
                this.renderAllDynamicContent();
                this.showTab('dashboard');
                App.actions.resetInactivityTimer();
            },
            renderAllDynamicContent() {
                this.populateFazendaSelects();
                this.populateUserSelects();
                this.populateOperatorSelects();
                this.renderUsersList();
                this.renderPersonnelList();
                this.renderLogoPreview();
                this.renderPlanejamento();
                this.showHarvestPlanList();
                this.populateHarvestPlanSelect();
                
                if (document.getElementById('dashboard').classList.contains('active')) {
                   this.showDashboardView('broca'); 
                }
            },
            showLoginMessage(message) { App.elements.loginMessage.textContent = message; },
            showAlert(message, type = 'success', duration = 3000) {
                const { alertContainer } = App.elements;
                if (!alertContainer) return;
                const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'info-circle', info: 'info-circle' };
                alertContainer.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${message}`;
                alertContainer.className = `show ${type}`;
                setTimeout(() => alertContainer.classList.remove('show'), duration);
            },
            updateDateTime() { App.elements.currentDateTime.innerHTML = `<i class="fas fa-clock"></i> ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`; },
            renderMenu() {
                const { menu } = App.elements; const { menuConfig } = App.config; const { currentUser } = App.state;
                menu.innerHTML = '';
                const menuContent = document.createElement('div');
                menuContent.className = 'menu-content';
                menu.appendChild(menuContent);

                const createMenuItem = (item) => {
                    const hasPermission = item.submenu ? 
                                          item.submenu.some(sub => currentUser.permissions[sub.permission]) : 
                                          currentUser.permissions[item.permission];

                    if (!hasPermission) return null;
                    
                    const btn = document.createElement('button');
                    btn.className = 'menu-btn';
                    btn.innerHTML = `<i class="${item.icon}"></i> <span>${item.label}</span>`;
                    
                    if (item.submenu) {
                        btn.innerHTML += '<span class="arrow">&rsaquo;</span>';
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.renderSubmenu(item);
                        });
                    } else {
                        btn.addEventListener('click', () => {
                            this.closeAllMenus();
                            this.showTab(item.target);
                        });
                    }
                    return btn;
                };
                menuConfig.forEach(item => { const menuItem = createMenuItem(item); if (menuItem) menuContent.appendChild(menuItem); });
            },
            renderSubmenu(parentItem) {
                const { menu } = App.elements;
                let submenuContent = menu.querySelector('.submenu-content');
                if (submenuContent) submenuContent.remove();

                submenuContent = document.createElement('div');
                submenuContent.className = 'submenu-content';

                const backBtn = document.createElement('button');
                backBtn.className = 'submenu-back-btn';
                backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> <span>Voltar</span>';
                backBtn.onclick = () => {
                    submenuContent.classList.remove('active');
                    setTimeout(() => this.renderMenu(), 300);
                };
                submenuContent.appendChild(backBtn);
                
                parentItem.submenu.forEach(subItem => {
                    if (App.state.currentUser.permissions[subItem.permission]) {
                        const subBtn = document.createElement('button');
                        subBtn.className = 'submenu-btn';
                        subBtn.innerHTML = `<i class="${subItem.icon}"></i> ${subItem.label}`;
                        subBtn.addEventListener('click', () => {
                            this.closeAllMenus();
                            this.showTab(subItem.target);
                        });
                        submenuContent.appendChild(subBtn);
                    }
                });
                menu.appendChild(submenuContent);
                requestAnimationFrame(() => submenuContent.classList.add('active'));
            },
            closeAllMenus() {
                document.body.classList.remove('mobile-menu-open');
                App.elements.menu.classList.remove('open');
                App.elements.btnToggleMenu.classList.remove('open');
                const activeSubmenu = App.elements.menu.querySelector('.submenu-content.active');
                if(activeSubmenu) activeSubmenu.classList.remove('active');
            },
            populateHarvestPlanSelect() {
                const { select } = App.elements.relatorioColheita;
                const savedValue = select.value;
                select.innerHTML = '<option value="">Selecione um plano de colheita...</option>';
                if (App.state.harvestPlans.length === 0) {
                    select.innerHTML += '<option value="" disabled>Nenhum plano salvo encontrado</option>';
                } else {
                    App.state.harvestPlans.forEach(plan => {
                        select.innerHTML += `<option value="${plan.id}">${plan.frontName}</option>`;
                    });
                }
                select.value = savedValue;
            },
            showTab(id) {
                const mapContainer = App.elements.monitoramentoAereo.container;
                if (id === 'monitoramentoAereo') {
                    mapContainer.classList.add('active');
                    window.initMap = App.mapModule.initMap.bind(App.mapModule);
                    if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
                       App.mapModule.initMap();
                    }
                } else {
                    mapContainer.classList.remove('active');
                }

                document.querySelectorAll('.tab-content').forEach(tab => {
                    if (tab.id !== 'monitoramentoAereo-container') {
                        tab.classList.remove('active');
                        tab.hidden = true;
                    }
                });

                const tab = document.getElementById(id);
                if (tab) {
                    tab.classList.add('active');
                    tab.hidden = false;
                }
                
                if (id === 'dashboard') {
                   this.showDashboardView('broca'); 
                } else {
                    App.charts.destroyAll(); 
                }
                
                if (id === 'excluirDados') this.renderExclusao();
                if (id === 'gerenciarUsuarios') {
                    this.renderUsersList();
                    this.renderPermissionItems(App.elements.users.permissionsContainer);
                }
                if (id === 'cadastros') this.renderFarmSelect();
                if (id === 'cadastrarPessoas') this.renderPersonnelList();
                if (id === 'planejamento') this.renderPlanejamento();
                if (id === 'planejamentoColheita') this.showHarvestPlanList();
                if (['relatorioBroca', 'relatorioPerda', 'relatorioMonitoramento'].includes(id)) this.setDefaultDatesForReportForms();
                if (id === 'relatorioColheitaCustom') this.populateHarvestPlanSelect();
                if (id === 'lancamentoBroca' || id === 'lancamentoPerda') this.setDefaultDatesForEntryForms();
                
                this.closeAllMenus();
            },

            // ALTERAÇÃO PONTO 4: Nova função para atualizar o sino de notificação
            updateNotificationBell() {
                const { list, count, noNotifications } = App.elements.notificationBell;
                const notifications = App.state.trapNotifications;
                const unreadCount = App.state.unreadNotificationCount;

                list.innerHTML = ''; // Limpa a lista atual

                if (notifications.length === 0) {
                    noNotifications.style.display = 'flex';
                    list.style.display = 'none';
                } else {
                    noNotifications.style.display = 'none';
                    list.style.display = 'block';

                    notifications.forEach(notif => {
                        const item = document.createElement('div');
                        item.className = `notification-item ${notif.type}`;
                        item.dataset.trapId = notif.trapId;

                        const iconClass = notif.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle';
                        const timeAgo = this.timeSince(notif.timestamp);

                        item.innerHTML = `
                            <i class="fas ${iconClass}"></i>
                            <div class="notification-item-content">
                                <p><strong>Armadilha Requer Atenção</strong></p>
                                <p>${notif.message}</p>
                                <div class="timestamp">${timeAgo}</div>
                            </div>
                        `;
                        list.appendChild(item);
                    });
                }

                if (unreadCount > 0) {
                    count.textContent = unreadCount;
                    count.classList.add('visible');
                } else {
                    count.classList.remove('visible');
                }
            },

            timeSince(date) {
                const seconds = Math.floor((new Date() - date) / 1000);
                let interval = seconds / 31536000;
                if (interval > 1) return Math.floor(interval) + " anos atrás";
                interval = seconds / 2592000;
                if (interval > 1) return Math.floor(interval) + " meses atrás";
                interval = seconds / 86400;
                if (interval > 1) return Math.floor(interval) + " dias atrás";
                interval = seconds / 3600;
                if (interval > 1) return Math.floor(interval) + " horas atrás";
                interval = seconds / 60;
                if (interval > 1) return Math.floor(interval) + " minutos atrás";
                return "Agora mesmo";
            },

            showDashboardView(viewName) {
                const dashEls = App.elements.dashboard;
                dashEls.selector.style.display = 'none';
                dashEls.brocaView.style.display = 'none';
                dashEls.perdaView.style.display = 'none';
                dashEls.aereaView.style.display = 'none';
                
                App.charts.destroyAll();

                switch(viewName) {
                    case 'selector':
                        dashEls.selector.style.display = 'grid';
                        break;
                    case 'broca':
                        dashEls.brocaView.style.display = 'block';
                        this.loadDashboardDates('broca');
                        setTimeout(() => App.charts.renderBrocaDashboardCharts(), 150);
                        break;
                    case 'perda':
                        dashEls.perdaView.style.display = 'block';
                        this.loadDashboardDates('perda');
                        setTimeout(() => App.charts.renderPerdaDashboardCharts(), 150);
                        break;
                    case 'aerea':
                        dashEls.aereaView.style.display = 'block';
                        break;
                }
            },
            setDefaultDatesForEntryForms() {
                const today = new Date().toISOString().split('T')[0];
                App.elements.broca.data.value = today;
                App.elements.perda.data.value = today;
                App.elements.broca.data.max = today;
                App.elements.perda.data.max = today;
            },
            setDefaultDatesForReportForms() {
                const today = new Date();
                const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

                App.elements.broca.filtroInicio.value = firstDayOfMonth;
                App.elements.broca.filtroFim.value = lastDayOfMonth;
                App.elements.perda.filtroInicio.value = firstDayOfMonth;
                App.elements.perda.filtroFim.value = lastDayOfMonth;
                if (App.elements.relatorioMonitoramento.inicio) {
                    App.elements.relatorioMonitoramento.inicio.value = firstDayOfMonth;
                    App.elements.relatorioMonitoramento.fim.value = lastDayOfMonth;
                }
            },
            setDefaultDatesForDashboard(type) {
                const today = new Date();
                const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
                const todayDate = today.toISOString().split('T')[0];

                if (type === 'broca') {
                    App.elements.dashboard.brocaDashboardInicio.value = firstDayOfYear;
                    App.elements.dashboard.brocaDashboardFim.value = todayDate;
                } else if (type === 'perda') {
                    App.elements.dashboard.perdaDashboardInicio.value = firstDayOfYear;
                    App.elements.dashboard.perdaDashboardFim.value = todayDate;
                }
                App.actions.saveDashboardDates(type, firstDayOfYear, todayDate);
            },
            loadDashboardDates(type) {
                const savedDates = App.actions.getDashboardDates(type);
                if (savedDates.start && savedDates.end) {
                    if (type === 'broca') {
                        App.elements.dashboard.brocaDashboardInicio.value = savedDates.start;
                        App.elements.dashboard.brocaDashboardFim.value = savedDates.end;
                    } else if (type === 'perda') {
                        App.elements.dashboard.perdaDashboardInicio.value = savedDates.start;
                        App.elements.dashboard.perdaDashboardFim.value = savedDates.end;
                    }
                } else {
                    this.setDefaultDatesForDashboard(type);
                }
            },
            clearForm(formElement) {
                if (!formElement) return;
                const inputs = formElement.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = false;
                    } else if (input.type !== 'date') {
                        input.value = '';
                    }
                });
                formElement.querySelectorAll('.info-display').forEach(el => el.textContent = '');
                formElement.querySelectorAll('.resultado').forEach(el => el.textContent = '');
            },
            populateFazendaSelects() {
                const selects = [
                    App.elements.broca.filtroFazenda,
                    App.elements.perda.filtroFazenda,
                    App.elements.planejamento.fazenda,
                    App.elements.harvest.fazenda,
                    App.elements.cadastros.farmSelect,
                    App.elements.broca.codigo,
                    App.elements.perda.codigo,
                    App.elements.relatorioMonitoramento.fazendaFiltro
                ];
                selects.forEach(select => {
                    if (!select) return;
                    const currentValue = select.value;
                    select.innerHTML = '<option value="">Selecione...</option>';
                    if(select.id.includes('Filtro')) {
                        select.innerHTML = '<option value="">Todas</option>';
                    }
                    App.state.fazendas.sort((a, b) => parseInt(a.code) - parseInt(b.code)).forEach(farm => {
                        select.innerHTML += `<option value="${farm.id}">${farm.code} - ${farm.name}</option>`;
                    });
                    select.value = currentValue;
                });
            },
            populateUserSelects() {
                const select = App.elements.planejamento.responsavel;
                select.innerHTML = '<option value="">Selecione...</option>';
                App.state.users
                    .filter(u => u.role === 'tecnico' || u.role === 'colaborador' || u.role === 'supervisor' || u.role === 'admin')
                    .sort((a, b) => (a.username || '').localeCompare(b.username || ''))
                    .forEach(user => { select.innerHTML += `<option value="${user.username}">${user.username}</option>`; });
            },
            populateOperatorSelects() {
                const selects = [App.elements.perda.filtroOperador];
                selects.forEach(select => {
                    if (!select) return;

                    const currentValue = select.value;
                    let firstOptionHTML = '';
                    if (select.id === 'operadorFiltroPerda') {
                        firstOptionHTML = '<option value="">Todos</option>';
                    } else {
                        firstOptionHTML = '<option value="">Selecione um operador...</option>';
                    }
                    select.innerHTML = firstOptionHTML;
                    
                    App.state.personnel
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .forEach(p => {
                            select.innerHTML += `<option value="${p.matricula}">${p.matricula} - ${p.name}</option>`;
                        });
                    select.value = currentValue;
                });
            },
            renderFarmSelect() {
                const { farmSelect } = App.elements.cadastros;
                const currentValue = farmSelect.value;
                farmSelect.innerHTML = '<option value="">Selecione uma fazenda para gerir...</option>';
                App.state.fazendas.sort((a,b) => parseInt(a.code) - parseInt(b.code)).forEach(farm => {
                    farmSelect.innerHTML += `<option value="${farm.id}">${farm.code} - ${farm.name}</option>`;
                });
                farmSelect.value = currentValue;
                if(!currentValue) {
                    App.elements.cadastros.talhaoManagementContainer.style.display = 'none';
                }
            },
            renderTalhaoList(farmId) {
                const { talhaoList, talhaoManagementContainer, selectedFarmName, selectedFarmTypes } = App.elements.cadastros;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                talhaoList.innerHTML = '';
                if (!farm) {
                    talhaoManagementContainer.style.display = 'none';
                    selectedFarmName.innerHTML = '';
                    selectedFarmTypes.innerHTML = '';
                    return;
                }
                talhaoManagementContainer.style.display = 'block';
                
                selectedFarmName.innerHTML = `${farm.code} - ${farm.name}`;
                
                const farmTypesHTML = farm.types && farm.types.length > 0 ? `(${farm.types.join(', ')})` : '';
                selectedFarmTypes.innerHTML = `
                    <span style="font-weight: 500; font-size: 14px; color: var(--color-text-light); margin-left: 10px;">
                        ${farmTypesHTML}
                    </span>
                    <div style="display: inline-flex; gap: 5px; margin-left: 10px;">
                        <button class="btn-excluir" style="background:var(--color-info); margin-left: 0;" data-action="edit-farm" data-id="${farm.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn-excluir" data-action="delete-farm" data-id="${farm.id}"><i class="fas fa-trash"></i></button>
                    </div>
                `;

                if (!farm.talhoes || farm.talhoes.length === 0) {
                    talhaoList.innerHTML = '<p>Nenhum talhão cadastrado para esta fazenda.</p>';
                    return;
                }
                const table = document.createElement('table');
                table.id = 'personnelTable';
                table.className = 'harvestPlanTable';
                table.innerHTML = `<thead><tr><th>Nome</th><th>Área</th><th>TCH</th><th>Produção</th><th>Variedade</th><th>Corte</th><th>Distância</th><th>Última Colheita</th><th>Ações</th></tr></thead><tbody></tbody>`;
                const tbody = table.querySelector('tbody');
                farm.talhoes.sort((a,b) => a.name.localeCompare(b.name)).forEach(talhao => {
                    const row = tbody.insertRow();
                    const dataColheita = App.actions.formatDateForDisplay(talhao.dataUltimaColheita);

                    row.innerHTML = `
                        <td data-label="Nome">${talhao.name}</td>
                        <td data-label="Área">${talhao.area ? talhao.area.toFixed(2) : ''}</td>
                        <td data-label="TCH">${talhao.tch ? talhao.tch.toFixed(2) : ''}</td>
                        <td data-label="Produção">${talhao.producao ? talhao.producao.toFixed(2) : ''}</td>
                        <td data-label="Variedade">${talhao.variedade || ''}</td>
                        <td data-label="Corte">${talhao.corte || ''}</td>
                        <td data-label="Distância">${talhao.distancia ? talhao.distancia.toFixed(2) : ''}</td>
                        <td data-label="Última Colheita">${dataColheita}</td>
                        <td data-label="Ações">
                            <div style="display: flex; justify-content: flex-end; gap: 5px;">
                                <button class="btn-excluir" style="background:var(--color-info)" data-action="edit-talhao" data-id="${talhao.id}"><i class="fas fa-edit"></i></button>
                                <button class="btn-excluir" data-action="delete-talhao" data-id="${talhao.id}"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    `;
                });
                talhaoList.appendChild(table);
            },
            renderHarvestTalhaoSelection(farmId, plotIdsToCheck = []) {
                const { talhaoSelectionList, editingGroupId, selectAllTalhoes } = App.elements.harvest;
                talhaoSelectionList.innerHTML = '';
                selectAllTalhoes.checked = false;
                
                if (!farmId) {
                    talhaoSelectionList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Selecione uma fazenda para ver os talhões.</p>';
                    return;
                }
                
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm || !farm.talhoes || farm.talhoes.length === 0) {
                    talhaoSelectionList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Nenhum talhão cadastrado nesta fazenda.</p>';
                    return;
                }
                
                const allAssignedTalhaoIds = App.actions.getAssignedTalhaoIds(editingGroupId.value);
                const closedTalhaoIds = new Set(App.state.activeHarvestPlan?.closedTalhaoIds || []);
                
                const availableTalhoes = farm.talhoes.filter(t => !allAssignedTalhaoIds.has(t.id));
        
                const talhoesToShow = [...availableTalhoes];
                if (plotIdsToCheck.length > 0) {
                    const currentlyEditedTalhoes = farm.talhoes.filter(t => plotIdsToCheck.includes(t.id));
                    currentlyEditedTalhoes.forEach(t => {
                        if (!talhoesToShow.some(ts => ts.id === t.id)) {
                            talhoesToShow.push(t);
                        }
                    });
                }
        
                if (talhoesToShow.length === 0) {
                    talhaoSelectionList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Todos os talhões desta fazenda já foram alocados ou encerrados.</p>';
                    return;
                }
        
                talhoesToShow.sort((a,b) => a.name.localeCompare(b.name)).forEach(talhao => {
                    const isChecked = plotIdsToCheck.includes(talhao.id);
                    const isClosed = closedTalhaoIds.has(talhao.id);
                    
                    const label = document.createElement('label');
                    label.className = 'talhao-selection-item';
                    if (isClosed) {
                        label.classList.add('talhao-closed');
                    }
                    label.htmlFor = `talhao-select-${talhao.id}`;
            
                    label.innerHTML = `
                        <input type="checkbox" id="talhao-select-${talhao.id}" data-talhao-id="${talhao.id}" ${isChecked ? 'checked' : ''} ${isClosed ? 'disabled' : ''}>
                        <div class="talhao-name">${talhao.name}</div>
                        <div class="talhao-details">
                            <span><i class="fas fa-ruler-combined"></i>Área: ${talhao.area ? talhao.area.toFixed(2) : 0} ha</span>
                            <span><i class="fas fa-weight-hanging"></i>Produção: ${talhao.producao ? talhao.producao.toFixed(2) : 0} ton</span>
                            <span><i class="fas fa-seedling"></i>Variedade: ${talhao.variedade || 'N/A'}</span>
                            <span><i class="fas fa-cut"></i>Corte: ${talhao.corte || 'N/A'}</span>
                        </div>
                        ${isClosed ? '<div class="talhao-closed-overlay">Encerrado</div>' : ''}
                    `;
                    talhaoSelectionList.appendChild(label);
                });
            },
            updatePermissionsForRole(role, containerSelector = '#gerenciarUsuarios .permission-grid') {
                const permissions = App.config.roles[role] || {};
                const container = document.querySelector(containerSelector);
                if (container) {
                    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        const key = cb.dataset.permission;
                        cb.checked = !!permissions[key];
                    });
                }
            },
            _createModernUserCardHTML(user) {
                const getRoleInfo = (role) => {
                    const roles = { 
                        admin: ['Administrador', 'var(--color-danger)'], 
                        supervisor: ['Supervisor', 'var(--color-warning)'], 
                        tecnico: ['Técnico', 'var(--color-info)'], 
                        colaborador: ['Colaborador', 'var(--color-purple)'], 
                        user: ['Utilizador', 'var(--color-text-light)'] 
                    };
                    return roles[role] || ['Desconhecido', '#718096'];
                };
        
                const [roleName, roleColor] = getRoleInfo(user.role);
                const avatarLetter = (user.username || user.email).charAt(0).toUpperCase();
        
                const buttonsHTML = user.email.toLowerCase() === 'admin@agrovetor.com' ? '' : `
                    <button class="toggle-btn ${user.active ? 'inactive' : 'active'}" data-action="toggle" data-id="${user.id}">
                        ${user.active ? '<i class="fas fa-ban"></i> Desativar' : '<i class="fas fa-check"></i> Ativar'}
                    </button>
                    <button data-action="edit" data-id="${user.id}"><i class="fas fa-edit"></i> Editar</button>
                `;
        
                return `
                    <div class="user-card-redesigned" style="border-left-color: ${roleColor};">
                        <div class="user-card-header">
                            <div class="user-card-info">
                                <div class="user-card-avatar" style="background-color: ${roleColor}20; color: ${roleColor};">${avatarLetter}</div>
                                <div class="user-card-details">
                                    <h4>${user.username || 'N/A'}</h4>
                                    <p>${user.email}</p>
                                </div>
                            </div>
                            <div class="user-card-status ${user.active ? 'active' : 'inactive'}">
                                <i class="fas fa-circle"></i> ${user.active ? 'Ativo' : 'Inativo'}
                            </div>
                        </div>
                        <div>
                            <span class="user-card-role" style="background-color: ${roleColor};">${roleName}</span>
                        </div>
                        <div class="user-card-actions">
                            ${buttonsHTML}
                        </div>
                    </div>`;
            },
            renderUsersList() { 
                const { list } = App.elements.users; 
                list.innerHTML = App.state.users
                    .sort((a,b) => (a.username || '').localeCompare(b.username || ''))
                    .map((u) => this._createModernUserCardHTML(u))
                    .join(''); 
            },
            renderPersonnelList() {
                const { list } = App.elements.personnel;
                list.innerHTML = '';
                if (App.state.personnel.length === 0) {
                    list.innerHTML = '<p>Nenhuma pessoa cadastrada.</p>';
                    return;
                }
                const table = document.createElement('table');
                table.id = 'personnelTable';
                table.className = 'harvestPlanTable';
                table.innerHTML = `<thead><tr><th>Matrícula</th><th>Nome</th><th>Ações</th></tr></thead><tbody></tbody>`;
                const tbody = table.querySelector('tbody');
                App.state.personnel.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
                    const row = tbody.insertRow();
                    row.innerHTML = `
                        <td data-label="Matrícula">${p.matricula}</td>
                        <td data-label="Nome">${p.name}</td>
                        <td data-label="Ações">
                            <div style="display: flex; justify-content: flex-end; gap: 5px;">
                                <button class="btn-excluir" style="background:var(--color-info)" data-action="edit-personnel" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                                <button class="btn-excluir" data-action="delete-personnel" data-id="${p.id}"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    `;
                });
                list.appendChild(table);
            },
            renderLogoPreview() {
                const { logoPreview, removeLogoBtn } = App.elements.companyConfig;
                if (App.state.companyLogo) {
                    logoPreview.src = App.state.companyLogo;
                    logoPreview.style.display = 'block';
                    removeLogoBtn.style.display = 'inline-flex';
                } else {
                    logoPreview.style.display = 'none';
                    removeLogoBtn.style.display = 'none';
                }
            },
            renderExclusao() {
                const { lista } = App.elements.exclusao; lista.innerHTML = ''; let content = '';
                if (App.state.registros.length > 0) {
                    content += `<h3>Brocamento</h3>`;
                    content += App.state.registros.map((reg) => `<div class="user-card"><strong>${reg.fazenda}</strong> - ${reg.talhao} (${reg.data}) <button class="btn-excluir" data-type="brocamento" data-id="${reg.id}"><i class="fas fa-trash"></i> Excluir</button></div>`).join('');
                }
                if (App.state.perdas.length > 0) {
                    content += `<h3 style="margin-top:20px;">Perda de Cana</h3>`;
                    content += App.state.perdas.map((p) => `<div class="user-card"><strong>${p.fazenda}</strong> - ${p.talhao} (${p.data}) <button class="btn-excluir" data-type="perda" data-id="${p.id}"><i class="fas fa-trash"></i> Excluir</button></div>`).join('');
                }
                lista.innerHTML = content || '<p>Nenhum lançamento encontrado.</p>';
            },
            renderPlanejamento() {
                const { lista } = App.elements.planejamento; lista.innerHTML = '';
                const hoje = new Date(); hoje.setHours(0,0,0,0);
                const planosOrdenados = [...App.state.planos].sort((a,b) => new Date(a.dataPrevista) - new Date(b.dataPrevista));
                if(planosOrdenados.length === 0) { lista.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--color-text-light);">Nenhuma inspeção planejada.</p>'; return; }
                planosOrdenados.forEach(plano => {
                    let status = plano.status;
                    const dataPlano = new Date(plano.dataPrevista + 'T03:00:00Z');
                    if (plano.status === 'Pendente' && dataPlano < hoje) { status = 'Atrasado'; }
                    const fazenda = App.state.fazendas.find(f => f.code === plano.fazendaCodigo);
                    const fazendaNome = fazenda ? `${fazenda.code} - ${farm.name}` : 'Desconhecida';
                    const card = document.createElement('div'); card.className = 'plano-card';
                    card.innerHTML = `<div class="plano-header"><span class="plano-title"><i class="fas fa-${plano.tipo === 'broca' ? 'bug' : 'dollar-sign'}"></i> ${fazendaNome} - Talhão: ${plano.talhao}</span><span class="plano-status ${status.toLowerCase()}">${status}</span></div><div class="plano-details"><div><i class="fas fa-calendar-day"></i> Data Prevista: ${dataPlano.toLocaleDateString('pt-BR')}</div><div><i class="fas fa-user-check"></i> Responsável: ${plano.usuarioResponsavel}</div>${plano.meta ? `<div><i class="fas fa-bullseye"></i> Meta: ${plano.meta}</div>` : ''}</div>${plano.observacoes ? `<div style="margin-top:8px;font-size:14px;"><i class="fas fa-info-circle"></i> Obs: ${plano.observacoes}</div>` : ''}<div class="plano-actions">${status !== 'Concluído' ? `<button class="btn-excluir" style="background-color: var(--color-success)" data-action="concluir" data-id="${plano.id}"><i class="fas fa-check"></i> Marcar Concluído</button>` : ''}<button class="btn-excluir" data-action="excluir" data-id="${plano.id}"><i class="fas fa-trash"></i> Excluir</button></div>`;
                    lista.appendChild(card);
                });
            },
            showHarvestPlanList() {
                App.state.activeHarvestPlan = null;
                App.elements.harvest.plansListContainer.style.display = 'block';
                App.elements.harvest.planEditor.style.display = 'none';
                this.renderHarvestPlansList();
            },
            showHarvestPlanEditor() {
                App.elements.harvest.plansListContainer.style.display = 'none';
                App.elements.harvest.planEditor.style.display = 'block';
            },
            renderHarvestPlansList() {
                const { plansList } = App.elements.harvest;
                plansList.innerHTML = '';
                if(App.state.harvestPlans.length === 0) {
                    plansList.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--color-text-light);">Nenhum plano de colheita criado. Clique em "Novo Plano" para começar.</p>';
                    return;
                }
                App.state.harvestPlans.forEach(plan => {
                    const totalProducao = plan.sequence.reduce((sum, group) => sum + group.totalProducao, 0);
                    const card = document.createElement('div');
                    card.className = 'plano-card';
                    card.innerHTML = `
                        <div class="plano-header">
                            <span class="plano-title"><i class="fas fa-stream"></i> ${plan.frontName}</span>
                            <span class="plano-status pendente">${plan.sequence.length} fazenda(s)</span>
                        </div>
                        <div class="plano-details">
                            <div><i class="fas fa-calendar-day"></i> Início: ${new Date(plan.startDate + 'T03:00:00Z').toLocaleDateString('pt-BR')}</div>
                            <div><i class="fas fa-tasks"></i> ${plan.dailyRate} ton/dia</div>
                            <div><i class="fas fa-weight-hanging"></i> Total: ${totalProducao.toFixed(2)} ton</div>
                        </div>
                        <div class="plano-actions">
                            <button class="btn-excluir" style="background-color: var(--color-info); margin-left: 0;" data-action="edit" data-id="${plan.id}"><i class="fas fa-edit"></i> Editar</button>
                            <button class="btn-excluir" data-action="delete" data-id="${plan.id}"><i class="fas fa-trash"></i> Excluir</button>
                        </div>
                    `;
                    plansList.appendChild(card);
                });
            },
            renderHarvestSequence() {
                if (!App.state.activeHarvestPlan) return;
                const { tableBody, summary } = App.elements.harvest;
                const { startDate, dailyRate, sequence, closedTalhaoIds = [] } = App.state.activeHarvestPlan;
                
                tableBody.innerHTML = '';
                let grandTotalProducao = 0;
                let grandTotalArea = 0;

                let currentDate = startDate ? new Date(startDate + 'T03:00:00Z') : new Date();
                if (isNaN(currentDate.getTime())) {
                    currentDate = new Date();
                }
                const dailyTon = parseFloat(dailyRate) > 0 ? parseFloat(dailyRate) : 1;

                sequence.forEach((group, index) => {
                    const producaoConsiderada = group.totalProducao - (group.producaoColhida || 0);

                    grandTotalProducao += group.totalProducao;
                    grandTotalArea += group.totalArea;

                    const diasNecessarios = Math.ceil(producaoConsiderada / dailyTon);
                    
                    const dataEntrada = new Date(currentDate.getTime());
                    
                    let dataSaida = new Date(dataEntrada.getTime());
                    if (diasNecessarios > 0) {
                        dataSaida.setDate(dataSaida.getDate() + diasNecessarios - 1);
                    }
                    
                    currentDate = new Date(dataSaida.getTime());
                    currentDate.setDate(currentDate.getDate() + 1);
                    
                    const idadeMediaMeses = App.actions.calculateAverageAge(group, dataEntrada);
                    const diasAplicacao = App.actions.calculateMaturadorDays(group);

                    const areaColhida = group.areaColhida || 0;
                    const producaoColhida = group.producaoColhida || 0;

                    const row = tableBody.insertRow();
                    row.draggable = true;
                    row.dataset.id = group.id;
                    
                    row.innerHTML = `
                        <td data-label="Seq.">${index + 1}</td>
                        <td data-label="Fazenda">${group.fazendaCodigo} - ${group.fazendaName}</td>
                        <td data-label="Talhões" class="talhao-list-cell">${group.plots.map(p => p.talhaoName).join(', ')}</td>
                        <td data-label="Área (ha)">${areaColhida.toFixed(2)} / ${group.totalArea.toFixed(2)}</td>
                        <td data-label="Prod. (ton)">${producaoColhida.toFixed(2)} / ${group.totalProducao.toFixed(2)}</td>
                        <td data-label="ATR"><span class="editable-atr" data-id="${group.id}">${group.atr || 'N/A'}</span></td>
                        <td data-label="Idade (m)">${idadeMediaMeses}</td>
                        <td data-label="Maturador">${group.maturador || 'N/A'}</td>
                        <td data-label="Dias Aplic.">${diasAplicacao}</td>
                        <td data-label="Ação">
                            <div style="display: flex; justify-content: flex-end; gap: 5px;">
                                <button class="btn-excluir" style="background-color: var(--color-info);" title="Editar Grupo no Plano" data-action="edit-harvest-group" data-id="${group.id}"><i class="fas fa-edit"></i></button>
                                <button class="btn-excluir" title="Remover Grupo do Plano" data-action="remove-harvest" data-id="${group.id}"><i class="fas fa-times"></i></button>
                            </div>
                        </td>
                        <td data-label="Entrada">${dataEntrada.toLocaleDateString('pt-BR')}</td>
                        <td data-label="Saída">${dataSaida.toLocaleDateString('pt-BR')}</td>
                    `;
                });

                if (sequence.length > 0) {
                    const allVarieties = new Set();
                    sequence.forEach(group => {
                        const farm = App.state.fazendas.find(f => f.code === group.fazendaCodigo);
                        if(farm) {
                            group.plots.forEach(plot => {
                                const talhao = farm.talhoes.find(t => t.id === plot.talhaoId);
                                if(talhao && talhao.variedade) {
                                    allVarieties.add(talhao.variedade);
                                }
                            });
                        }
                    });
                    const varietiesString = allVarieties.size > 0 ? Array.from(allVarieties).join(', ') : 'N/A';
                    
                    const finalDate = new Date(currentDate.getTime());
                    finalDate.setDate(finalDate.getDate() - 1);

                    summary.innerHTML = `
                        <p>Produção Total (Ativa): <span>${grandTotalProducao.toFixed(2)} ton</span></p>
                        <p>Área Total (Ativa): <span>${grandTotalArea.toFixed(2)} ha</span></p>
                        <p>Data Final de Saída Prevista: <span>${finalDate.toLocaleDateString('pt-BR')}</span></p>
                        <p>Variedades na Sequência: <span>${varietiesString}</span></p>
                    `;
                } else {
                    summary.innerHTML = '<p>Adicione fazendas à sequência para ver o resumo da colheita.</p>';
                }
            },
            validateFields(ids) { return ids.every(id => { const el = document.getElementById(id); const valid = el.value.trim() !== ''; el.style.borderColor = valid ? 'var(--color-border)' : 'var(--color-danger)'; if (!valid) el.focus(); return valid; }); },
            updateBrocadoTotal() {
                const { broca } = App.elements;
                const base = parseInt(broca.base.value) || 0;
                const meio = parseInt(broca.meio.value) || 0;
                const topo = parseInt(broca.topo.value) || 0;
                broca.brocado.value = base + meio + topo;
            },
            calculateBrocamento() {
                const entrenos = parseInt(App.elements.broca.entrenos.value) || 0;
                const brocado = parseInt(App.elements.broca.brocado.value) || 0;
                const resultadoEl = App.elements.broca.resultado;
                if (entrenos > 0) {
                    const porcentagem = (brocado / entrenos) * 100;
                    resultadoEl.textContent = `Brocamento: ${porcentagem.toFixed(2).replace('.', ',')}%`;
                    resultadoEl.style.color = porcentagem > 20 ? 'var(--color-danger)' : 'var(--color-success)';
                } else {
                    resultadoEl.textContent = '';
                }
            },
            calculatePerda() {
                const fields = ['canaInteira', 'tolete', 'toco', 'ponta', 'estilhaco', 'pedaco'];
                const total = fields.reduce((sum, id) => sum + (parseFloat(document.getElementById(id).value) || 0), 0);
                App.elements.perda.resultado.textContent = `Total Perda: ${total.toFixed(2).replace('.', ',')} kg`;
            },
            showConfirmationModal(message, onConfirm, needsInput = false) {
                const { overlay, title, message: msgEl, confirmBtn, cancelBtn, closeBtn, inputContainer, input } = App.elements.confirmationModal;
                title.textContent = "Confirmar Ação";
                msgEl.textContent = message;
                input.value = '';
                inputContainer.style.display = needsInput ? 'block' : 'none';
                
                const confirmHandler = () => {
                    const inputValue = needsInput ? input.value : null;
                    onConfirm(inputValue);
                    closeHandler();
                };
                
                const closeHandler = () => {
                    overlay.classList.remove('show');
                    confirmBtn.removeEventListener('click', confirmHandler);
                    cancelBtn.removeEventListener('click', closeHandler);
                    closeBtn.removeEventListener('click', closeHandler);
                    setTimeout(() => {
                        confirmBtn.textContent = "Confirmar";
                        cancelBtn.style.display = 'inline-flex';
                    }, 300);
                };
                
                confirmBtn.addEventListener('click', confirmHandler);
                cancelBtn.addEventListener('click', closeHandler);
                closeBtn.addEventListener('click', closeHandler);
                overlay.classList.add('show');
                if(needsInput) input.focus();
            },
            showAdminPasswordConfirmModal() {
                App.elements.adminPasswordConfirmModal.overlay.classList.add('show');
                App.elements.adminPasswordConfirmModal.passwordInput.focus();
            },
            closeAdminPasswordConfirmModal() {
                App.elements.adminPasswordConfirmModal.overlay.classList.remove('show');
                App.elements.adminPasswordConfirmModal.passwordInput.value = '';
            },
            openUserEditModal(userId) {
                const modalEls = App.elements.userEditModal;
                const user = App.state.users.find(u => u.id == userId);
                if (!user) return;

                modalEls.editingUserId.value = user.id;
                modalEls.title.textContent = `Editar Utilizador: ${user.username}`;
                modalEls.username.value = user.username;
                modalEls.role.value = user.role;

                this.renderPermissionItems(modalEls.permissionGrid, user.permissions);

                modalEls.overlay.classList.add('show');
            },
            closeUserEditModal() {
                App.elements.userEditModal.overlay.classList.remove('show');
            },
            openEditFarmModal(farmId) {
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) return;
                const modal = App.elements.editFarmModal;
                modal.editingFarmId.value = farm.id;
                modal.nameInput.value = farm.name;

                modal.typeCheckboxes.forEach(cb => {
                    cb.checked = farm.types && farm.types.includes(cb.value);
                });

                modal.overlay.classList.add('show');
                modal.nameInput.focus();
            },
            closeEditFarmModal() {
                App.elements.editFarmModal.overlay.classList.remove('show');
            },
            applyTheme(theme) {
                document.body.className = theme;
                App.elements.userMenu.themeButtons.forEach(btn => {
                    btn.classList.toggle('active', btn.id === theme);
                });
                localStorage.setItem(App.config.themeKey, theme);
                
                Chart.defaults.color = this._getThemeColors().text;

                if (App.state.currentUser && document.getElementById('dashboard').classList.contains('active')) {
                    if(document.getElementById('dashboard-broca').style.display !== 'none') {
                        setTimeout(() => App.charts.renderBrocaDashboardCharts(), 50);
                    }
                    if(document.getElementById('dashboard-perda').style.display !== 'none') {
                        setTimeout(() => App.charts.renderPerdaDashboardCharts(), 50);
                    }
                }
            },
            enableEnterKeyNavigation(formSelector) {
                const form = document.querySelector(formSelector);
                if (!form) return;

                form.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
                        e.preventDefault();
                        const fields = Array.from(
                            form.querySelectorAll('input:not([readonly]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
                        );
                        const currentIndex = fields.indexOf(e.target);
                        const nextField = fields[currentIndex + 1];

                        if (nextField) {
                            nextField.focus();
                        } else {
                            form.querySelector('.save, #btnConfirmarOrdemCorte, #btnLogin')?.focus();
                        }
                    }
                });
            },
            _createPermissionItemHTML(perm, permissions = {}) {
                if (!perm.permission) return '';
                const isChecked = permissions[perm.permission];
                return `
                    <label class="permission-item">
                        <input type="checkbox" data-permission="${perm.permission}" ${isChecked ? 'checked' : ''}>
                        <div class="permission-content">
                            <i class="${perm.icon}"></i>
                            <span>${perm.label}</span>
                        </div>
                        <div class="toggle-switch">
                            <span class="slider"></span>
                        </div>
                    </label>
                `;
            },
            renderPermissionItems(container, permissions = {}) {
                if (!container) return;
                container.innerHTML = '';
                const permissionItems = App.config.menuConfig.flatMap(item => 
                    item.submenu ? item.submenu.filter(sub => sub.permission) : (item.permission ? [item] : [])
                );
                permissionItems.forEach(perm => {
                    container.innerHTML += this._createPermissionItemHTML(perm, permissions);
                });
            },
            setupEventListeners() {
                App.elements.btnLogin.addEventListener('click', () => App.auth.login());
                App.elements.logoutBtn.addEventListener('click', () => App.auth.logout());
                App.elements.btnToggleMenu.addEventListener('click', () => {
                    document.body.classList.toggle('mobile-menu-open');
                    App.elements.menu.classList.toggle('open');
                    App.elements.btnToggleMenu.classList.toggle('open');
                });
                
                document.addEventListener('click', (e) => {
                    if (!App.elements.menu.contains(e.target) && !App.elements.btnToggleMenu.contains(e.target)) {
                        this.closeAllMenus();
                    }
                    if (App.elements.userMenu.container && !App.elements.userMenu.container.contains(e.target)) {
                        App.elements.userMenu.dropdown.classList.remove('show');
                        App.elements.userMenu.toggle.classList.remove('open');
                        App.elements.userMenu.toggle.setAttribute('aria-expanded', 'false');
                    }
                    if (App.elements.notificationBell.container && !App.elements.notificationBell.container.contains(e.target)) {
                        App.elements.notificationBell.dropdown.classList.remove('show');
                    }
                });

                App.elements.userMenu.toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dropdown = App.elements.userMenu.dropdown;
                    const toggle = App.elements.userMenu.toggle;
                    const isShown = dropdown.classList.toggle('show');
                    toggle.classList.toggle('open', isShown);
                    toggle.setAttribute('aria-expanded', isShown);
                    App.elements.notificationBell.dropdown.classList.remove('show');
                });

                App.elements.notificationBell.toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dropdown = App.elements.notificationBell.dropdown;
                    const isShown = dropdown.classList.toggle('show');
                    if (isShown) {
                        App.actions.markNotificationsAsRead();
                    }
                    App.elements.userMenu.dropdown.classList.remove('show');
                });

                // NOVO: Event listener para o botão de limpar notificações
                App.elements.notificationBell.clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    App.actions.clearAllNotifications();
                });

                // NOVO: Event listener para os itens da lista de notificação
                App.elements.notificationBell.list.addEventListener('click', (e) => {
                    const item = e.target.closest('.notification-item');
                    if (item && item.dataset.trapId) {
                        const trapId = item.dataset.trapId;
                        App.ui.showTab('monitoramentoAereo');
                        App.mapModule.centerOnTrap(trapId);
                        App.elements.notificationBell.dropdown.classList.remove('show');
                    }
                });

                App.elements.userMenu.themeButtons.forEach(btn => {
                    btn.addEventListener('click', () => this.applyTheme(btn.id));
                });
                
                const dashEls = App.elements.dashboard;
                dashEls.cardBroca.addEventListener('click', () => this.showDashboardView('broca'));
                dashEls.cardPerda.addEventListener('click', () => this.showDashboardView('perda'));
                dashEls.cardAerea.addEventListener('click', () => this.showDashboardView('aerea'));
                dashEls.btnBackToSelectorBroca.addEventListener('click', () => this.showDashboardView('selector'));
                dashEls.btnBackToSelectorPerda.addEventListener('click', () => this.showDashboardView('selector'));
                dashEls.btnBackToSelectorAerea.addEventListener('click', () => this.showDashboardView('selector'));
                dashEls.btnFiltrarBrocaDashboard.addEventListener('click', () => App.charts.renderBrocaDashboardCharts());
                dashEls.btnFiltrarPerdaDashboard.addEventListener('click', () => App.charts.renderPerdaDashboardCharts());
                
                const chartModal = App.elements.chartModal;
                chartModal.closeBtn.addEventListener('click', () => App.charts.closeChartModal());
                chartModal.overlay.addEventListener('click', e => { if(e.target === chartModal.overlay) App.charts.closeChartModal(); });
                
                document.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-expand-chart')) {
                        const button = e.target.closest('.btn-expand-chart');
                        App.charts.openChartModal(button.dataset.chartId);
                    }
                });

                App.elements.users.role.addEventListener('change', (e) => this.updatePermissionsForRole(e.target.value));
                
                App.elements.users.btnCreate.addEventListener('click', () => App.auth.initiateUserCreation());
                
                App.elements.users.list.addEventListener('click', e => {
                    const button = e.target.closest('button[data-action]');
                    if (!button) return;
                    const { action, id } = button.dataset;
                    if (action === 'edit') this.openUserEditModal(id);
                    if (action === 'toggle') App.auth.toggleUserStatus(id);
                });

                const adminModal = App.elements.adminPasswordConfirmModal;
                adminModal.closeBtn.addEventListener('click', () => this.closeAdminPasswordConfirmModal());
                adminModal.cancelBtn.addEventListener('click', () => this.closeAdminPasswordConfirmModal());
                adminModal.confirmBtn.addEventListener('click', () => App.auth.createUserAfterAdminConfirmation());
                adminModal.overlay.addEventListener('click', e => { if(e.target === adminModal.overlay) this.closeAdminPasswordConfirmModal(); });


                const modalEls = App.elements.userEditModal;
                modalEls.closeBtn.addEventListener('click', () => this.closeUserEditModal());
                modalEls.overlay.addEventListener('click', e => { if(e.target === modalEls.overlay) this.closeUserEditModal(); });
                modalEls.btnSaveChanges.addEventListener('click', () => App.auth.saveUserChanges(modalEls.editingUserId.value));
                modalEls.btnResetPassword.addEventListener('click', () => App.auth.resetUserPassword(modalEls.editingUserId.value));
                modalEls.btnDeleteUser.addEventListener('click', () => App.auth.deleteUser(modalEls.editingUserId.value));
                modalEls.role.addEventListener('change', (e) => this.updatePermissionsForRole(e.target.value, '#editUserPermissionGrid'));
                
                
                const cpModal = App.elements.changePasswordModal;
                App.elements.userMenu.changePasswordBtn.addEventListener('click', () => cpModal.overlay.classList.add('show'));
                cpModal.closeBtn.addEventListener('click', () => cpModal.overlay.classList.remove('show'));
                cpModal.cancelBtn.addEventListener('click', () => cpModal.overlay.classList.remove('show'));
                cpModal.saveBtn.addEventListener('click', () => App.actions.changePassword());


                App.elements.personnel.btnSave.addEventListener('click', () => App.actions.savePersonnel());
                App.elements.personnel.list.addEventListener('click', e => {
                    const btn = e.target.closest('button');
                    if (!btn) return;
                    const { action, id } = btn.dataset;
                    if (action === 'edit-personnel') App.actions.editPersonnel(id);
                    if (action === 'delete-personnel') App.actions.deletePersonnel(id);
                });
                App.elements.personnel.csvUploadArea.addEventListener('click', () => App.elements.personnel.csvFileInput.click());
                App.elements.personnel.csvFileInput.addEventListener('change', (e) => App.actions.importPersonnelFromCSV(e.target.files[0]));
                App.elements.personnel.btnDownloadCsvTemplate.addEventListener('click', () => App.actions.downloadPersonnelCsvTemplate());
                
                const companyConfigEls = App.elements.companyConfig;
                companyConfigEls.logoUploadArea.addEventListener('click', () => companyConfigEls.logoInput.click());
                companyConfigEls.logoInput.addEventListener('change', (e) => App.actions.handleLogoUpload(e));
                companyConfigEls.removeLogoBtn.addEventListener('click', () => App.actions.removeLogo());
                companyConfigEls.progressUploadArea.addEventListener('click', () => companyConfigEls.progressInput.click());
                companyConfigEls.progressInput.addEventListener('change', (e) => App.actions.importHarvestReport(e.target.files[0], 'progress'));
                companyConfigEls.btnDownloadProgressTemplate.addEventListener('click', () => App.actions.downloadHarvestReportTemplate('progress'));
                companyConfigEls.closedUploadArea.addEventListener('click', () => companyConfigEls.closedInput.click());
                companyConfigEls.closedInput.addEventListener('change', (e) => App.actions.importHarvestReport(e.target.files[0], 'closed'));
                companyConfigEls.btnDownloadClosedTemplate.addEventListener('click', () => App.actions.downloadHarvestReportTemplate('closed'));
                companyConfigEls.shapefileUploadArea.addEventListener('click', () => companyConfigEls.shapefileInput.click());
                companyConfigEls.shapefileInput.addEventListener('change', (e) => App.mapModule.handleShapefileUpload(e));


                App.elements.cadastros.btnSaveFarm.addEventListener('click', () => App.actions.saveFarm());
                App.elements.cadastros.btnDeleteAllFarms.addEventListener('click', () => App.actions.deleteAllFarms());
                App.elements.cadastros.farmSelect.addEventListener('change', (e) => this.renderTalhaoList(e.target.value));
                
                App.elements.cadastros.talhaoManagementContainer.addEventListener('click', e => { 
                    const btn = e.target.closest('button[data-action]'); 
                    if(!btn) return; 
                    const { action, id } = btn.dataset; 
                    if(action === 'edit-talhao') App.actions.editTalhao(id); 
                    if(action === 'delete-talhao') App.actions.deleteTalhao(id);
                    if(action === 'edit-farm') this.openEditFarmModal(id);
                    if(action === 'delete-farm') App.actions.deleteFarm(id);
                });

                App.elements.cadastros.btnSaveTalhao.addEventListener('click', () => App.actions.saveTalhao());
                App.elements.cadastros.csvUploadArea.addEventListener('click', () => App.elements.cadastros.csvFileInput.click());
                App.elements.cadastros.csvFileInput.addEventListener('change', (e) => App.actions.importFarmsFromCSV(e.target.files[0]));
                App.elements.cadastros.btnDownloadCsvTemplate.addEventListener('click', () => App.actions.downloadCsvTemplate());
                App.elements.cadastros.talhaoArea.addEventListener('input', App.actions.calculateTalhaoProducao);
                App.elements.cadastros.talhaoTCH.addEventListener('input', App.actions.calculateTalhaoProducao);
                
                const editFarmModalEls = App.elements.editFarmModal;
                editFarmModalEls.closeBtn.addEventListener('click', () => this.closeEditFarmModal());
                editFarmModalEls.cancelBtn.addEventListener('click', () => this.closeEditFarmModal());
                editFarmModalEls.saveBtn.addEventListener('click', () => App.actions.saveFarmChanges());

                App.elements.planejamento.btnAgendar.addEventListener('click', () => App.actions.agendarInspecao());
                App.elements.planejamento.btnSugerir.addEventListener('click', () => App.gemini.getPlanningSuggestions());
                App.elements.planejamento.lista.addEventListener('click', (e) => { const button = e.target.closest('button[data-action]'); if(!button) return; const { action, id } = button.dataset; if (action === 'concluir') App.actions.marcarPlanoComoConcluido(id); if (action === 'excluir') App.actions.excluirPlano(id); });
                
                App.elements.harvest.btnAddNew.addEventListener('click', () => App.actions.editHarvestPlan());
                App.elements.harvest.btnCancelPlan.addEventListener('click', () => this.showHarvestPlanList());
                App.elements.harvest.btnSavePlan.addEventListener('click', () => App.actions.saveHarvestPlan());
                App.elements.harvest.plansList.addEventListener('click', (e) => {
                    const button = e.target.closest('button[data-action]');
                    if (!button) return;
                    const { action, id } = button.dataset;
                    if (action === 'edit') App.actions.editHarvestPlan(id);
                    if (action === 'delete') App.actions.deleteHarvestPlan(id);
                });
                App.elements.harvest.fazenda.addEventListener('change', e => this.renderHarvestTalhaoSelection(e.target.value));
                
                App.elements.harvest.selectAllTalhoes.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    const talhaoCheckboxes = App.elements.harvest.talhaoSelectionList.querySelectorAll('input[type="checkbox"]');
                    talhaoCheckboxes.forEach(cb => {
                        if (!cb.disabled) {
                            cb.checked = isChecked;
                        }
                    });
                });

                App.elements.harvest.btnAddOrUpdate.addEventListener('click', () => App.actions.addOrUpdateHarvestSequence());
                App.elements.harvest.btnCancelEdit.addEventListener('click', () => App.actions.cancelEditSequence());
                App.elements.harvest.btnOptimize.addEventListener('click', () => App.gemini.getOptimizedHarvestSequence());
                App.elements.harvest.tableBody.addEventListener('click', e => {
                    const removeBtn = e.target.closest('button[data-action="remove-harvest"]');
                    if (removeBtn) App.actions.removeHarvestSequence(removeBtn.dataset.id);
                    const editBtn = e.target.closest('button[data-action="edit-harvest-group"]');
                    if(editBtn) App.actions.editHarvestSequenceGroup(editBtn.dataset.id);
                    const atrSpan = e.target.closest('.editable-atr');
                    if (atrSpan) App.actions.editHarvestSequenceATR(atrSpan.dataset.id);
                });
                [App.elements.harvest.frontName, App.elements.harvest.startDate, App.elements.harvest.dailyRate].forEach(el => el.addEventListener('input', () => App.actions.updateActiveHarvestPlanDetails()));
                
                let dragSrcEl = null;
                App.elements.harvest.tableBody.addEventListener('dragstart', e => { dragSrcEl = e.target; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', e.target.innerHTML); });
                App.elements.harvest.tableBody.addEventListener('dragover', e => { e.preventDefault(); return false; });
                App.elements.harvest.tableBody.addEventListener('drop', e => { e.stopPropagation(); if (dragSrcEl !== e.target) { const targetRow = e.target.closest('tr'); if(targetRow) App.actions.reorderHarvestSequence(dragSrcEl.dataset.id, targetRow.dataset.id); } return false; });
                
                App.elements.broca.codigo.addEventListener('change', () => App.actions.findVarietyForTalhao('broca'));
                App.elements.broca.talhao.addEventListener('input', () => App.actions.findVarietyForTalhao('broca'));
                ['brocaBase', 'brocaMeio', 'brocaTopo', 'entrenos'].forEach(id => {
                    document.getElementById(id).addEventListener('input', () => {
                        App.ui.updateBrocadoTotal();
                        App.ui.calculateBrocamento();
                    });
                });
                
                App.elements.perda.codigo.addEventListener('change', () => App.actions.findVarietyForTalhao('perda'));
                App.elements.perda.talhao.addEventListener('input', () => App.actions.findVarietyForTalhao('perda'));
                App.elements.perda.matricula.addEventListener('input', () => App.actions.findOperatorName());
                ['canaInteira', 'tolete', 'toco', 'ponta', 'estilhaco', 'pedaco'].forEach(id => {
                    document.getElementById(id).addEventListener('input', () => App.ui.calculatePerda());
                });
                
                App.elements.broca.btnSalvar.addEventListener('click', () => App.actions.saveBrocamento());
                App.elements.perda.btnSalvar.addEventListener('click', () => App.actions.savePerda());
                
                App.elements.broca.btnPDF.addEventListener('click', () => App.reports.generateBrocamentoPDF());
                App.elements.broca.btnExcel.addEventListener('click', () => App.reports.generateBrocamentoCSV());
                App.elements.perda.btnPDF.addEventListener('click', () => App.reports.generatePerdaPDF());
                App.elements.perda.btnExcel.addEventListener('click', () => App.reports.generatePerdaCSV());
                App.elements.exclusao.lista.addEventListener('click', e => { const button = e.target.closest('button.btn-excluir'); if (button) App.actions.deleteEntry(button.dataset.type, button.dataset.id); });
                
                const customReportEls = App.elements.relatorioColheita;
                customReportEls.btnPDF.addEventListener('click', () => App.reports.generateCustomHarvestReport('pdf'));
                customReportEls.btnExcel.addEventListener('click', () => App.reports.generateCustomHarvestReport('csv'));
                customReportEls.tipoRelatorioSelect.addEventListener('change', (e) => {
                    const isDetalhado = e.target.value === 'detalhado';
                    customReportEls.colunasDetalhadoContainer.style.display = isDetalhado ? 'block' : 'none';
                });
                
                App.elements.monitoramentoAereo.btnAddTrap.addEventListener('click', () => App.mapModule.promptInstallTrap());
                App.elements.monitoramentoAereo.btnCenterMap.addEventListener('click', () => App.mapModule.centerMapOnUser());
                App.elements.monitoramentoAereo.infoBoxCloseBtn.addEventListener('click', () => App.mapModule.hideTalhaoInfo());
                App.elements.monitoramentoAereo.trapInfoBoxCloseBtn.addEventListener('click', () => App.mapModule.hideTrapInfo());
                
                const trapModal = App.elements.trapPlacementModal;
                trapModal.closeBtn.addEventListener('click', () => App.mapModule.hideTrapPlacementModal());
                trapModal.cancelBtn.addEventListener('click', () => App.mapModule.hideTrapPlacementModal());
                trapModal.manualBtn.addEventListener('click', () => App.mapModule.showTrapPlacementModal('manual_select'));
                trapModal.confirmBtn.addEventListener('click', () => {
                    const { trapPlacementMode, trapPlacementData, googleUserMarker } = App.state;
                    if (!googleUserMarker) return;

                    let selectedFeature = null;

                    if (trapPlacementMode === 'success') {
                        selectedFeature = trapPlacementData.feature;
                    } else if (trapPlacementMode === 'conflict') {
                        const selectedRadio = document.querySelector('input[name="talhaoConflict"]:checked');
                        if (selectedRadio) {
                            const selectedIndex = parseInt(selectedRadio.value, 10);
                            selectedFeature = trapPlacementData.features[selectedIndex];
                        } else {
                            App.ui.showAlert("Por favor, selecione um talhão.", "warning");
                            return;
                        }
                    }

                    if (selectedFeature) {
                        const position = googleUserMarker.getPosition();
                        App.mapModule.installTrap(position.lat(), position.lng(), selectedFeature);
                        App.mapModule.hideTrapPlacementModal();
                    }
                });

                App.elements.relatorioMonitoramento.btnPDF.addEventListener('click', () => App.reports.generateMonitoramentoPDF());
                App.elements.relatorioMonitoramento.btnExcel.addEventListener('click', () => App.reports.generateMonitoramentoCSV());
                App.elements.notificationContainer.addEventListener('click', (e) => {
                    const notification = e.target.closest('.trap-notification');
                    if (notification && notification.dataset.trapId) {
                        App.mapModule.centerOnTrap(notification.dataset.trapId);
                    }
                });

                this.enableEnterKeyNavigation('#loginBox');
                this.enableEnterKeyNavigation('#lancamentoBroca');
                this.enableEnterKeyNavigation('#lancamentoPerda');
                this.enableEnterKeyNavigation('#changePasswordModal');
                this.enableEnterKeyNavigation('#cadastros');
                this.enableEnterKeyNavigation('#cadastrarPessoas');
                this.enableEnterKeyNavigation('#adminPasswordConfirmModal');

                ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
                    document.addEventListener(event, () => App.actions.resetInactivityTimer());
                });

                App.elements.installAppBtn.addEventListener('click', async () => {
                    if (App.state.deferredInstallPrompt) {
                        App.state.deferredInstallPrompt.prompt();
                        const { outcome } = await App.state.deferredInstallPrompt.userChoice;
                        console.log(`User response to the install prompt: ${outcome}`);
                        App.state.deferredInstallPrompt = null;
                        App.elements.installAppBtn.style.display = 'none';
                    }
                });
            }
        },
        
        actions: {
            filterDashboardData(dataType, startDate, endDate) {
                if (!startDate || !endDate) {
                    return App.state[dataType];
                }
                return App.state[dataType].filter(item => {
                    return item.data >= startDate && item.data <= endDate;
                });
            },
            saveDashboardDates(type, start, end) {
                localStorage.setItem(`dashboard-${type}-start`, start);
                localStorage.setItem(`dashboard-${type}-end`, end);
            },
            getDashboardDates(type) {
                return {
                    start: localStorage.getItem(`dashboard-${type}-start`),
                    end: localStorage.getItem(`dashboard-${type}-end`)
                };
            },
            formatDateForInput(dateString) {
                if (!dateString || typeof dateString !== 'string') return '';
                if (dateString.includes('/')) {
                    const parts = dateString.split('/');
                    if (parts.length === 3) {
                        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                }
                const date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    return '';
                }
                const offset = date.getTimezoneOffset();
                const adjustedDate = new Date(date.getTime() - (offset*60*1000));
                return adjustedDate.toISOString().split('T')[0];
            },
            formatDateForDisplay(dateString) {
                if (!dateString) return 'N/A';
                const date = new Date(dateString + 'T03:00:00Z');
                if (isNaN(date.getTime())) {
                    return 'Data Inválida';
                }
                return date.toLocaleDateString('pt-BR');
            },
            resetInactivityTimer() {
                clearTimeout(App.state.inactivityTimer);
                clearTimeout(App.state.inactivityWarningTimer);
        
                if (App.state.currentUser) {
                    App.state.inactivityWarningTimer = setTimeout(() => {
                        const { confirmationModal } = App.elements;
                        
                        confirmationModal.title.textContent = "Sessão prestes a expirar";
                        confirmationModal.message.textContent = "A sua sessão será encerrada em 1 minuto por inatividade. Deseja continuar conectado?";
                        confirmationModal.confirmBtn.textContent = "Continuar";
                        confirmationModal.cancelBtn.style.display = 'none';
        
                        const confirmHandler = () => {
                            this.resetInactivityTimer();
                            closeHandler();
                        };
        
                        const closeHandler = () => {
                            confirmationModal.overlay.classList.remove('show');
                            confirmationModal.confirmBtn.removeEventListener('click', confirmHandler);
                            confirmationModal.closeBtn.removeEventListener('click', closeHandler);
                            setTimeout(() => {
                                confirmationModal.confirmBtn.textContent = "Confirmar";
                                confirmationModal.cancelBtn.style.display = 'inline-flex';
                            }, 300);
                        };
        
                        confirmationModal.confirmBtn.addEventListener('click', confirmHandler);
                        confirmationModal.closeBtn.addEventListener('click', closeHandler);
                        confirmationModal.overlay.classList.add('show');
        
                    }, App.config.inactivityTimeout - App.config.inactivityWarningTime);
        
                    App.state.inactivityTimer = setTimeout(() => {
                        App.ui.showAlert('Sessão expirada por inatividade.', 'warning');
                        App.auth.logout();
                    }, App.config.inactivityTimeout);
                }
            },
            saveUserProfileLocally(userProfile) {
                let profiles = this.getLocalUserProfiles();
                const index = profiles.findIndex(p => p.uid === userProfile.uid);
                if (index > -1) {
                    profiles[index] = userProfile;
                } else {
                    profiles.push(userProfile);
                }
                localStorage.setItem('localUserProfiles', JSON.stringify(profiles));
            },
            getLocalUserProfiles() {
                return JSON.parse(localStorage.getItem('localUserProfiles') || '[]');
            },
            removeUserProfileLocally(userId) {
                let profiles = this.getLocalUserProfiles();
                profiles = profiles.filter(p => p.uid !== userId);
                localStorage.setItem('localUserProfiles', JSON.stringify(profiles));
            },
            async changePassword() {
                const els = App.elements.changePasswordModal;
                const currentPassword = els.currentPassword.value;
                const newPassword = els.newPassword.value;
                const confirmNewPassword = els.confirmNewPassword.value;
                
                if (!currentPassword || !newPassword || !confirmNewPassword) { App.ui.showAlert("Preencha todos os campos.", "error"); return; }
                if (newPassword !== confirmNewPassword) { App.ui.showAlert("As novas senhas não coincidem.", "error"); return; }
                if (newPassword.length < 6) { App.ui.showAlert("A nova senha deve ter pelo menos 6 caracteres.", "error"); return; }
                
                App.ui.setLoading(true, "A alterar senha...");
                try {
                    const user = auth.currentUser;
                    const credential = EmailAuthProvider.credential(user.email, currentPassword);
                    
                    await reauthenticateWithCredential(user, credential);
                    await updatePassword(user, newPassword);
                    
                    App.ui.showAlert("Senha alterada com sucesso!", "success");
                    els.overlay.classList.remove('show');
                    els.currentPassword.value = '';
                    els.newPassword.value = '';
                    els.confirmNewPassword.value = '';
                } catch (error) {
                    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        App.ui.showAlert("A senha atual está incorreta.", "error");
                    } else {
                        App.ui.showAlert("Erro ao alterar senha. Tente fazer login novamente.", "error");
                    }
                    console.error("Erro ao alterar senha:", error);
                } finally {
                    App.ui.setLoading(false);
                }
            },
            getAssignedTalhaoIds(editingGroupId = null) {
                const assignedIds = new Set();
                const allPlans = App.state.harvestPlans;
        
                allPlans.forEach(plan => {
                    if (App.state.activeHarvestPlan && plan.id === App.state.activeHarvestPlan.id) {
                        plan.sequence.forEach(group => {
                            if (editingGroupId && group.id == editingGroupId) {
                                return;
                            }
                            group.plots.forEach(plot => assignedIds.add(plot.talhaoId));
                        });
                    } else {
                        plan.sequence.forEach(group => {
                            group.plots.forEach(plot => assignedIds.add(plot.talhaoId));
                        });
                    }
                });
        
                return assignedIds;
            },
            async saveFarm() {
                const { farmCode, farmName, farmTypeCheckboxes } = App.elements.cadastros;
                const code = farmCode.value.trim();
                const name = farmName.value.trim().toUpperCase();
                const types = Array.from(farmTypeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

                if (!code || !name) { App.ui.showAlert("Código e Nome da fazenda são obrigatórios.", "error"); return; }
                
                const existingFarm = App.state.fazendas.find(f => f.code === code);
                if (existingFarm) {
                    App.ui.showAlert("Já existe uma fazenda com este código.", "error");
                    return;
                }

                App.ui.showConfirmationModal(`Tem a certeza que deseja guardar a fazenda ${name}?`, async () => {
                    try {
                        await App.data.addDocument('fazendas', { code, name, types, talhoes: [] });
                        App.ui.showAlert("Fazenda adicionada com sucesso!");
                        farmCode.value = ''; 
                        farmName.value = '';
                        farmTypeCheckboxes.forEach(cb => cb.checked = false);
                    } catch (error) {
                        App.ui.showAlert("Erro ao guardar fazenda.", "error");
                    }
                });
            },
            async saveFarmChanges() {
                const modal = App.elements.editFarmModal;
                const farmId = modal.editingFarmId.value;
                const newName = modal.nameInput.value.trim().toUpperCase();
                const newTypes = Array.from(modal.typeCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

                if (!newName) {
                    App.ui.showAlert("O nome da fazenda não pode ficar em branco.", "error");
                    return;
                }

                try {
                    await App.data.updateDocument('fazendas', farmId, { name: newName, types: newTypes });
                    App.ui.showAlert("Dados da fazenda atualizados com sucesso!");
                    App.ui.closeEditFarmModal();
                } catch (error) {
                    App.ui.showAlert("Erro ao atualizar os dados da fazenda.", "error");
                    console.error(error);
                }
            },
            deleteFarm(farmId) {
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) return;
                
                App.ui.showConfirmationModal(`Tem a certeza que deseja excluir a fazenda "${farm.name}" e todos os seus talhões? Esta ação é irreversível.`, async () => {
                    try {
                        await App.data.deleteDocument('fazendas', farmId);
                        App.ui.showAlert('Fazenda excluída com sucesso.', 'info');
                        App.elements.cadastros.farmSelect.value = '';
                        App.elements.cadastros.talhaoManagementContainer.style.display = 'none';
                    } catch (error) {
                        App.ui.showAlert('Erro ao excluir a fazenda.', 'error');
                        console.error(error);
                    }
                });
            },
            deleteAllFarms() {
                App.ui.showConfirmationModal("ATENÇÃO! Você está prestes a excluir TODAS as fazendas e talhões cadastrados. Esta ação é IRREVERSÍVEL. Digite 'EXCLUIR TUDO' para confirmar.", async (confirmationInput) => {
                    if (confirmationInput !== 'EXCLUIR TUDO') {
                        App.ui.showAlert("A confirmação não corresponde. Ação cancelada.", "warning");
                        return;
                    }
                    
                    App.ui.setLoading(true, "Excluindo todas as fazendas...");
                    try {
                        const batch = writeBatch(db);
                        App.state.fazendas.forEach(farm => {
                            const docRef = doc(db, 'fazendas', farm.id);
                            batch.delete(docRef);
                        });
                        await batch.commit();
                        App.ui.showAlert('Todas as fazendas foram excluídas com sucesso.', 'success');
                    } catch (error) {
                        App.ui.showAlert('Erro ao excluir todas as fazendas.', 'error');
                        console.error(error);
                    } finally {
                        App.ui.setLoading(false);
                    }
                }, true);
            },
            calculateTalhaoProducao() {
                const { talhaoArea, talhaoTCH, talhaoProducao } = App.elements.cadastros;
                const area = parseFloat(talhaoArea.value) || 0;
                const tch = parseFloat(talhaoTCH.value) || 0;
                talhaoProducao.value = (area * tch).toFixed(2);
            },
            async saveTalhao() {
                const { farmSelect, talhaoId, talhaoName, talhaoArea, talhaoTCH, talhaoProducao, talhaoCorte, talhaoVariedade, talhaoDistancia, talhaoUltimaColheita } = App.elements.cadastros;
                const farmId = farmSelect.value;
                if (!farmId) { App.ui.showAlert("Selecione uma fazenda.", "error"); return; }
                
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) { App.ui.showAlert("Fazenda selecionada não encontrada.", "error"); return; }
                
                const talhaoData = {
                    id: talhaoId.value ? parseInt(talhaoId.value) : Date.now(),
                    name: talhaoName.value.trim().toUpperCase(),
                    area: parseFloat(talhaoArea.value) || 0,
                    tch: parseFloat(talhaoTCH.value) || 0,
                    producao: parseFloat(talhaoProducao.value) || 0,
                    corte: parseInt(talhaoCorte.value) || 1,
                    variedade: talhaoVariedade.value.trim(),
                    distancia: parseFloat(talhaoDistancia.value) || 0,
                    dataUltimaColheita: this.formatDateForInput(talhaoUltimaColheita.value)
                };
                if (!talhaoData.name || isNaN(talhaoData.area) || isNaN(talhaoData.tch)) { App.ui.showAlert("Nome, Área e TCH do talhão são obrigatórios.", "error"); return; }
                
                App.ui.showConfirmationModal(`Tem a certeza que deseja guardar o talhão ${talhaoData.name}?`, async () => {
                    let updatedTalhoes = farm.talhoes ? [...farm.talhoes] : [];
                    const existingIndex = updatedTalhoes.findIndex(t => t.id === talhaoData.id);

                    if (existingIndex > -1) {
                        updatedTalhoes[existingIndex] = talhaoData;
                    } else {
                        updatedTalhoes.push(talhaoData);
                    }
                    
                    try {
                        await App.data.updateDocument('fazendas', farm.id, { talhoes: updatedTalhoes });
                        App.ui.showAlert("Talhão guardado com sucesso!");
                        [talhaoId, talhaoName, talhaoArea, talhaoTCH, talhaoProducao, talhaoCorte, talhaoVariedade, talhaoDistancia, talhaoUltimaColheita].forEach(el => el.value = '');
                        App.elements.cadastros.talhaoName.focus();
                    } catch(error) {
                        App.ui.showAlert("Erro ao guardar talhão.", "error");
                        console.error("Erro ao guardar talhão:", error);
                    }
                });
            },
            editTalhao(talhaoId) {
                const { farmSelect, ...talhaoEls } = App.elements.cadastros;
                const farm = App.state.fazendas.find(f => f.id === farmSelect.value);
                const talhao = farm?.talhoes.find(t => t.id == talhaoId);
                if (talhao) {
                    talhaoEls.talhaoId.value = talhao.id;
                    talhaoEls.talhaoName.value = talhao.name;
                    talhaoEls.talhaoArea.value = talhao.area;
                    talhaoEls.talhaoTCH.value = talhao.tch;
                    talhaoEls.talhaoProducao.value = talhao.producao;
                    talhaoEls.talhaoCorte.value = talhao.corte;
                    talhaoEls.talhaoVariedade.value = talhao.variedade;
                    talhaoEls.talhaoDistancia.value = talhao.distancia;
                    talhaoEls.talhaoUltimaColheita.value = this.formatDateForInput(talhao.dataUltimaColheita);
                    talhaoEls.talhaoName.focus();
                }
            },
            async deleteTalhao(talhaoId) {
                const farm = App.state.fazendas.find(f => f.id === App.elements.cadastros.farmSelect.value);
                if (farm && farm.talhoes) {
                    App.ui.showConfirmationModal("Tem a certeza que deseja excluir este talhão?", async () => {
                        const updatedTalhoes = farm.talhoes.filter(t => t.id != talhaoId);
                        try {
                            await App.data.updateDocument('fazendas', farm.id, { talhoes: updatedTalhoes });
                            App.ui.showAlert('Talhão excluído com sucesso.', 'info');
                        } catch(e) {
                            App.ui.showAlert('Erro ao excluir talhão.', 'error');
                        }
                    });
                }
            },
            async savePersonnel() {
                const { id, matricula, name } = App.elements.personnel;
                const matriculaValue = matricula.value.trim();
                const nameValue = name.value.trim();
                if (!matriculaValue || !nameValue) { App.ui.showAlert("Matrícula e Nome são obrigatórios.", "error"); return; }
                
                const existingId = id.value;
                const data = { matricula: matriculaValue, name: nameValue };
                
                App.ui.showConfirmationModal(`Tem a certeza que deseja guardar os dados de ${nameValue}?`, async () => {
                    try {
                        if (existingId) {
                            await App.data.updateDocument('personnel', existingId, data);
                        } else {
                            await App.data.addDocument('personnel', data);
                        }
                        App.ui.showAlert("Pessoa guardada com sucesso!");
                        id.value = ''; matricula.value = ''; name.value = '';
                    } catch (e) {
                        App.ui.showAlert("Erro ao guardar pessoa.", "error");
                    }
                });
            },
            editPersonnel(personnelId) {
                const { id, matricula, name } = App.elements.personnel;
                const person = App.state.personnel.find(p => p.id == personnelId);
                if (person) {
                    id.value = person.id;
                    matricula.value = person.matricula;
                    name.value = person.name;
                    matricula.focus();
                }
            },
            deletePersonnel(personnelId) {
                App.ui.showConfirmationModal("Tem certeza que deseja excluir esta pessoa?", async () => {
                    await App.data.deleteDocument('personnel', personnelId);
                    App.ui.showAlert('Pessoa excluída com sucesso.', 'info');
                });
            },
            async handleLogoUpload(e) {
                const file = e.target.files[0];
                const input = e.target;
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    App.ui.showAlert('Por favor, selecione um ficheiro de imagem (PNG, JPG, etc.).', 'error');
                    input.value = '';
                    return;
                }

                const MAX_SIZE_MB = 1;
                if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                    App.ui.showAlert(`O ficheiro é muito grande. O tamanho máximo é de ${MAX_SIZE_MB}MB para armazenamento direto.`, 'error');
                    input.value = '';
                    return;
                }

                App.ui.setLoading(true, "A carregar logo...");

                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64String = event.target.result;
                    try {
                        await App.data.setDocument('config', 'company', { logoBase64: base64String });
                        App.ui.showAlert('Logo carregado com sucesso!');
                    } catch (error) {
                        console.error("Erro ao carregar o logo para o Firestore:", error);
                        App.ui.showAlert(`Erro ao carregar o logo: ${error.message}`, 'error');
                    } finally {
                        App.ui.setLoading(false);
                        input.value = '';
                    }
                };
                reader.onerror = (error) => {
                    App.ui.setLoading(false);
                    App.ui.showAlert('Erro ao ler o ficheiro.', 'error');
                    console.error("Erro FileReader:", error);
                };
                reader.readAsDataURL(file);
            },
            removeLogo() {
                App.ui.showConfirmationModal("Tem a certeza que deseja remover o logotipo?", async () => {
                    App.ui.setLoading(true, "A remover logo...");
                    try {
                        await App.data.setDocument('config', 'company', { logoBase64: null });
                        App.ui.showAlert('Logo removido com sucesso!');
                    } catch (error) {
                        console.error("Erro ao remover logo do Firestore:", error);
                        App.ui.showAlert(`Erro ao remover o logo: ${error.message}`, 'error');
                    } finally {
                        App.ui.setLoading(false);
                        App.elements.companyConfig.logoInput.value = '';
                    }
                });
            },
            async agendarInspecao() {
                const els = App.elements.planejamento;
                const farmId = els.fazenda.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) { App.ui.showAlert("Fazenda inválida.", "error"); return; }

                const campos = { tipo: els.tipo.value, fazendaCodigo: farm.code, talhao: els.talhao.value.trim(), dataPrevista: els.data.value, usuarioResponsavel: els.responsavel.value };
                if (Object.values(campos).some(v => !v)) { App.ui.showAlert("Todos os campos obrigatórios devem ser preenchidos.", "error"); return; }
                
                App.ui.showConfirmationModal("Tem a certeza que deseja agendar esta inspeção?", async () => {
                    const novoPlano = { ...campos, meta: els.meta.value || null, observacoes: els.obs.value.trim() || null, status: 'Pendente' };
                    await App.data.addDocument('planos', novoPlano);
                    App.ui.showAlert("Inspeção agendada com sucesso!");
                    els.talhao.value = ''; els.data.value = ''; els.meta.value = ''; els.obs.value = '';
                });
            },
            async marcarPlanoComoConcluido(id) {
                App.ui.showConfirmationModal("Marcar esta inspeção como concluída?", async () => {
                    await App.data.updateDocument('planos', id, { status: 'Concluído' });
                    App.ui.showAlert("Inspeção marcada como concluída!", "success");
                });
            },
            excluirPlano(id) {
                App.ui.showConfirmationModal("Tem a certeza que deseja excluir este planejamento?", async () => {
                    await App.data.deleteDocument('planos', id);
                    App.ui.showAlert("Planejamento excluído.", "info");
                });
            },
            async verificarEAtualizarPlano(tipo, fazendaCodigo, talhao) {
                const planoPendente = App.state.planos.find(p => p.status === 'Pendente' && p.tipo === tipo && p.fazendaCodigo === fazendaCodigo && p.talhao.toLowerCase() === talhao.toLowerCase());
                if (planoPendente) {
                    await this.marcarPlanoComoConcluido(planoPendente.id);
                    App.ui.showAlert(`Planejamento correspondente para ${talhao} foi concluído automaticamente.`, 'info');
                }
            },
            findVarietyForTalhao(section) {
                const formElements = App.elements[section];
                const farmId = formElements.codigo.value;
                const talhaoName = formElements.talhao.value.trim().toUpperCase();
                const display = formElements.varietyDisplay;
                
                display.textContent = '';
                if (!farmId || !talhaoName) return;

                const farm = App.state.fazendas.find(f => f.id === farmId);
                const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === talhaoName);

                if (talhao && talhao.variedade) {
                    display.textContent = `Variedade: ${talhao.variedade}`;
                }
            },
            findOperatorName() {
                const { matricula, operadorNome } = App.elements.perda;
                const matriculaValue = matricula.value.trim();
                operadorNome.textContent = '';
                if (!matriculaValue) return;

                const operator = App.state.personnel.find(p => p.matricula === matriculaValue);
                if (operator) {
                    operadorNome.textContent = operator.name;
                    operadorNome.style.color = 'var(--color-primary)';
                } else {
                    operadorNome.textContent = 'Operador não encontrado';
                    operadorNome.style.color = 'var(--color-danger)';
                }
            },
            editHarvestPlan(planId = null) {
                App.ui.showHarvestPlanEditor();
                const { frontName, startDate, dailyRate } = App.elements.harvest;
                
                if (planId) {
                    const planToEdit = App.state.harvestPlans.find(p => p.id == planId);
                    App.state.activeHarvestPlan = JSON.parse(JSON.stringify(planToEdit));
                } else {
                    App.state.activeHarvestPlan = {
                        frontName: '',
                        startDate: new Date().toISOString().split('T')[0],
                        dailyRate: 750,
                        sequence: [],
                        closedTalhaoIds: [] 
                    };
                }
                
                frontName.value = App.state.activeHarvestPlan.frontName;
                startDate.value = App.state.activeHarvestPlan.startDate;
                dailyRate.value = App.state.activeHarvestPlan.dailyRate;

                App.ui.renderHarvestSequence();
                this.cancelEditSequence();
            },
            updateActiveHarvestPlanDetails() {
                if (!App.state.activeHarvestPlan) return;
                const { frontName, startDate, dailyRate } = App.elements.harvest;
                App.state.activeHarvestPlan.frontName = frontName.value;
                App.state.activeHarvestPlan.startDate = startDate.value;
                App.state.activeHarvestPlan.dailyRate = parseFloat(dailyRate.value);
                App.ui.renderHarvestSequence();
            },
            async saveHarvestPlan() {
                if (!App.state.activeHarvestPlan) return;
                
                App.ui.showConfirmationModal("Tem a certeza que deseja guardar este plano de colheita?", async () => {
                    const planToSave = App.state.activeHarvestPlan;
                    planToSave.frontName = planToSave.frontName.trim();
                    
                    if (!planToSave.frontName || !planToSave.startDate || !planToSave.dailyRate) {
                        App.ui.showAlert('Preencha todos os campos de configuração da frente.', "error");
                        return;
                    }
                    
                    try {
                        if (planToSave.id) {
                            await App.data.setDocument('harvestPlans', planToSave.id, planToSave);
                        } else {
                            await App.data.addDocument('harvestPlans', planToSave);
                        }
                        App.ui.showAlert(`Plano de colheita "${planToSave.frontName}" guardado com sucesso!`);
                        App.ui.showHarvestPlanList();
                    } catch(e) {
                        App.ui.showAlert('Erro ao guardar o plano de colheita.', "error");
                    }
                });
            },
            deleteHarvestPlan(planId) {
                App.ui.showConfirmationModal("Tem a certeza que deseja excluir este plano de colheita?", async () => {
                    await App.data.deleteDocument('harvestPlans', planId);
                    App.ui.showAlert('Plano de colheita excluído.', 'info');
                });
            },
            addOrUpdateHarvestSequence() {
                if (!App.state.activeHarvestPlan) { App.ui.showAlert("Primeiro crie ou edite um plano.", "warning"); return; }
                const { fazenda: fazendaSelect, atr: atrInput, editingGroupId, maturador, maturadorDate } = App.elements.harvest;
                const farmId = fazendaSelect.value;
                const atr = parseFloat(atrInput.value);
                const maturadorValue = maturador.value.trim();
                const maturadorDateValue = maturadorDate.value;
                const isEditing = editingGroupId.value !== '';

                if (!farmId) { App.ui.showAlert("Selecione uma fazenda.", "warning"); return; }
                if (isNaN(atr) || atr <= 0) { App.ui.showAlert("Insira um valor de ATR válido.", "warning"); return; }

                const selectedCheckboxes = document.querySelectorAll('#harvestTalhaoSelectionList input[type="checkbox"]:checked');
                if (selectedCheckboxes.length === 0) { App.ui.showAlert("Selecione pelo menos um talhão.", "warning"); return; }

                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) return;

                const selectedPlots = [];
                let totalArea = 0;
                let totalProducao = 0;

                selectedCheckboxes.forEach(cb => {
                    const talhaoId = parseInt(cb.dataset.talhaoId);
                    const talhao = farm.talhoes.find(t => t.id === talhaoId);
                    if (talhao) {
                        selectedPlots.push({ talhaoId: talhao.id, talhaoName: talhao.name });
                        totalArea += talhao.area;
                        totalProducao += talhao.producao;
                    }
                });

                if (isEditing) {
                    const group = App.state.activeHarvestPlan.sequence.find(g => g.id == editingGroupId.value);
                    if (group) {
                        group.plots = selectedPlots;
                        group.totalArea = totalArea;
                        group.totalProducao = totalProducao;
                        group.atr = atr;
                        group.maturador = maturadorValue;
                        group.maturadorDate = maturadorDateValue;
                    }
                } else {
                    App.state.activeHarvestPlan.sequence.push({
                        id: Date.now(), fazendaCodigo: farm.code, fazendaName: farm.name,
                        plots: selectedPlots, totalArea, totalProducao, atr,
                        maturador: maturadorValue,
                        maturadorDate: maturadorDateValue
                    });
                }
                
                if (App.state.activeHarvestPlan.id) {
                    const planInList = App.state.harvestPlans.find(p => p.id === App.state.activeHarvestPlan.id);
                    if (planInList) {
                        planInList.sequence = App.state.activeHarvestPlan.sequence;
                    }
                }
                
                App.ui.renderHarvestSequence();
                this.cancelEditSequence();
            },
            editHarvestSequenceGroup(groupId) {
                if (!App.state.activeHarvestPlan) return;
                const { fazenda, atr, editingGroupId, btnAddOrUpdate, btnCancelEdit, addOrEditTitle, maturador, maturadorDate } = App.elements.harvest;
                const group = App.state.activeHarvestPlan.sequence.find(g => g.id == groupId);
                if (!group) return;

                editingGroupId.value = group.id;
                const farm = App.state.fazendas.find(f => f.code === group.fazendaCodigo);
                fazenda.value = farm ? farm.id : "";
                fazenda.disabled = true;
                atr.value = group.atr;
                maturador.value = group.maturador || '';
                maturadorDate.value = group.maturadorDate || '';
                
                const plotIds = group.plots.map(p => p.talhaoId);
                App.ui.renderHarvestTalhaoSelection(farm.id, plotIds);

                addOrEditTitle.innerHTML = `<i class="fas fa-edit"></i> Editar Sequência da Fazenda`;
                btnAddOrUpdate.innerHTML = `<i class="fas fa-save"></i> Atualizar Sequência`;
                btnCancelEdit.style.display = 'inline-flex';
                
                fazenda.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },
            cancelEditSequence() {
                const { fazenda, atr, editingGroupId, btnAddOrUpdate, btnCancelEdit, addOrEditTitle, talhaoSelectionList, maturador, maturadorDate } = App.elements.harvest;
                editingGroupId.value = '';
                fazenda.value = '';
                fazenda.disabled = false;
                atr.value = '';
                maturador.value = '';
                maturadorDate.value = '';
                talhaoSelectionList.innerHTML = '';
                addOrEditTitle.innerHTML = `<i class="fas fa-plus-circle"></i> Adicionar Fazenda à Sequência`;
                btnAddOrUpdate.innerHTML = `<i class="fas fa-plus"></i> Adicionar à Sequência`;
                btnCancelEdit.style.display = 'none';
            },
            removeHarvestSequence(groupId) {
                if (!App.state.activeHarvestPlan) return;
                
                App.ui.showConfirmationModal("Tem a certeza que deseja remover este grupo da sequência?", () => {
                    App.state.activeHarvestPlan.sequence = App.state.activeHarvestPlan.sequence.filter(g => g.id != groupId);
                    
                    if (App.state.activeHarvestPlan.id) {
                        const planInList = App.state.harvestPlans.find(p => p.id === App.state.activeHarvestPlan.id);
                        if (planInList) {
                            planInList.sequence = App.state.activeHarvestPlan.sequence;
                        }
                    }

                    App.ui.renderHarvestSequence();
                    App.actions.cancelEditSequence();
                    App.ui.showAlert('Grupo removido da sequência.', 'info');
                });
            },
            editHarvestSequenceATR(groupId) {
                if (!App.state.activeHarvestPlan) return;
                const group = App.state.activeHarvestPlan.sequence.find(g => g.id == groupId);
                if (!group) return;

                const newATR = prompt(`Editar ATR para a fazenda ${group.fazendaName}:`, group.atr);
                if (newATR !== null && !isNaN(parseFloat(newATR))) {
                    group.atr = parseFloat(newATR);
                    App.ui.renderHarvestSequence();
                }
            },
            reorderHarvestSequence(draggedId, targetId) {
                if (!App.state.activeHarvestPlan) return;
                const sequence = App.state.activeHarvestPlan.sequence;
                const fromIndex = sequence.findIndex(item => item.id == draggedId);
                const toIndex = sequence.findIndex(item => item.id == targetId);
                if (fromIndex === -1 || toIndex === -1) return;
                const item = sequence.splice(fromIndex, 1)[0];
                sequence.splice(toIndex, 0, item);
                App.ui.renderHarvestSequence();
            },
            calculateAverageAge(group, groupStartDate) {
                let totalAgeInDays = 0;
                let plotsWithDate = 0;
                group.plots.forEach(plot => {
                    const farm = App.state.fazendas.find(f => f.code === group.fazendaCodigo);
                    const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                        if (talhao && talhao.dataUltimaColheita && groupStartDate) {
                        const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
                        if (!isNaN(groupStartDate) && !isNaN(dataUltima)) {
                            totalAgeInDays += Math.abs(groupStartDate - dataUltima);
                            plotsWithDate++;
                        }
                    }
                });
        
                if (plotsWithDate > 0) {
                    const avgDiffTime = totalAgeInDays / plotsWithDate;
                    const avgDiffDays = Math.ceil(avgDiffTime / (1000 * 60 * 60 * 24));
                    return (avgDiffDays / 30).toFixed(1);
                }
                return 'N/A';
            },
            calculateMaturadorDays(group) {
                if (!group.maturadorDate) {
                    return 'N/A';
                }
                try {
                    const today = new Date();
                    const applicationDate = new Date(group.maturadorDate + 'T03:00:00Z');
                    const diffTime = today - applicationDate;
                    if (diffTime < 0) return 0;
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays;
                } catch (e) {
                    return 'N/A';
                }
            },
            saveBrocamento() {
                if (!App.ui.validateFields(['codigo', 'data', 'talhao', 'entrenos', 'brocaBase', 'brocaMeio', 'brocaTopo'])) { 
                    App.ui.showAlert("Preencha todos os campos obrigatórios!", "error"); 
                    return; 
                }
                
                const { broca } = App.elements;
                const farm = App.state.fazendas.find(f => f.id === broca.codigo.value);
                if (!farm) { App.ui.showAlert("Fazenda não encontrada.", "error"); return; }
                const talhao = farm.talhoes.find(t => t.name.toUpperCase() === broca.talhao.value.trim().toUpperCase());
                
                if (!talhao) {
                    App.ui.showAlert(`Talhão "${broca.talhao.value}" não encontrado na fazenda "${farm.name}". Verifique o cadastro.`, "error");
                    return;
                }

                const newEntry = {
                    codigo: farm.code, fazenda: farm.name, data: broca.data.value,
                    talhao: broca.talhao.value.trim(),
                    corte: talhao ? talhao.corte : null,
                    entrenos: parseInt(broca.entrenos.value),
                    base: parseInt(broca.base.value),
                    meio: parseInt(broca.meio.value),
                    topo: parseInt(broca.topo.value),
                    brocado: parseInt(broca.brocado.value),
                    brocamento: (((parseInt(broca.brocado.value) || 0) / (parseInt(broca.entrenos.value) || 1)) * 100).toFixed(2).replace('.', ','),
                    usuario: App.state.currentUser.username
                };

                App.ui.showConfirmationModal('Tem a certeza que deseja guardar esta inspeção de broca?', () => {
                    App.ui.clearForm(broca.form);
                    App.ui.setDefaultDatesForEntryForms();

                    App.data.addDocument('registros', newEntry)
                        .then(() => {
                            if (navigator.onLine) {
                                App.ui.showAlert('Inspeção guardada com sucesso!');
                            } else {
                                App.ui.showAlert('Inspeção guardada offline. Será enviada quando houver conexão.', 'info');
                            }
                            this.verificarEAtualizarPlano('broca', newEntry.codigo, newEntry.talhao);
                        })
                        .catch((e) => {
                            App.ui.showAlert('Erro ao guardar inspeção.', "error");
                            console.error("Erro ao salvar brocamento:", e);
                        });
                });
            },
            
            savePerda() {
                if (!App.ui.validateFields(['dataPerda', 'codigoPerda', 'frenteServico', 'talhaoPerda', 'frotaEquipamento', 'matriculaOperador'])) { 
                    App.ui.showAlert("Preencha todos os campos obrigatórios!", "error"); 
                    return; 
                }
                
                const { perda } = App.elements;
                const farm = App.state.fazendas.find(f => f.id === perda.codigo.value);
                const operator = App.state.personnel.find(p => p.matricula === perda.matricula.value.trim());
                if (!operator) {
                    App.ui.showAlert("Matrícula do operador não encontrada. Verifique o cadastro.", "error");
                    return;
                }
                const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === perda.talhao.value.trim().toUpperCase());

                if (!talhao) {
                    App.ui.showAlert(`Talhão "${perda.talhao.value}" não encontrado na fazenda "${farm.name}". Verifique o cadastro.`, "error");
                    return;
                }
                
                const fields = { canaInteira: parseFloat(perda.canaInteira.value) || 0, tolete: parseFloat(perda.tolete.value) || 0, toco: parseFloat(perda.toco.value) || 0, ponta: parseFloat(perda.ponta.value) || 0, estilhaco: parseFloat(perda.estilhaco.value) || 0, pedaco: parseFloat(perda.pedaco.value) || 0 };
                const total = Object.values(fields).reduce((s, v) => s + v, 0);
                const newEntry = {
                    ...fields,
                    data: perda.data.value,
                    codigo: farm ? farm.code : 'N/A',
                    fazenda: farm ? farm.name : 'Desconhecida',
                    frenteServico: perda.frente.value.trim(),
                    turno: perda.turno.value,
                    talhao: perda.talhao.value.trim(),
                    frota: perda.frota.value.trim(),
                    matricula: operator.matricula,
                    operador: operator.name,
                    total,
                    media: (total / 6).toFixed(2).replace('.', ','),
                    usuario: App.state.currentUser.username
                };
                
                App.ui.showConfirmationModal('Tem a certeza que deseja guardar este lançamento de perda?', () => {
                    App.ui.clearForm(perda.form);
                    App.ui.setDefaultDatesForEntryForms();

                    App.data.addDocument('perdas', newEntry)
                        .then(() => {
                            if (navigator.onLine) {
                                App.ui.showAlert('Lançamento de perda guardado com sucesso!');
                            } else {
                                App.ui.showAlert('Lançamento de perda guardado offline. Será enviada quando houver conexão.', 'info');
                            }
                            this.verificarEAtualizarPlano('perda', newEntry.codigo, newEntry.talhao);
                        })
                        .catch((e) => {
                            App.ui.showAlert('Erro ao guardar lançamento de perda.', "error");
                            console.error("Erro ao salvar perda:", e);
                        });
                });
            },
            
            deleteEntry(type, id) {
                App.ui.showConfirmationModal('Tem a certeza que deseja excluir este registo?', async () => {
                    if (type === 'brocamento') { await App.data.deleteDocument('registros', id); }
                    else if (type === 'perda') { await App.data.deleteDocument('perdas', id); }
                    App.ui.showAlert('Registo excluído com sucesso!');
                });
            },
            async importFarmsFromCSV(file) {
                 if (!file) return;
                 const reader = new FileReader();
                 reader.onload = async (event) => {
                     const CHUNK_SIZE = 400; 
                     const PAUSE_DURATION = 50;
                     
                     try {
                         const csv = event.target.result;
                         const lines = csv.split(/\r\n|\n/).filter(line => line.trim() !== '');
                         const totalLines = lines.length - 1;

                         if (totalLines <= 0) {
                             App.ui.showAlert('O ficheiro CSV está vazio ou contém apenas o cabeçalho.', "error"); return;
                         }
                         
                         App.ui.setLoading(true, `A iniciar importação de ${totalLines} linhas...`);
                         await new Promise(resolve => setTimeout(resolve, 100));

                         const fileHeaders = lines[0].split(';').map(h => h.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
                         const headerIndexes = {
                             farm_code: fileHeaders.indexOf('COD'), farm_name: fileHeaders.indexOf('FAZENDA'),
                             farm_type: fileHeaders.indexOf('TIPO'),
                             talhao_name: fileHeaders.indexOf('TALHAO'), talhao_area: fileHeaders.indexOf('AREA'),
                             talhao_tch: fileHeaders.indexOf('TCH'),
                             talhao_variedade: fileHeaders.indexOf('VARIEDADE'),
                             talhao_corte: fileHeaders.indexOf('CORTE'),
                             talhao_distancia: fileHeaders.indexOf('DISTANCIA'),
                             talhao_ultima_colheita: fileHeaders.indexOf('DATAULTIMACOLHEITA'),
                         };

                         if (headerIndexes.farm_code === -1 || headerIndexes.farm_name === -1 || headerIndexes.talhao_name === -1) {
                             App.ui.showAlert('Cabeçalhos essenciais (Cód;FAZENDA;TALHÃO) não encontrados no ficheiro CSV.', "error");
                             App.ui.setLoading(false);
                             return;
                         }
                         
                         const fazendasToUpdate = {};
                         for (let i = 1; i < lines.length; i++) {
                             const data = lines[i].split(';');
                             if (data.length < 2) continue;
                             const farmCode = data[headerIndexes.farm_code]?.trim();
                             if (!farmCode) continue;

                             if (!fazendasToUpdate[farmCode]) {
                                 let existingFarm = App.state.fazendas.find(f => f.code === farmCode);
                                 fazendasToUpdate[farmCode] = existingFarm ? JSON.parse(JSON.stringify(existingFarm)) : {
                                     code: farmCode,
                                     name: data[headerIndexes.farm_name]?.trim().toUpperCase() || `FAZENDA ${farmCode}`,
                                     types: data[headerIndexes.farm_type]?.trim().split(',').map(t => t.trim()) || [],
                                     talhoes: []
                                 };
                             }

                             const talhaoName = data[headerIndexes.talhao_name]?.trim().toUpperCase();
                             if(!talhaoName) continue;

                             let talhao = fazendasToUpdate[farmCode].talhoes.find(t => t.name.toUpperCase() === talhaoName);
                             const area = parseFloat(data[headerIndexes.talhao_area]?.trim().replace(',', '.')) || 0;
                             const tch = parseFloat(data[headerIndexes.talhao_tch]?.trim().replace(',', '.')) || 0;
                             const producao = area * tch;

                             if (talhao) { 
                                 talhao.area = area;
                                 talhao.tch = tch;
                                 talhao.producao = producao;
                                 talhao.variedade = data[headerIndexes.talhao_variedade]?.trim() || talhao.variedade;
                                 talhao.corte = parseInt(data[headerIndexes.talhao_corte]?.trim()) || talhao.corte;
                                 talhao.distancia = parseFloat(data[headerIndexes.talhao_distancia]?.trim().replace(',', '.')) || talhao.distancia;
                                 talhao.dataUltimaColheita = this.formatDateForInput(data[headerIndexes.talhao_ultima_colheita]?.trim()) || talhao.dataUltimaColheita;
                             } else { 
                                 fazendasToUpdate[farmCode].talhoes.push({
                                     id: Date.now() + i, name: talhaoName,
                                     area: area,
                                     tch: tch,
                                     producao: producao,
                                     variedade: data[headerIndexes.talhao_variedade]?.trim() || '',
                                     corte: parseInt(data[headerIndexes.talhao_corte]?.trim()) || 1,
                                     distancia: parseFloat(data[headerIndexes.talhao_distancia]?.trim().replace(',', '.')) || 0,
                                     dataUltimaColheita: this.formatDateForInput(data[headerIndexes.talhao_ultima_colheita]?.trim()) || '',
                                 });
                             }
                         }
                         
                         const farmCodes = Object.keys(fazendasToUpdate);
                         for (let i = 0; i < farmCodes.length; i += CHUNK_SIZE) {
                             const chunk = farmCodes.slice(i, i + CHUNK_SIZE);
                             const batch = writeBatch(db);
                             
                             chunk.forEach(code => {
                                 const farmData = fazendasToUpdate[code];
                                 const docRef = farmData.id ? doc(db, 'fazendas', farmData.id) : doc(collection(db, 'fazendas'));
                                 batch.set(docRef, farmData, { merge: true });
                             });

                             await batch.commit();
                             const progress = Math.min(i + CHUNK_SIZE, farmCodes.length);
                             App.ui.setLoading(true, `A processar... ${progress} de ${farmCodes.length} fazendas atualizadas.`);
                             await new Promise(resolve => setTimeout(resolve, PAUSE_DURATION));
                         }

                         App.ui.showAlert(`Importação concluída! ${farmCodes.length} fazendas foram processadas.`, 'success');

                     } catch (e) {
                         App.ui.showAlert('Erro ao processar o ficheiro CSV.', "error");
                         console.error(e);
                     } finally {
                         App.ui.setLoading(false);
                         App.elements.cadastros.csvFileInput.value = '';
                     }
                 };
                 reader.readAsText(file, 'ISO-8859-1');
            },
            downloadCsvTemplate() {
                const headers = "Cód;FAZENDA;TIPO;TALHÃO;Área;TCH;Variedade;Corte;Distancia;DataUltimaColheita";
                const exampleRow = "4012;FAZ LAGOA CERCADA;Própria,Parceira;T-01;50;80;RB867515;2;10;15/07/2024";
                const csvContent = "\uFEFF" + headers + "\n" + exampleRow;
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", "modelo_cadastro_fazendas.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },
            async importPersonnelFromCSV(file) {
                 if (!file) return;
                 const reader = new FileReader();
                 reader.onload = async (event) => {
                     const CHUNK_SIZE = 400;
                     const PAUSE_DURATION = 50;
                     try {
                         const csv = event.target.result;
                         const lines = csv.split(/\r\n|\n/).filter(line => line.trim() !== '');
                         const totalLines = lines.length - 1;
                         if (totalLines <= 0) { App.ui.showAlert('O ficheiro CSV está vazio ou contém apenas o cabeçalho.', "error"); return; }
                         
                         App.ui.setLoading(true, `A iniciar importação de ${totalLines} pessoas...`);
                         await new Promise(resolve => setTimeout(resolve, 100));

                         const fileHeaders = lines[0].split(';').map(h => h.trim().toUpperCase());
                         const headerIndexes = { matricula: fileHeaders.indexOf('MATRICULA'), name: fileHeaders.indexOf('NOME') };

                         if (headerIndexes.matricula === -1 || headerIndexes.name === -1) {
                             App.ui.showAlert('Cabeçalhos "Matricula" e "Nome" não encontrados.', "error");
                             App.ui.setLoading(false);
                             return;
                         }

                         const localPersonnel = JSON.parse(JSON.stringify(App.state.personnel));
                         
                         for (let i = 1; i < lines.length; i += CHUNK_SIZE) {
                             const chunk = lines.slice(i, i + CHUNK_SIZE);
                             const batch = writeBatch(db);
                             let updatedCountInChunk = 0;
                             let newCountInChunk = 0;

                             chunk.forEach(line => {
                                 const data = line.split(';');
                                 if (data.length < 2) return;
                                 const matricula = data[headerIndexes.matricula]?.trim();
                                 const name = data[headerIndexes.name]?.trim();
                                 if (!matricula || !name) return;

                                 let person = localPersonnel.find(p => p.matricula === matricula);
                                 if (person) {
                                     const personRef = doc(db, 'personnel', person.id);
                                     batch.update(personRef, { name: name });
                                     updatedCountInChunk++;
                                 } else {
                                     const newPersonRef = doc(collection(db, 'personnel'));
                                     batch.set(newPersonRef, { matricula, name });
                                     newCountInChunk++;
                                 }
                             });

                             await batch.commit();
                             const progress = Math.min(i + CHUNK_SIZE - 1, totalLines);
                             App.ui.setLoading(true, `A processar... ${progress} de ${totalLines} pessoas.`);
                             await new Promise(resolve => setTimeout(resolve, PAUSE_DURATION));
                         }
                         
                         App.ui.showAlert(`Importação concluída!`, 'success');
                     } catch (e) {
                         App.ui.showAlert('Erro ao processar o ficheiro CSV.', "error");
                         console.error(e);
                     } finally {
                         App.ui.setLoading(false);
                         App.elements.personnel.csvFileInput.value = '';
                     }
                 };
                 reader.readAsText(file, 'ISO-8859-1');
            },
            downloadPersonnelCsvTemplate() {
                const headers = "Matricula;Nome";
                const exampleRow = "12345;José Almeida";
                const csvContent = "\uFEFF" + headers + "\n" + exampleRow;
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", "modelo_cadastro_pessoas.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },
            downloadHarvestReportTemplate(type) {
                let headers, exampleRow, filename;
                if (type === 'progress') {
                    headers = "CodigoFazenda;Talhao;AreaColhida;ProducaoColhida";
                    exampleRow = "4012;T-01;10.5;850.7";
                    filename = "modelo_colheita_andamento.csv";
                } else { // closed
                    headers = "CodigoFazenda;Talhao";
                    exampleRow = "4012;T-02";
                    filename = "modelo_colheita_encerrados.csv";
                }
                const csvContent = "\uFEFF" + headers + "\n" + exampleRow;
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },
            async importHarvestReport(file, type) {
                if (!file) return;
        
                const reader = new FileReader();
                reader.onload = async (event) => {
                    App.ui.setLoading(true, `A processar relatório de talhões ${type === 'closed' ? 'encerrados' : 'em andamento'}...`);
                    try {
                        const csv = event.target.result;
                        const lines = csv.split(/\r\n|\n/).filter(line => line.trim() !== '');
                        if (lines.length <= 1) throw new Error("O ficheiro CSV está vazio ou contém apenas o cabeçalho.");
        
                        const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
                        const requiredHeaders = type === 'progress' ? ['codigofazenda', 'talhao', 'areacolhida', 'producaocolhida'] : ['codigofazenda', 'talhao'];
                        if (!requiredHeaders.every(h => headers.includes(h))) {
                            throw new Error(`Cabeçalhos em falta. O ficheiro deve conter: ${requiredHeaders.join('; ')}`);
                        }
        
                        const allPlans = JSON.parse(JSON.stringify(App.state.harvestPlans));
                        const fazendas = App.state.fazendas;
                        const changesSummary = {};
                        let notFoundTalhoes = [];
        
                        const closedTalhaoIdsFromCSV = new Set();
                        if (type === 'closed') {
                            for (let i = 1; i < lines.length; i++) {
                                const data = lines[i].split(';');
                                const row = headers.reduce((obj, header, index) => { obj[header] = data[index]?.trim(); return obj; }, {});
                                const farmCode = row.codigofazenda;
                                const talhaoName = row.talhao?.toUpperCase();
                                if (farmCode && talhaoName) {
                                    const farm = fazendas.find(f => f.code === farmCode);
                                    const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === talhaoName);
                                    if (talhao) {
                                        closedTalhaoIdsFromCSV.add(talhao.id);
                                    }
                                }
                            }
                        }
        
                        if (type === 'progress') {
                            for (let i = 1; i < lines.length; i++) {
                                const data = lines[i].split(';');
                                const row = headers.reduce((obj, header, index) => { obj[header] = data[index]?.trim(); return obj; }, {});
                                const farmCode = row.codigofazenda;
                                const talhaoName = row.talhao?.toUpperCase();
                                if (!farmCode || !talhaoName) continue;
        
                                const farm = fazendas.find(f => f.code === farmCode);
                                const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === talhaoName);
                                if (!talhao) {
                                    if (!notFoundTalhoes.includes(`${farmCode}-${talhaoName}`)) notFoundTalhoes.push(`${farmCode}-${talhaoName}`);
                                    continue;
                                }
        
                                let talhaoFoundInAnyPlan = false;
                                for (const plan of allPlans) {
                                    for (const group of plan.sequence) {
                                        if (group.fazendaCodigo === farmCode && group.plots.some(p => p.talhaoId === talhao.id)) {
                                            talhaoFoundInAnyPlan = true;
                                            if (!changesSummary[plan.frontName]) changesSummary[plan.frontName] = { updated: [], removed: [] };
        
                                            const areaColhida = parseFloat(row.areacolhida?.replace(',', '.')) || 0;
                                            const producaoColhida = parseFloat(row.producaocolhida?.replace(',', '.')) || 0;
                                            group.areaColhida = (group.areaColhida || 0) + areaColhida;
                                            group.producaoColhida = (group.producaoColhida || 0) + producaoColhida;
                                            changesSummary[plan.frontName].updated.push(`${farmCode}-${talhaoName}`);
                                        }
                                    }
                                }
                                if (!talhaoFoundInAnyPlan && !notFoundTalhoes.includes(`${farmCode}-${talhaoName}`)) {
                                    notFoundTalhoes.push(`${farmCode}-${talhaoName}`);
                                }
                            }
                        }
        
                        if (type === 'closed') {
                            for (const plan of allPlans) {
                                if (!plan.closedTalhaoIds) plan.closedTalhaoIds = [];
                                closedTalhaoIdsFromCSV.forEach(id => {
                                    if (!plan.closedTalhaoIds.includes(id)) plan.closedTalhaoIds.push(id);
                                });
        
                                const newSequence = [];
                                plan.sequence.forEach(group => {
                                    const originalPlotCount = group.plots.length;
                                    group.plots = group.plots.filter(plot => !closedTalhaoIdsFromCSV.has(plot.talhaoId));
                                    const removedPlotsCount = originalPlotCount - group.plots.length;
        
                                    if (removedPlotsCount > 0) {
                                        if (!changesSummary[plan.frontName]) changesSummary[plan.frontName] = { updated: [], removed: [] };
                                        changesSummary[plan.frontName].removed.push(`${removedPlotsCount} talhão(ões) do grupo ${group.fazendaCodigo}`);
                                    }
        
                                    if (group.plots.length > 0) {
                                        let newTotalArea = 0;
                                        let newTotalProducao = 0;
                                        const farm = fazendas.find(f => f.code === group.fazendaCodigo);
                                        if (farm) {
                                            group.plots.forEach(plot => {
                                                const talhao = farm.talhoes.find(t => t.id === plot.talhaoId);
                                                if (talhao) {
                                                    newTotalArea += talhao.area;
                                                    newTotalProducao += talhao.producao;
                                                }
                                            });
                                        }
                                        group.totalArea = newTotalArea;
                                        group.totalProducao = newTotalProducao;
                                        newSequence.push(group);
                                    }
                                });
                                plan.sequence = newSequence;
                            }
                        }
        
                        const batch = writeBatch(db);
                        allPlans.forEach(plan => {
                            const docRef = doc(db, 'harvestPlans', plan.id);
                            batch.set(docRef, plan);
                        });
                        await batch.commit();
        
                        let summaryMessage = "Sincronização Concluída!\n\n";
                        const updatedPlans = Object.keys(changesSummary);
        
                        if (updatedPlans.length > 0) {
                            updatedPlans.forEach(planName => {
                                summaryMessage += `Plano "${planName}" atualizado:\n`;
                                const changes = changesSummary[planName];
                                if (changes.updated.length > 0) {
                                    summaryMessage += `  - ${changes.updated.length} talhões com progresso atualizado.\n`;
                                }
                                if (changes.removed.length > 0) {
                                    summaryMessage += `  - ${changes.removed.join(', ')} foram removidos da sequência.\n`;
                                }
                            });
                        } else {
                            summaryMessage += "Nenhum plano foi alterado.\n";
                        }
        
                        if (notFoundTalhoes.length > 0) {
                            summaryMessage += `\nAviso: ${notFoundTalhoes.length} talhões do relatório não foram encontrados em nenhum plano ativo: ${notFoundTalhoes.join(', ')}`;
                        }
        
                        const { confirmationModal } = App.elements;
                        confirmationModal.title.textContent = "Resumo da Sincronização";
                        confirmationModal.message.textContent = summaryMessage;
                        confirmationModal.confirmBtn.textContent = "OK";
                        confirmationModal.cancelBtn.style.display = 'none';
                        confirmationModal.overlay.classList.add('show');
                        
                        const closeHandler = () => {
                            confirmationModal.overlay.classList.remove('show');
                            confirmationModal.confirmBtn.removeEventListener('click', closeHandler);
                            confirmationModal.closeBtn.removeEventListener('click', closeHandler);
                            setTimeout(() => {
                                confirmationModal.confirmBtn.textContent = "Confirmar";
                                confirmationModal.cancelBtn.style.display = 'inline-flex';
                            }, 300);
                        };
                        confirmationModal.confirmBtn.addEventListener('click', closeHandler);
                        confirmationModal.closeBtn.addEventListener('click', closeHandler);
        
                    } catch (e) {
                        App.ui.showAlert(`Erro ao importar: ${e.message}`, "error", 6000);
                        console.error(e);
                    } finally {
                        App.ui.setLoading(false);
                        const inputToClear = type === 'progress' ? App.elements.companyConfig.progressInput : App.elements.companyConfig.closedInput;
                        if (inputToClear) inputToClear.value = '';
                    }
                };
                reader.readAsText(file, 'ISO-8859-1');
            },
            markNotificationsAsRead() {
                App.state.unreadNotificationCount = 0;
                App.ui.updateNotificationBell();
            },
            // NOVO: Ação para limpar todas as notificações
            clearAllNotifications() {
                App.state.trapNotifications = [];
                App.state.unreadNotificationCount = 0;
                App.ui.updateNotificationBell();
            }
        },
        gemini: {
            getOptimizedHarvestSequence() {
                if (!App.state.activeHarvestPlan || App.state.activeHarvestPlan.sequence.length === 0) {
                    App.ui.showAlert("Adicione fazendas à sequência antes de otimizar.", "warning");
                    return;
                }
                
                App.ui.setLoading(true, "A otimizar com IA...");

                setTimeout(() => {
                    App.state.activeHarvestPlan.sequence.sort((a, b) => (b.atr || 0) - (a.atr || 0));
                    
                    App.ui.setLoading(false);
                    App.ui.renderHarvestSequence();
                    App.ui.showAlert("Sequência de colheita otimizada pela IA (priorizando maior ATR)!", "info");
                }, 2000);
            },
            getDashboardAnalysis() {
                App.ui.showAlert("A análise do dashboard com IA ainda não foi implementada.", "info");
            },
            getPlanningSuggestions() {
                App.ui.showAlert("A sugestão de planejamento com IA ainda não foi implementada.", "info");
            }
        },

        mapModule: {
            initMap() {
                if (App.state.googleMap) return;
                if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
                    console.error("API do Google Maps não está carregada.");
                    return;
                }

                try {
                    const mapContainer = App.elements.monitoramentoAereo.mapContainer;
                    App.state.googleMap = new google.maps.Map(mapContainer, {
                        center: { lat: -21.17, lng: -48.45 },
                        zoom: 13,
                        mapTypeId: 'satellite',
                        disableDefaultUI: true,
                        zoomControl: true,
                        gestureHandling: 'greedy'
                    });

                    this.watchUserPosition();
                    this.loadShapesOnMap();
                    this.loadTraps();

                } catch (e) {
                    console.error("Erro ao inicializar o Google Maps:", e);
                    App.ui.showAlert("Não foi possível carregar o mapa.", "error");
                }
            },

            watchUserPosition() {
                if ('geolocation' in navigator) {
                    navigator.geolocation.watchPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            this.updateUserPosition(latitude, longitude);
                        },
                        (error) => {
                            console.warn(`Erro de Geolocalização: ${error.message}`);
                            App.ui.showAlert("Não foi possível obter sua localização.", "warning");
                        },
                        { enableHighAccuracy: true }
                    );
                } else {
                    App.ui.showAlert("Geolocalização não é suportada pelo seu navegador.", "error");
                }
            },

            updateUserPosition(lat, lng) {
                const userPosition = { lat, lng };
                
                if (!App.state.googleUserMarker) {
                    App.state.googleUserMarker = new google.maps.Marker({
                        position: userPosition,
                        map: App.state.googleMap,
                        title: "Sua Posição",
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#4285F4",
                            fillOpacity: 1,
                            strokeColor: "#ffffff",
                            strokeWeight: 2,
                        },
                    });
                    App.state.googleMap.setCenter(userPosition);
                    App.state.googleMap.setZoom(16);
                } else {
                    App.state.googleUserMarker.setPosition(userPosition);
                }
            },

            centerMapOnUser() {
                if (App.state.googleUserMarker) {
                    const userPosition = App.state.googleUserMarker.getPosition();
                    App.state.googleMap.panTo(userPosition);
                    App.state.googleMap.setZoom(16);
                } else {
                    App.ui.showAlert("Ainda não foi possível obter sua localização.", "info");
                }
            },

            async handleShapefileUpload(e) {
                const file = e.target.files[0];
                if (!file) return;

                if (!file.name.toLowerCase().endsWith('.zip')) {
                    App.ui.showAlert("Por favor, selecione um arquivo .zip", "error");
                    e.target.value = '';
                    return;
                }

                App.ui.setLoading(true, "A processar arquivo...");

                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = async () => {
                    const base64String = reader.result.split(',')[1];

                    try {
                        App.ui.setLoading(true, "Enviando para o servidor...");
                        const response = await fetch(`${App.config.backendUrl}/upload-shapefile`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ fileBase64: base64String }),
                        });

                        const result = await response.json();

                        if (!response.ok) {
                            throw new Error(result.message || 'Erro no servidor');
                        }

                        App.ui.showAlert("Arquivo enviado com sucesso! O mapa será atualizado.", "success");
                    } catch (err) {
                        console.error("Erro ao enviar o shapefile:", err);
                        App.ui.showAlert(`Erro ao enviar o arquivo: ${err.message}`, "error");
                    } finally {
                        App.ui.setLoading(false);
                        e.target.value = '';
                    }
                };
                reader.onerror = () => {
                    App.ui.setLoading(false);
                    App.ui.showAlert("Erro ao ler o arquivo localmente.", "error");
                    e.target.value = '';
                };
            },

            async loadAndCacheShapes(url) {
                if (!url) return;
                App.ui.setLoading(true, "A carregar contornos do mapa...");
                try {
                    const urlWithCacheBuster = `${url}?t=${new Date().getTime()}`;
                    const response = await fetch(urlWithCacheBuster);
                    if (!response.ok) throw new Error(`Não foi possível baixar o shapefile: ${response.statusText}`);
                    const buffer = await response.arrayBuffer();
                    
                    await OfflineDB.set('shapefile-zip', buffer);
                    
                    App.ui.setLoading(true, "A desenhar os talhões no mapa...");
                    const geojson = await shp(buffer);
                    
                    App.state.geoJsonData = geojson;
                    if (App.state.googleMap) {
                        this.loadShapesOnMap();
                    }
                } catch(err) {
                    console.error("Erro ao carregar shapefile do Storage:", err);
                    App.ui.showAlert("Falha ao carregar os desenhos do mapa. Tentando usar o cache.", "warning");
                    this.loadOfflineShapes();
                } finally {
                    App.ui.setLoading(false);
                }
            },

            async loadOfflineShapes() {
                const buffer = await OfflineDB.get('shapefile-zip');
                if (buffer) {
                    App.ui.showAlert("A carregar mapa do cache offline.", "info");
                    try {
                        const geojson = await shp(buffer);
                        App.state.geoJsonData = geojson;
                        if (App.state.googleMap) {
                            this.loadShapesOnMap();
                        }
                    } catch (e) {
                        console.error("Erro ao processar shapefile do cache:", e);
                    }
                }
            },

            loadShapesOnMap() {
                if (!App.state.googleMap || !App.state.geoJsonData) return;

                App.state.mapPolygons.forEach(p => p.setMap(null));
                App.state.mapPolygons = [];

                const dataLayer = new google.maps.Data({ map: App.state.googleMap });
                dataLayer.addGeoJson(App.state.geoJsonData);
                App.state.mapPolygons.push(dataLayer);

                const themeColors = App.ui._getThemeColors();

                dataLayer.setStyle(feature => {
                    let fillOpacity = 0.35; // Padrão
                    if (feature.getProperty('isSelected')) {
                        fillOpacity = 0.85; // Selecionado
                    } else if (feature.getProperty('isHovered')) {
                        fillOpacity = 0.60; // Hover
                    }
                    return ({
                        fillColor: themeColors.primary,
                        fillOpacity: fillOpacity,
                        strokeColor: '#FFD700',
                        strokeWeight: 2,
                        strokeOpacity: 0.8,
                        cursor: 'pointer'
                    });
                });

                dataLayer.addListener('mouseover', (event) => {
                    event.feature.setProperty('isHovered', true);
                });

                dataLayer.addListener('mouseout', (event) => {
                    event.feature.setProperty('isHovered', false);
                });

                dataLayer.addListener('click', (event) => {
                    if (App.state.trapPlacementMode === 'manual_select') {
                        const selectedFeature = event.feature;
                        const position = App.state.googleUserMarker.getPosition();
                        if (!position) {
                            App.ui.showAlert("Localização do usuário não encontrada.", "error");
                            return;
                        }
                        this.installTrap(position.lat(), position.lng(), selectedFeature);
                        this.hideTrapPlacementModal();
                    } else {
                        if (App.state.selectedMapFeature) {
                            App.state.selectedMapFeature.setProperty('isSelected', false);
                        }
                        
                        if (App.state.selectedMapFeature === event.feature) {
                            App.state.selectedMapFeature = null;
                            this.hideTalhaoInfo();
                        } else {
                            App.state.selectedMapFeature = event.feature;
                            event.feature.setProperty('isSelected', true);
                            this.showTalhaoInfo(event.feature);
                        }
                    }
                });
            },

            // ALTERAÇÃO PONTO 5: Melhoria na busca de propriedades do Shapefile
            showTalhaoInfo(feature) {
                const props = {};
                feature.forEachProperty((value, property) => {
                    props[property.toUpperCase()] = value;
                });
                
                const findProp = (keys) => {
                    for (const key of keys) {
                        if (props[key.toUpperCase()] !== undefined) {
                            return props[key.toUpperCase()];
                        }
                    }
                    return 'Não identificado';
                };

                const fundoAgricola = findProp(['FUNDO_AGR']);
                const fazendaNome = findProp(['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']);
                const talhaoNome = findProp(['CD_TALHAO', 'COD_TALHAO', 'TALHAO']);
                const areaHa = findProp(['AREA_HA', 'AREA', 'HECTARES']);
                const variedade = findProp(['VARIEDADE', 'CULTURA']);

                const contentEl = App.elements.monitoramentoAereo.infoBoxContent;
                contentEl.innerHTML = `
                    <div class="info-title">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>Informações do Talhão</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Fundo Agrícola</span>
                        <span class="value">${fundoAgricola}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Fazenda</span>
                        <span class="value">${fazendaNome}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Talhão</span>
                        <span class="value">${talhaoNome}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Variedade</span>
                        <span class="value">${variedade}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Área Total</span>
                        <span class="value">${(typeof areaHa === 'number' ? areaHa : 0).toFixed(2).replace('.',',')} ha</span>
                    </div>
                `;
                
                this.hideTrapInfo();
                App.elements.monitoramentoAereo.infoBox.classList.add('visible');
            },

            hideTalhaoInfo() {
                if (App.state.selectedMapFeature) {
                    App.state.selectedMapFeature.setProperty('isSelected', false);
                    App.state.selectedMapFeature = null;
                }
                App.elements.monitoramentoAereo.infoBox.classList.remove('visible');
            },

            loadTraps() {
                Object.values(App.state.googleTrapMarkers).forEach(marker => marker.setMap(null));
                App.state.googleTrapMarkers = {};

                App.state.armadilhas.forEach(trap => {
                    if (trap.status === 'Ativa') {
                        this.addOrUpdateTrapMarker(trap);
                    }
                });
            },

            addOrUpdateTrapMarker(trap) {
                if (!trap.dataInstalacao) return;

                const installDate = trap.dataInstalacao.toDate();
                const now = new Date();
                const diasDesdeInstalacao = Math.floor((now - installDate) / (1000 * 60 * 60 * 24));

                let color = '#388e3c'; // Verde (Normal)
                if (diasDesdeInstalacao >= 5 && diasDesdeInstalacao <= 7) {
                    color = '#f57c00'; // Amarelo (Atenção)
                } else if (diasDesdeInstalacao > 7) {
                    color = '#d32f2f'; // Vermelho (Atrasado)
                }
                
                const trapIcon = {
                    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                    fillColor: color,
                    fillOpacity: 0.9,
                    strokeWeight: 1,
                    strokeColor: '#fff',
                    rotation: 0,
                    scale: 1.5,
                    anchor: new google.maps.Point(12, 24),
                };

                if (App.state.googleTrapMarkers[trap.id]) {
                    App.state.googleTrapMarkers[trap.id].setIcon(trapIcon);
                } else {
                    const marker = new google.maps.Marker({
                        position: { lat: trap.latitude, lng: trap.longitude },
                        map: App.state.googleMap,
                        icon: trapIcon,
                        title: `Armadilha instalada em ${installDate.toLocaleDateString()}`
                    });
                    
                    marker.addListener('click', () => this.showTrapInfo(trap.id));
                    App.state.googleTrapMarkers[trap.id] = marker;
                }
            },

            promptInstallTrap() {
                if (!App.state.googleUserMarker) {
                    App.ui.showAlert("Localização do usuário não disponível para instalar a armadilha.", "error");
                    return;
                }
                this.showTrapPlacementModal('loading');
                const position = App.state.googleUserMarker.getPosition();
                this.findTalhaoFromLocation(position);
            },

            findTalhaoFromLocation(position) {
                const containingTalhoes = [];
                const dataLayer = App.state.mapPolygons[0]; // Assumindo que só há um dataLayer
                if (!dataLayer) {
                    this.showTrapPlacementModal('failure');
                    return;
                }

                dataLayer.forEach(feature => {
                    const geometry = feature.getGeometry();
                    if (!geometry) return;

                    const type = geometry.getType();
                    let polygon;

                    if (type === 'Polygon') {
                        try {
                            polygon = new google.maps.Polygon({ paths: geometry.getArray()[0].getArray() });
                             if (google.maps.geometry.poly.containsLocation(position, polygon)) {
                                containingTalhoes.push(feature);
                            }
                        } catch(e) { console.error("Erro ao processar geometria de Polígono:", e); }
                    } else if (type === 'MultiPolygon') {
                        geometry.getArray().forEach(p => {
                            try {
                                polygon = new google.maps.Polygon({ paths: p.getArray()[0].getArray() });
                                if (google.maps.geometry.poly.containsLocation(position, polygon)) {
                                    containingTalhoes.push(feature);
                                }
                            } catch(e) { console.error("Erro ao processar geometria de MultiPolígono:", e); }
                        });
                    }
                });

                if (containingTalhoes.length === 1) {
                    this.showTrapPlacementModal('success', containingTalhoes);
                } else if (containingTalhoes.length > 1) {
                    this.showTrapPlacementModal('conflict', containingTalhoes);
                } else {
                    this.showTrapPlacementModal('failure');
                }
            },

            showTrapPlacementModal(state, data = null) {
                const { overlay, body, confirmBtn, manualBtn, title } = App.elements.trapPlacementModal;
                let content = '';
                
                confirmBtn.style.display = 'none';
                manualBtn.style.display = 'inline-flex';

                switch(state) {
                    case 'loading':
                        content = `<div class="spinner"></div><p style="margin-left: 15px;">A detetar talhão...</p>`;
                        manualBtn.style.display = 'none';
                        break;
                    case 'success':
                        const feature = data[0];
                        const talhaoName = feature.getProperty('CD_TALHAO') || feature.getProperty('TALHAO') || 'Desconhecido';
                        content = `<p>Talhão detetado: <strong>${talhaoName}</strong>. Deseja instalar a armadilha aqui?</p>`;
                        confirmBtn.style.display = 'inline-flex';
                        App.state.trapPlacementData = { feature: feature };
                        break;
                    case 'conflict':
                        content = `<p>Vários talhões detetados na sua localização. Por favor, selecione o correto:</p><div id="talhao-conflict-list" style="margin-top:15px; text-align:left;">`;
                        data.forEach((f, index) => {
                            const name = f.getProperty('CD_TALHAO') || f.getProperty('TALHAO') || `Opção ${index + 1}`;
                            content += `<label class="report-option-item" style="margin-bottom:10px;"><input type="radio" name="talhaoConflict" value="${index}"><span class="checkbox-visual"><i class="fas fa-check"></i></span><span class="option-content">${name}</span></label>`;
                        });
                        content += `</div>`;
                        confirmBtn.style.display = 'inline-flex';
                        App.state.trapPlacementData = { features: data };
                        break;
                    case 'failure':
                        content = `<p>Não foi possível detetar o talhão automaticamente. Por favor, selecione manualmente no mapa ou tente novamente.</p>`;
                        break;
                    case 'manual_select':
                        content = `<p style="font-weight: 500; text-align: center;">Clique no talhão desejado no mapa para o selecionar.</p>`;
                        manualBtn.style.display = 'none';
                        break;
                }
                
                body.innerHTML = content;
                overlay.classList.add('show');
                App.state.trapPlacementMode = state;
            },

            hideTrapPlacementModal() {
                 App.elements.trapPlacementModal.overlay.classList.remove('show');
                 App.state.trapPlacementMode = null;
                 App.state.trapPlacementData = null;
            },

            async installTrap(lat, lng, feature = null) {
                const findProp = (keys) => {
                    for (const key of keys) {
                        if (feature.getProperty(key.toUpperCase()) !== undefined) return feature.getProperty(key.toUpperCase());
                    }
                    return null;
                };

                const newTrap = {
                    latitude: lat,
                    longitude: lng,
                    dataInstalacao: Timestamp.fromDate(new Date()),
                    instaladoPor: App.state.currentUser.uid,
                    status: "Ativa",
                    fazendaNome: feature ? findProp(['NM_IMOVEL', 'NM_FAZENDA', 'NOME_FAZEN', 'FAZENDA']) : null,
                    talhaoNome: feature ? findProp(['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) : null,
                };

                try {
                    const docRef = await App.data.addDocument('armadilhas', newTrap);
                    App.ui.showAlert(`Armadilha ${docRef.id.substring(0, 5)}... instalada em ${newTrap.talhaoNome || 'local desconhecido'}.`, "success");
                } catch (error) {
                    console.error("Erro ao instalar armadilha:", error);
                    App.ui.showAlert("Falha ao instalar armadilha.", "error");
                }
            },

            promptCollectTrap(trapId) {
                App.ui.showConfirmationModal(
                    "Insira o número de mariposas capturadas para confirmar a coleta:",
                    async (count) => {
                        const mothCount = parseInt(count, 10);
                        if (isNaN(mothCount) || mothCount < 0) {
                            App.ui.showAlert("Por favor, insira um número válido.", "error");
                            return;
                        }
                        await this.collectTrap(trapId, mothCount);
                    },
                    true
                );
            },

            async collectTrap(trapId, count) {
                const updateData = {
                    status: "Coletada",
                    dataColeta: Timestamp.fromDate(new Date()),
                    coletadoPor: App.state.currentUser.uid,
                    contagemMariposas: count
                };

                try {
                    await App.data.updateDocument('armadilhas', trapId, updateData);
                    App.ui.showAlert("Coleta registrada com sucesso!", "success");
                    this.hideTrapInfo();
                } catch (error) {
                    console.error("Erro ao registrar coleta:", error);
                    App.ui.showAlert("Falha ao registrar coleta.", "error");
                }
            },
            
            showTrapInfo(trapId) {
                const trap = App.state.armadilhas.find(t => t.id === trapId);
                if (!trap) return;

                const installDate = trap.dataInstalacao.toDate();
                const collectionDate = new Date(installDate);
                collectionDate.setDate(installDate.getDate() + 7);
                const now = new Date();
                
                const diasDesdeInstalacao = Math.floor((now - installDate) / (1000 * 60 * 60 * 24));

                let statusText = 'Normal';
                let statusColor = 'var(--color-success)';
                if (diasDesdeInstalacao >= 5 && diasDesdeInstalacao <= 7) {
                    const diasRestantes = 7 - diasDesdeInstalacao;
                    statusText = `Atenção (${diasRestantes} dias restantes)`;
                    statusColor = 'var(--color-warning)';
                } else if (diasDesdeInstalacao > 7) {
                    const diasAtraso = diasDesdeInstalacao - 7;
                    statusText = `Atrasado (${diasAtraso} dias)`;
                    statusColor = 'var(--color-danger)';
                }

                const contentEl = App.elements.monitoramentoAereo.trapInfoBoxContent;
                contentEl.innerHTML = `
                    <div class="info-title" style="color: ${statusColor};">
                        <i class="fas fa-bug"></i>
                        <span>Detalhes da Armadilha</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Status</span>
                        <span class="value"><span class="status-indicator" style="background-color: ${statusColor};"></span>${statusText}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Data de Instalação</span>
                        <span class="value">${installDate.toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Data Prevista para Coleta</span>
                        <span class="value">${collectionDate.toLocaleDateString('pt-BR')}</span>
                    </div>
                    <button class="btn-collect-trap" id="btnCollectTrap"><i class="fas fa-check-circle"></i> Coletar Armadilha</button>
                `;

                document.getElementById('btnCollectTrap').onclick = () => this.promptCollectTrap(trapId);

                this.hideTalhaoInfo();
                App.elements.monitoramentoAereo.trapInfoBox.classList.add('visible');
            },

            hideTrapInfo() {
                App.elements.monitoramentoAereo.trapInfoBox.classList.remove('visible');
            },
            
            // Verifica o status das armadilhas para gerar notificações de coleta
            checkTrapStatusAndNotify() {
                const activeTraps = App.state.armadilhas.filter(t => t.status === 'Ativa');
                let newNotificationsForBell = [];
                
                activeTraps.forEach(trap => {
                    if (!trap.dataInstalacao) {
                        return;
                    }

                    const installDate = trap.dataInstalacao.toDate();
                    const now = new Date();

                    if (isNaN(installDate.getTime())) {
                        console.error(`Armadilha ${trap.id} com data de instalação inválida.`);
                        return;
                    }

                    const diasDesdeInstalacao = Math.floor((now - installDate) / (1000 * 60 * 60 * 24));

                    let notification = null;
                    if (diasDesdeInstalacao >= 5 && diasDesdeInstalacao <= 7) {
                        const diasRestantes = 7 - diasDesdeInstalacao;
                        const msg = diasRestantes > 0 ? `Coleta em ${diasRestantes} dia(s).` : "Coleta hoje.";
                        notification = { trapId: trap.id, type: 'warning', message: msg, timestamp: new Date() };
                    } else if (diasDesdeInstalacao > 7) {
                        const diasAtraso = diasDesdeInstalacao - 7;
                        notification = { trapId: trap.id, type: 'danger', message: `Coleta atrasada em ${diasAtraso} dia(s).`, timestamp: new Date() };
                    }

                    if (notification) {
                        // Adiciona para a lista do sino
                        newNotificationsForBell.push(notification);

                        // Mostra o pop-up apenas se não foi mostrado nesta sessão
                        if (!App.state.notifiedTrapIds.has(trap.id)) {
                            this.showTrapNotification(notification);
                            App.state.notifiedTrapIds.add(trap.id);
                        }
                    }
                });

                // Atualiza o estado geral de notificações
                const unreadNotifications = newNotificationsForBell.filter(n => !App.state.trapNotifications.some(oldN => oldN.trapId === n.trapId && oldN.message === n.message));
                if (unreadNotifications.length > 0) {
                    App.state.unreadNotificationCount += unreadNotifications.length;
                }
                App.state.trapNotifications = newNotificationsForBell.sort((a, b) => b.timestamp - a.timestamp);
                App.ui.updateNotificationBell();
            },

            showTrapNotification(notification) {
                const container = App.elements.notificationContainer;
                const notificationEl = document.createElement('div');
                notificationEl.className = `trap-notification ${notification.type}`;
                notificationEl.dataset.trapId = notification.trapId;

                const iconClass = notification.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle';
                
                notificationEl.innerHTML = `
                    <div class="icon"><i class="fas ${iconClass}"></i></div>
                    <div class="text">
                        <p><strong>Armadilha requer atenção</strong></p>
                        <p>${notification.message}</p>
                    </div>
                `;
                
                container.appendChild(notificationEl);

                setTimeout(() => {
                    notificationEl.remove();
                }, 10000);
            },

            centerOnTrap(trapId) {
                const marker = App.state.googleTrapMarkers[trapId];
                if (marker) {
                    const position = marker.getPosition();
                    App.state.googleMap.panTo(position);
                    App.state.googleMap.setZoom(18);
                    this.showTrapInfo(trapId);
                }
            }
        },

        charts: {
            _getVibrantColors(count) {
                const colors = [
                    '#1976D2', '#D32F2F', '#388E3C', '#F57C00', '#7B1FA2', '#00796B',
                    '#C2185B', '#512DA8', '#FBC02D', '#FFA000', '#689F38', '#455A64'
                ];
                const result = [];
                for (let i = 0; i < count; i++) {
                    result.push(colors[i % colors.length]);
                }
                return result;
            },
            _getCommonChartOptions(options = {}) {
                const { hasLongLabels = false, indexAxis = 'x' } = options;
                const styles = getComputedStyle(document.documentElement);
                const isDarkTheme = document.body.classList.contains('theme-dark');
                
                const textColor = isDarkTheme ? '#FFFFFF' : styles.getPropertyValue('--color-text').trim();
                const borderColor = styles.getPropertyValue('--color-border').trim();

                const chartOptions = {
                    indexAxis: indexAxis,
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { 
                                display: false,
                                color: borderColor
                            },
                            ticks: { 
                                color: textColor,
                                autoSkip: !hasLongLabels,
                                maxRotation: hasLongLabels && indexAxis === 'x' ? 10 : 0,
                                minRotation: hasLongLabels && indexAxis === 'x' ? 10 : 0
                            }
                        },
                        y: {
                            grid: { 
                                display: false,
                                color: borderColor
                            },
                            ticks: { color: textColor },
                            grace: '10%'
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: textColor
                            }
                        }
                    }
                };

                return chartOptions;
            },
            _createOrUpdateChart(id, config, isExpanded = false) { 
                const canvasId = isExpanded ? 'expandedChartCanvas' : id;
                const ctx = document.getElementById(canvasId)?.getContext('2d'); 
                if(!ctx) return; 

                const chartInstance = isExpanded ? App.state.expandedChart : App.state.charts[id];
                if (chartInstance) { 
                    chartInstance.destroy(); 
                } 
                
                const newChart = new Chart(ctx, config);
                if (isExpanded) {
                    App.state.expandedChart = newChart;
                } else {
                    App.state.charts[id] = newChart;
                }
            },
               destroyAll() {
                Object.keys(App.state.charts).forEach(id => {
                    if (App.state.charts[id]) {
                        App.state.charts[id].destroy();
                        delete App.state.charts[id];
                    }
                });
                if (App.state.expandedChart) {
                    App.state.expandedChart.destroy();
                    App.state.expandedChart = null;
                }
            },
            openChartModal(chartId) {
                const originalChart = App.state.charts[chartId];
                if (!originalChart) return;

                const modal = App.elements.chartModal;
                const originalTitle = document.querySelector(`.chart-card [data-chart-id="${chartId}"]`).closest('.chart-card').querySelector('.chart-title').textContent;
                
                modal.title.textContent = originalTitle;
                modal.overlay.classList.add('show');
                
                const config = JSON.parse(JSON.stringify(originalChart.config._config));
                config.options.maintainAspectRatio = false;
                
                if (originalChart.config.options.plugins.datalabels.formatter) {
                    config.options.plugins.datalabels.formatter = originalChart.config.options.plugins.datalabels.formatter;
                }

                this._createOrUpdateChart(chartId, config, true);
            },
            closeChartModal() {
                const modal = App.elements.chartModal;
                modal.overlay.classList.remove('show');
                if (App.state.expandedChart) {
                    App.state.expandedChart.destroy();
                    App.state.expandedChart = null;
                }
            },
            
            renderBrocaDashboardCharts() {
                const { brocaDashboardInicio, brocaDashboardFim } = App.elements.dashboard;
                App.actions.saveDashboardDates('broca', brocaDashboardInicio.value, brocaDashboardFim.value);
                const data = App.actions.filterDashboardData('registros', brocaDashboardInicio.value, brocaDashboardFim.value);

                this.renderTop10FazendasBroca(data);
                this.renderBrocaMensal(data);
                this.renderBrocaPosicao(data);
                this.renderBrocaPorVariedade(data);
            },
            renderPerdaDashboardCharts() {
                const { perdaDashboardInicio, perdaDashboardFim } = App.elements.dashboard;
                App.actions.saveDashboardDates('perda', perdaDashboardInicio.value, perdaDashboardFim.value);
                const data = App.actions.filterDashboardData('perdas', perdaDashboardInicio.value, perdaDashboardFim.value);

                this.renderPerdaPorFrenteTurno(data);
                this.renderComposicaoPerdaPorFrente(data);
                this.renderTop10FazendasPerda(data);
                this.renderPerdaPorFrente(data);
            },
            renderTop10FazendasBroca(data) {
                const fazendasMap = new Map();
                data.forEach(item => {
                    const fazendaKey = `${item.codigo} - ${item.fazenda}`;
                    if (!fazendasMap.has(fazendaKey)) fazendasMap.set(fazendaKey, { totalEntrenos: 0, totalBrocado: 0 });
                    const f = fazendasMap.get(fazendaKey);
                    f.totalEntrenos += Number(item.entrenos);
                    f.totalBrocado += Number(item.brocado);
                });
                const fazendasArray = Array.from(fazendasMap.entries()).map(([nome, d]) => ({ nome, indice: d.totalEntrenos > 0 ? (d.totalBrocado / d.totalEntrenos) * 100 : 0 }));
                fazendasArray.sort((a, b) => b.indice - a.indice);
                const top10 = fazendasArray.slice(0, 10);
                
                const commonOptions = this._getCommonChartOptions({ hasLongLabels: true });
                const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

                this._createOrUpdateChart('graficoTop10FazendasBroca', {
                    type: 'bar',
                    data: {
                        labels: top10.map(f => f.nome),
                        datasets: [{
                            label: 'Índice de Broca (%)',
                            data: top10.map(f => f.indice),
                            backgroundColor: this._getVibrantColors(top10.length)
                        }]
                    },
                    options: { 
                        ...commonOptions,
                        plugins: {
                            ...commonOptions.plugins,
                            legend: { display: false },
                            datalabels: {
                                color: datalabelColor, 
                                anchor: 'end', 
                                align: 'end',
                                font: { weight: 'bold', size: 14 },
                                formatter: (value) => `${value.toFixed(2)}%`
                            }
                        }
                    }
                });
            },
            renderBrocaMensal(data) {
                const dataByMonth = {};
                data.forEach(item => {
                    if (!item.data) return;
                    const date = new Date(item.data + 'T03:00:00Z');
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const monthLabel = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
                    if (!dataByMonth[monthKey]) dataByMonth[monthKey] = { totalBrocado: 0, totalEntrenos: 0, label: monthLabel };
                    dataByMonth[monthKey].totalBrocado += Number(item.brocado);
                    dataByMonth[monthKey].totalEntrenos += Number(item.entrenos);
                });
                const sortedMonths = Object.keys(dataByMonth).sort();
                const labels = sortedMonths.map(key => dataByMonth[key].label);
                const chartData = sortedMonths.map(key => {
                    const monthData = dataByMonth[key];
                    return monthData.totalEntrenos > 0 ? (monthData.totalBrocado / monthData.totalEntrenos) * 100 : 0;
                });
                
                const commonOptions = this._getCommonChartOptions();
                const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

                this._createOrUpdateChart('graficoBrocaMensal', {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Índice Mensal (%)',
                            data: chartData,
                            fill: true,
                            borderColor: App.ui._getThemeColors().primary,
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            tension: 0.4
                        }]
                    },
                    options: { 
                        ...commonOptions,
                        scales: { 
                            ...commonOptions.scales,
                            y: { ...commonOptions.scales.y, grid: { color: 'transparent', drawBorder: false } } 
                        },
                        plugins: {
                            ...commonOptions.plugins,
                            legend: { display: false },
                            datalabels: {
                                anchor: 'end', align: 'top', offset: 8,
                                color: datalabelColor,
                                font: { weight: 'bold', size: 14 },
                                formatter: (value) => `${value.toFixed(2)}%`
                            }
                        }
                    }
                });
            },
            renderBrocaPosicao(data) {
                const totalBase = data.reduce((sum, item) => sum + Number(item.base), 0);
                const totalMeio = data.reduce((sum, item) => sum + Number(item.meio), 0);
                const totalTopo = data.reduce((sum, item) => sum + Number(item.topo), 0);
                const totalGeral = totalBase + totalMeio + totalTopo;
                
                const commonOptions = this._getCommonChartOptions();

                this._createOrUpdateChart('graficoBrocaPosicao', {
                    type: 'doughnut',
                    data: {
                        labels: ['Base', 'Meio', 'Topo'],
                        datasets: [{
                            label: 'Posição da Broca',
                            data: [totalBase, totalMeio, totalTopo],
                            backgroundColor: this._getVibrantColors(3)
                        }]
                    },
                    options: { 
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            ...commonOptions.plugins,
                            legend: { ...commonOptions.plugins.legend, position: 'top' },
                            datalabels: {
                                color: '#FFFFFF', 
                                font: { weight: 'bold', size: 16 },
                                formatter: (value) => totalGeral > 0 ? `${(value / totalGeral * 100).toFixed(2)}%` : '0.00%'
                            }
                        }
                    }
                });
            },
            renderBrocaPorVariedade(data) {
                const variedadesMap = new Map();
                const fazendas = App.state.fazendas;

                data.forEach(item => {
                    const farm = fazendas.find(f => f.code === item.codigo);
                    const talhao = farm?.talhoes.find(t => t.name.toUpperCase() === item.talhao.toUpperCase());
                    const variedade = talhao?.variedade || 'N/A';

                    if (!variedadesMap.has(variedade)) {
                        variedadesMap.set(variedade, { totalEntrenos: 0, totalBrocado: 0 });
                    }
                    const v = variedadesMap.get(variedade);
                    v.totalEntrenos += Number(item.entrenos);
                    v.totalBrocado += Number(item.brocado);
                });

                const variedadesArray = Array.from(variedadesMap.entries())
                    .map(([nome, d]) => ({ nome, indice: d.totalEntrenos > 0 ? (d.totalBrocado / d.totalEntrenos) * 100 : 0 }))
                    .filter(v => v.nome !== 'N/A');
                    
                variedadesArray.sort((a, b) => b.indice - a.indice);
                const top10 = variedadesArray.slice(0, 10);

                const commonOptions = this._getCommonChartOptions({ indexAxis: 'y' });
                const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

                this._createOrUpdateChart('graficoBrocaPorVariedade', {
                    type: 'bar',
                    data: {
                        labels: top10.map(v => v.nome),
                        datasets: [{
                            label: 'Índice de Broca (%)',
                            data: top10.map(v => v.indice),
                            backgroundColor: this._getVibrantColors(top10.length).reverse()
                        }]
                    },
                    options: {
                        ...commonOptions,
                        plugins: {
                            ...commonOptions.plugins,
                            legend: { display: false },
                            datalabels: {
                                color: datalabelColor, 
                                anchor: 'end', 
                                align: 'end',
                                font: { weight: 'bold', size: 14 },
                                formatter: (value) => `${value.toFixed(2)}%`
                            }
                        }
                    }
                });
            },
            renderPerdaPorFrenteTurno(data) {
                const structuredData = {};
                const frentes = [...new Set(data.map(p => p.frenteServico || 'N/A'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                const turnos = [...new Set(data.map(p => p.turno || 'N/A'))].sort();

                turnos.forEach(turno => {
                    structuredData[turno] = {};
                    frentes.forEach(frente => {
                        structuredData[turno][frente] = { total: 0, count: 0 };
                    });
                });

                data.forEach(p => {
                    const frente = p.frenteServico || 'N/A';
                    const turno = p.turno || 'N/A';
                    if (structuredData[turno] && structuredData[turno][frente]) {
                        structuredData[turno][frente].total += p.total;
                        structuredData[turno][frente].count++;
                    }
                });

                const datasets = frentes.map((frente, index) => ({
                    label: `Frente ${frente}`,
                    data: turnos.map(turno => {
                        const d = structuredData[turno][frente];
                        return d.count > 0 ? d.total / d.count : 0;
                    }),
                    backgroundColor: this._getVibrantColors(frentes.length)[index]
                }));
                
                const commonOptions = this._getCommonChartOptions();
                const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

                this._createOrUpdateChart('graficoPerdaPorFrenteTurno', {
                    type: 'bar',
                    data: { labels: turnos.map(t => `Turno ${t}`), datasets },
                    options: {
                        ...commonOptions,
                        scales: { 
                            ...commonOptions.scales,
                            y: { ...commonOptions.scales.y, title: { display: true, text: 'Perda Média (kg)', color: commonOptions.scales.y.ticks.color } } 
                        },
                        plugins: {
                            ...commonOptions.plugins,
                            datalabels: {
                                color: datalabelColor,
                                font: { weight: 'bold', size: 12 },
                                formatter: (value) => value > 0 ? `${value.toFixed(2)} kg` : ''
                            }
                        }
                    }
                });
            },
            renderComposicaoPerdaPorFrente(data) {
                const tiposDePerda = ['canaInteira', 'tolete', 'toco', 'ponta', 'estilhaco', 'pedaco'];
                const tiposLabels = ['C. Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço'];
                const frentes = [...new Set(data.map(p => p.frenteServico || 'N/A'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                const structuredData = {};

                tiposDePerda.forEach(tipo => {
                    structuredData[tipo] = {};
                    frentes.forEach(frente => {
                        structuredData[tipo][frente] = 0;
                    });
                });

                data.forEach(item => {
                    const frente = item.frenteServico || 'N/A';
                    tiposDePerda.forEach(tipo => {
                        structuredData[tipo][frente] += item[tipo] || 0;
                    });
                });

                const datasets = frentes.map((frente, index) => ({
                    label: `Frente ${frente}`,
                    data: tiposDePerda.map(tipo => structuredData[tipo][frente]),
                    backgroundColor: this._getVibrantColors(frentes.length)[index]
                }));

                const commonOptions = this._getCommonChartOptions();
                
                this._createOrUpdateChart('graficoComposicaoPerda', {
                    type: 'bar',
                    data: { labels: tiposLabels, datasets },
                    options: {
                        ...commonOptions,
                        scales: { 
                            x: { ...commonOptions.scales.x, stacked: true }, 
                            y: { ...commonOptions.scales.y, stacked: true, title: { display: true, text: 'Perda Total (kg)', color: commonOptions.scales.y.ticks.color } } 
                        },
                        plugins: {
                             ...commonOptions.plugins,
                             datalabels: {
                                color: '#FFFFFF',
                                font: { weight: 'bold' },
                                formatter: (value) => value > 0.1 ? `${value.toFixed(2)} kg` : ''
                            }
                        }
                    }
                });
            },
            renderTop10FazendasPerda(data) {
                const fazendas = {};
                data.forEach(item => {
                    const fazendaKey = `${item.codigo} - ${item.fazenda}`;
                    if (!fazendas[fazendaKey]) fazendas[fazendaKey] = { total: 0, count: 0 };
                    fazendas[fazendaKey].total += item.total;
                    fazendas[fazendaKey].count++;
                });
                const sortedFazendas = Object.entries(fazendas)
                    .map(([nome, data]) => ({ nome, media: data.count > 0 ? data.total / data.count : 0 }))
                    .sort((a, b) => b.media - a.media).slice(0, 10);

                const commonOptions = this._getCommonChartOptions({ hasLongLabels: true });
                const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

                this._createOrUpdateChart('graficoTop10FazendasPerda', {
                    type: 'bar',
                    data: {
                        labels: sortedFazendas.map(f => f.nome),
                        datasets: [{
                            label: 'Perda Média (kg)',
                            data: sortedFazendas.map(f => f.media),
                            backgroundColor: this._getVibrantColors(sortedFazendas.length)
                        }]
                    },
                    options: {
                        ...commonOptions,
                        plugins: {
                            ...commonOptions.plugins,
                            legend: { display: false },
                            datalabels: {
                                color: datalabelColor, 
                                anchor: 'end', 
                                align: 'end',
                                font: { weight: 'bold', size: 14 },
                                formatter: (value) => `${value.toFixed(2)} kg`
                            }
                        }
                    }
                });
            },
            renderPerdaPorFrente(data) {
                const frentes = {};
                data.forEach(item => {
                    const frente = item.frenteServico || 'N/A';
                    if (!frentes[frente]) frentes[frente] = { total: 0, count: 0 };
                    frentes[frente].total += item.total;
                    frentes[frente].count++;
                });
                const sortedFrentes = Object.entries(frentes)
                    .map(([nome, data]) => ({ nome: `Frente ${nome}`, media: data.count > 0 ? data.total / data.count : 0 }))
                    .sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true }));

                const commonOptions = this._getCommonChartOptions();
                const datalabelColor = document.body.classList.contains('theme-dark') ? '#FFFFFF' : '#333333';

                this._createOrUpdateChart('graficoPerdaPorFrente', {
                    type: 'bar',
                    data: {
                        labels: sortedFrentes.map(f => f.nome),
                        datasets: [{
                            label: 'Perda Média (kg)',
                            data: sortedFrentes.map(f => f.media),
                            backgroundColor: this._getVibrantColors(sortedFrentes.length)
                        }]
                    },
                    options: {
                        ...commonOptions,
                        plugins: {
                            ...commonOptions.plugins,
                            legend: { display: false },
                            datalabels: {
                                color: datalabelColor, 
                                anchor: 'end', 
                                align: 'end',
                                font: { weight: 'bold', size: 14 },
                                formatter: (value) => `${value.toFixed(2)} kg`
                            }
                        }
                    }
                });
            }
        },

        reports: {
            _fetchAndDownloadReport(endpoint, filters, filename) {
                const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v != null && v !== ''));
                cleanFilters.generatedBy = App.state.currentUser?.username || 'Usuário Desconhecido';

                const params = new URLSearchParams(cleanFilters);
                const apiUrl = `${App.config.backendUrl}/reports/${endpoint}?${params.toString()}`;
                
                App.ui.setLoading(true, "A gerar relatório no servidor...");
        
                fetch(apiUrl)
                    .then(response => {
                        if (!response.ok) {
                            return response.text().then(text => { throw new Error(text || `Erro do servidor: ${response.statusText}`) });
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        a.remove();
                        App.ui.showAlert('Relatório gerado com sucesso!');
                    })
                    .catch(error => {
                        console.error('Erro ao gerar relatório via API:', error);
                        App.ui.showAlert(`Não foi possível gerar o relatório: ${error.message}`, "error");
                    })
                    .finally(() => {
                        App.ui.setLoading(false);
                    });
            },
            
            generateBrocamentoPDF() {
                const { filtroInicio, filtroFim, filtroFazenda, tipoRelatorio, farmTypeFilter } = App.elements.broca;
                if (!filtroInicio.value || !filtroFim.value) { App.ui.showAlert("Selecione Data Início e Fim.", "warning"); return; }
                const farmId = filtroFazenda.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                const selectedTypes = Array.from(farmTypeFilter).filter(cb => cb.checked).map(cb => cb.value);
                const filters = {
                    inicio: filtroInicio.value,
                    fim: filtroFim.value,
                    fazendaCodigo: farm ? farm.code : '',
                    tipoRelatorio: tipoRelatorio.value,
                    tipos: selectedTypes.join(',')
                };
                this._fetchAndDownloadReport('brocamento/pdf', filters, 'relatorio_brocamento.pdf');
            },
        
            generateBrocamentoCSV() {
                const { filtroInicio, filtroFim, filtroFazenda, tipoRelatorio, farmTypeFilter } = App.elements.broca;
                if (!filtroInicio.value || !filtroFim.value) { App.ui.showAlert("Selecione Data Início e Fim.", "warning"); return; }
                const farmId = filtroFazenda.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                const selectedTypes = Array.from(farmTypeFilter).filter(cb => cb.checked).map(cb => cb.value);
                const filters = {
                    inicio: filtroInicio.value,
                    fim: filtroFim.value,
                    fazendaCodigo: farm ? farm.code : '',
                    tipoRelatorio: tipoRelatorio.value,
                    tipos: selectedTypes.join(',')
                };
                this._fetchAndDownloadReport('brocamento/csv', filters, 'relatorio_brocamento.csv');
            },
        
            generatePerdaPDF() {
                const { filtroInicio, filtroFim, filtroFazenda, filtroTalhao, filtroOperador, filtroFrente, tipoRelatorio, farmTypeFilter } = App.elements.perda;
                if (!filtroInicio.value || !filtroFim.value) { App.ui.showAlert("Selecione Data Início e Fim.", "warning"); return; }
                const farmId = filtroFazenda.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                const selectedTypes = Array.from(farmTypeFilter).filter(cb => cb.checked).map(cb => cb.value);
                const filters = {
                    inicio: filtroInicio.value,
                    fim: filtroFim.value,
                    fazendaCodigo: farm ? farm.code : '',
                    talhao: filtroTalhao.value,
                    matricula: filtroOperador.value,
                    frenteServico: filtroFrente.value,
                    tipoRelatorio: tipoRelatorio.value,
                    tipos: selectedTypes.join(',')
                };
                this._fetchAndDownloadReport('perda/pdf', filters, 'relatorio_perda.pdf');
            },
        
            generatePerdaCSV() {
                const { filtroInicio, filtroFim, filtroFazenda, tipoRelatorio, farmTypeFilter } = App.elements.perda;
                if (!filtroInicio.value || !filtroFim.value) { App.ui.showAlert("Selecione Data Início e Fim.", "warning"); return; }
                const farmId = filtroFazenda.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                const selectedTypes = Array.from(farmTypeFilter).filter(cb => cb.checked).map(cb => cb.value);
                const filters = {
                    inicio: filtroInicio.value,
                    fim: filtroFim.value,
                    fazendaCodigo: farm ? farm.code : '',
                    tipoRelatorio: tipoRelatorio.value,
                    tipos: selectedTypes.join(',')
                };
                this._fetchAndDownloadReport('perda/csv', filters, 'relatorio_perda.csv');
            },
        
            generateCustomHarvestReport(format) {
                const { select, optionsContainer, tipoRelatorioSelect } = App.elements.relatorioColheita;
                const planId = select.value;
                const reportType = tipoRelatorioSelect.value;
                
                if (!planId) {
                    App.ui.showAlert("Por favor, selecione um plano de colheita.", "warning");
                    return;
                }
                
                let endpoint = `colheita/${format}`;
                const filters = { planId };
                
                if (reportType === 'detalhado') {
                    const selectedColumns = {};
                    optionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        selectedColumns[cb.dataset.column] = cb.checked;
                    });
                    filters.selectedColumns = JSON.stringify(selectedColumns);
                } else {
                    endpoint = `colheita/mensal/${format}`;
                }
                
                this._fetchAndDownloadReport(endpoint, filters, `relatorio_colheita_${reportType}.${format}`);
            },

            generateMonitoramentoPDF() {
                const { inicio, fim, fazendaFiltro } = App.elements.relatorioMonitoramento;
                if (!inicio.value || !fim.value) { App.ui.showAlert("Selecione Data Início e Fim.", "warning"); return; }
                
                const farmId = fazendaFiltro.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);

                const filters = {
                    inicio: inicio.value,
                    fim: fim.value,
                    fazendaCodigo: farm ? farm.code : ''
                };

                App.ui.showAlert("Função de relatório PDF de monitoramento ainda não implementada no backend.", "info");
                // this._fetchAndDownloadReport('monitoramento/pdf', filters, 'relatorio_monitoramento.pdf');
            },

            generateMonitoramentoCSV() {
                const { inicio, fim, fazendaFiltro } = App.elements.relatorioMonitoramento;
                if (!inicio.value || !fim.value) { App.ui.showAlert("Selecione Data Início e Fim.", "warning"); return; }

                const farmId = fazendaFiltro.value;
                const farm = App.state.fazendas.find(f => f.id === farmId);

                const filters = {
                    inicio: inicio.value,
                    fim: fim.value,
                    fazendaCodigo: farm ? farm.code : ''
                };
                App.ui.showAlert("Função de relatório CSV de monitoramento ainda não implementada no backend.", "info");
                // this._fetchAndDownloadReport('monitoramento/csv', filters, 'relatorio_monitoramento.csv');
            }
        },

        pwa: {
            registerServiceWorker() {
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', () => {
                        navigator.serviceWorker.register('./service-worker.js')
                            .then(registration => {
                                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                            })
                            .catch(error => {
                                console.log('ServiceWorker registration failed: ', error);
                            });
                    });

                    window.addEventListener('beforeinstallprompt', (e) => {
                        e.preventDefault();
                        App.state.deferredInstallPrompt = e;
                        App.elements.installAppBtn.style.display = 'flex';
                        console.log(`'beforeinstallprompt' event was fired.`);
                    });
                }
            }
        }
    };

    // Disponibiliza a função de inicialização do mapa globalmente para o callback da API do Google
    window.initMap = App.mapModule.initMap.bind(App.mapModule);

    // Inicia a aplicação
    App.init();
});


