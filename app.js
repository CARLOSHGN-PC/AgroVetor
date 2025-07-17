// FIREBASE: Importe os módulos necessários do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, getDocs, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {

    // FIREBASE: Configuração e inicialização do Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyBFXgXKDIBo9JD9vuGik5VDYZFDb_tbCrY", // Substitua pela sua chave de API
        authDomain: "agrovetor-v2.firebaseapp.com",
        projectId: "agrovetor-v2",
        storageBucket: "agrovetor-v2.appspot.com",
        messagingSenderId: "782518751171",
        appId: "1:782518751171:web:d501ee31c1db33da4eb776",
        measurementId: "G-JN4MSW63JR"
    };

    // Aplicação principal do Firebase
    const firebaseApp = initializeApp(firebaseConfig);
    const db = getFirestore(firebaseApp);
    const auth = getAuth(firebaseApp);
    const storage = getStorage(firebaseApp);

    // Aplicação secundária do Firebase, usada APENAS para criar novos utilizadores sem deslogar o admin.
    const secondaryApp = initializeApp(firebaseConfig, "secondary");
    const secondaryAuth = getAuth(secondaryApp);

    // Habilita a persistência offline
    enableIndexedDbPersistence(db)
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn("A persistência offline falhou. Múltiplas abas abertas?");
            } else if (err.code == 'unimplemented') {
                console.warn("O navegador atual não suporta a persistência offline.");
            }
        });


    const App = {
        config: {
            appName: "Inspeção e Planeamento de Cana com IA",
            themeKey: 'canaAppTheme',
            inactivityTimeout: 15 * 60 * 1000, // 15 minutos
            menuConfig: [
                { label: 'Dashboard', icon: 'fas fa-tachometer-alt', target: 'dashboard', permission: 'dashboard' },
                { label: 'Plan. Inspeção', icon: 'fas fa-calendar-alt', target: 'planejamento', permission: 'planejamento' },
                {
                    label: 'Colheita', icon: 'fas fa-tractor',
                    submenu: [
                        { label: 'Planeamento de Colheita', icon: 'fas fa-stream', target: 'planejamentoColheita', permission: 'planejamentoColheita' },
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
                admin: { dashboard: true, planejamentoColheita: true, planejamento: true, lancamentoBroca: true, lancamentoPerda: true, relatorioBroca: true, relatorioPerda: true, excluir: true, gerenciarUsuarios: true, configuracoes: true, cadastrarPessoas: true },
                supervisor: { dashboard: true, planejamentoColheita: true, planejamento: true, relatorioBroca: true, relatorioPerda: true, configuracoes: true, cadastrarPessoas: true, gerenciarUsuarios: true },
                tecnico: { dashboard: true, lancamentoBroca: true, lancamentoPerda: true, relatorioBroca: true, relatorioPerda: true },
                colaborador: { dashboard: true, lancamentoBroca: true, lancamentoPerda: true },
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
            unsubscribeListeners: [],
            deferredInstallPrompt: null,
            newUserCreationData: null,
            expandedChart: null,
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
            headerTitle: document.querySelector('header h1'),
            currentDateTime: document.getElementById('currentDateTime'),
            logoutBtn: document.getElementById('logoutBtn'),
            btnToggleMenu: document.getElementById('btnToggleMenu'),
            menu: document.getElementById('menu'),
            content: document.getElementById('content'),
            alertContainer: document.getElementById('alertContainer'),
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
            companyConfig: {
                logoUploadArea: document.getElementById('logoUploadArea'),
                logoInput: document.getElementById('logoInput'),
                logoPreview: document.getElementById('logoPreview'),
                removeLogoBtn: document.getElementById('removeLogoBtn'),
            },
            dashboard: {
                kpiBrocamento: document.getElementById('kpi-brocamento'),
                kpiPerda: document.getElementById('kpi-perda'),
                kpiInspecoes: document.getElementById('kpi-inspecoes'),
                kpiFazendas: document.getElementById('kpi-fazendas'),
                btnAnalisar: document.getElementById('btnAnalisarDashboard'),
                aiCard: document.getElementById('ai-analysis-card'),
                aiContent: document.getElementById('ai-analysis-content'),
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
                btnSaveFarm: document.getElementById('btnSaveFarm'),
                farmSelect: document.getElementById('farmSelect'),
                talhaoManagementContainer: document.getElementById('talhaoManagementContainer'),
                selectedFarmName: document.getElementById('selectedFarmName'),
                talhaoList: document.getElementById('talhaoList'),
                talhaoId: document.getElementById('talhaoId'),
                talhaoName: document.getElementById('talhaoName'),
                talhaoArea: document.getElementById('talhaoArea'),
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
                tipoRelatorio: document.getElementById('tipoRelatorioPerda'),
                btnPDF: document.getElementById('btnPDFPerda'),
                btnExcel: document.getElementById('btnExcelPerda'),
            },
            exclusao: {
                lista: document.getElementById('listaExclusao')
            },
            relatorioColheita: {
                select: document.getElementById('planoRelatorioSelect'),
                optionsContainer: document.querySelector('#relatorioColheitaCustom #reportOptionsContainer'),
                btnPDF: document.getElementById('btnGerarRelatorioCustomPDF'),
                btnExcel: document.getElementById('btnGerarRelatorioCustomExcel')
            },
            installAppBtn: document.getElementById('installAppBtn'),
        },

        init() {
            this.ui.applyTheme(localStorage.getItem(this.config.themeKey) || 'theme-green');
            this.ui.setupEventListeners();
            this.auth.checkSession();
            this.pwa.registerServiceWorker();
        },
        
        auth: {
            async checkSession() {
                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        const userDoc = await App.data.getUserData(user.uid, { source: 'cache' }).catch(() => null);
                        if (userDoc && userDoc.active) {
                            App.state.currentUser = { ...user, ...userDoc };
                            App.ui.showAppScreen();
                            App.data.listenToAllData();
                        } else {
                            const userDocServer = await App.data.getUserData(user.uid, { source: 'server' }).catch(() => null);
                            if (userDocServer && userDocServer.active) {
                                App.state.currentUser = { ...user, ...userDocServer };
                                App.ui.showAppScreen();
                                App.data.listenToAllData();
                            } else {
                                this.logout();
                                App.ui.showLoginMessage("A sua conta foi desativada ou não foi encontrada.");
                            }
                        }
                    } else {
                        App.ui.showLoginScreen();
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
            async logout() {
                App.data.cleanupListeners();
                await signOut(auth);
                App.state.currentUser = null;
                clearTimeout(App.state.inactivityTimer);
                App.ui.showLoginScreen();
            },
            initiateUserCreation() {
                const els = App.elements.users;
                const email = els.username.value.trim();
                const password = els.password.value;
                const role = els.role.value;
                if (!email || !password) { App.ui.showAlert("Preencha e-mail e senha.", "error"); return; }

                const permissions = {};
                els.permissionCheckboxes.forEach(cb => {
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
                
                const collectionsToListen = [ 'users', 'fazendas', 'personnel', 'registros', 'perdas', 'planos', 'harvestPlans' ];
                
                collectionsToListen.forEach(collectionName => {
                    const q = collection(db, collectionName);
                    const unsubscribe = onSnapshot(q, (querySnapshot) => {
                        const data = [];
                        querySnapshot.forEach((doc) => {
                            data.push({ id: doc.id, ...doc.data() });
                        });
                        App.state[collectionName] = data;
                        App.ui.renderAllDynamicContent();
                    }, (error) => {
                        console.error(`Erro ao ouvir a coleção ${collectionName}: `, error);
                    });
                    App.state.unsubscribeListeners.push(unsubscribe);
                });
                
                const configDocRef = doc(db, 'config', 'company');
                const unsubscribeConfig = onSnapshot(configDocRef, (doc) => {
                    App.state.companyLogo = doc.exists() ? doc.data().logoUrl : null;
                    App.ui.renderLogoPreview();
                });
                App.state.unsubscribeListeners.push(unsubscribeConfig);
            },
            async getDocument(collectionName, docId, options) {
                const docRef = doc(db, collectionName, docId);
                const docSnap = await getDoc(docRef, options);
                return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
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
            setLoading(isLoading, progressText = "A processar...") {
                App.elements.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
                App.elements.loadingProgressText.textContent = progressText;
            },
            showLoginScreen() {
                App.elements.loginScreen.style.display = 'flex';
                App.elements.appScreen.style.display = 'none';
                App.elements.userMenu.container.style.display = 'none';
                App.elements.loginUser.value = '';
                App.elements.loginPass.value = '';
                App.elements.loginUser.focus();
                this.closeAllMenus();
            },
            showAppScreen() {
                const { currentUser } = App.state;
                App.elements.loginScreen.style.display = 'none';
                App.elements.appScreen.style.display = 'flex';
                App.elements.userMenu.container.style.display = 'block';
                App.elements.userMenu.username.textContent = currentUser.username || currentUser.email;
                this.updateDateTime();
                setInterval(() => this.updateDateTime(), 60000);
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
                    App.charts.renderAll();
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
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                    tab.hidden = true;
                });
                const tab = document.getElementById(id);
                if (tab) {
                    tab.classList.add('active');
                    tab.hidden = false;
                    if (id === 'dashboard') App.charts.renderAll();
                    if (id === 'excluirDados') this.renderExclusao();
                    if (id === 'gerenciarUsuarios') this.renderUsersList();
                    if (id === 'cadastros') this.renderFarmSelect();
                    if (id === 'cadastrarPessoas') this.renderPersonnelList();
                    if (id === 'planejamento') this.renderPlanejamento();
                    if (id === 'planejamentoColheita') this.showHarvestPlanList();
                    if (id === 'lancamentoBroca' || id === 'lancamentoPerda') this.setDefaultDatesForEntryForms();
                    if (id === 'relatorioBroca' || id === 'relatorioPerda') this.setDefaultDatesForReportForms();
                    if (id === 'relatorioColheitaCustom') this.populateHarvestPlanSelect();
                }
                this.closeAllMenus();
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
            },
            clearForm(formElement) {
                if (!formElement) return;
                const inputs = formElement.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = false;
                    } else if (input.type !== 'date') { // Não limpa o campo de data
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
                    App.elements.perda.codigo
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
                const { talhaoList, talhaoManagementContainer, selectedFarmName } = App.elements.cadastros;
                const farm = App.state.fazendas.find(f => f.id === farmId);
                talhaoList.innerHTML = '';
                if (!farm) {
                    talhaoManagementContainer.style.display = 'none';
                    selectedFarmName.innerHTML = '';
                    return;
                }
                talhaoManagementContainer.style.display = 'block';
                selectedFarmName.innerHTML = `${farm.code} - ${farm.name} <button id="btnEditFarmName" class="btn-excluir" style="background:var(--color-info); margin-left:10px;"><i class="fas fa-edit"></i></button>`;
                document.getElementById('btnEditFarmName').addEventListener('click', () => App.actions.editFarmName(farm.id));

                if (!farm.talhoes || farm.talhoes.length === 0) {
                    talhaoList.innerHTML = '<p>Nenhum talhão cadastrado para esta fazenda.</p>';
                    return;
                }
                const table = document.createElement('table');
                table.id = 'personnelTable';
                table.className = 'harvestPlanTable';
                table.innerHTML = `<thead><tr><th>Nome</th><th>Área</th><th>Produção</th><th>Variedade</th><th>Corte</th><th>Distância</th><th>Última Colheita</th><th>Ações</th></tr></thead><tbody></tbody>`;
                const tbody = table.querySelector('tbody');
                farm.talhoes.sort((a,b) => a.name.localeCompare(b.name)).forEach(talhao => {
                    const row = tbody.insertRow();
                    const dataColheita = talhao.dataUltimaColheita && !isNaN(new Date(talhao.dataUltimaColheita)) 
                        ? new Date(talhao.dataUltimaColheita + 'T03:00:00Z').toLocaleDateString('pt-BR') 
                        : 'N/A';

                    row.innerHTML = `
                        <td data-label="Nome">${talhao.name}</td>
                        <td data-label="Área">${talhao.area || ''}</td>
                        <td data-label="Produção">${talhao.producao || ''}</td>
                        <td data-label="Variedade">${talhao.variedade || ''}</td>
                        <td data-label="Corte">${talhao.corte || ''}</td>
                        <td data-label="Distância">${talhao.distancia || ''}</td>
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
                const { talhaoSelectionList, editingGroupId } = App.elements.harvest;
                talhaoSelectionList.innerHTML = '';

                if (!App.state.activeHarvestPlan) return;

                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm || !farm.talhoes || farm.talhoes.length === 0) {
                    talhaoSelectionList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Nenhum talhão cadastrado nesta fazenda.</p>';
                    return;
                }

                const allAssignedTalhaoIds = App.actions.getAssignedTalhaoIds(editingGroupId.value);
                
                const availableTalhoes = farm.talhoes.filter(t => !allAssignedTalhaoIds.includes(t.id));

                if (availableTalhoes.length === 0 && plotIdsToCheck.length === 0) {
                        talhaoSelectionList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">Todos os talhões desta fazenda já foram alocados em um plano.</p>';
                        return;
                }
                
                const talhoesToShow = [...availableTalhoes];
                if (plotIdsToCheck.length > 0) {
                    const currentlyEditedTalhoes = farm.talhoes.filter(t => plotIdsToCheck.includes(t.id));
                    talhoesToShow.push(...currentlyEditedTalhoes);
                }

                const uniqueTalhoesToShow = [...new Map(talhoesToShow.map(item => [item['id'], item])).values()];


                uniqueTalhoesToShow.sort((a,b) => a.name.localeCompare(b.name)).forEach(talhao => {
                    const isChecked = plotIdsToCheck.includes(talhao.id);
                    
                    const label = document.createElement('label');
                    label.className = 'talhao-selection-item';
                    label.htmlFor = `talhao-select-${talhao.id}`;

                    label.innerHTML = `
                        <input type="checkbox" id="talhao-select-${talhao.id}" data-talhao-id="${talhao.id}" ${isChecked ? 'checked' : ''}>
                        <div class="talhao-name">${talhao.name}</div>
                        <div class="talhao-details">
                            <span><i class="fas fa-ruler-combined"></i>Área: ${talhao.area || 0} ha</span>
                            <span><i class="fas fa-weight-hanging"></i>Produção: ${talhao.producao || 0} ton</span>
                            <span><i class="fas fa-seedling"></i>Variedade: ${talhao.variedade || 'N/A'}</span>
                            <span><i class="fas fa-cut"></i>Corte: ${talhao.corte || 'N/A'}</span>
                        </div>
                    `;
                    talhaoSelectionList.appendChild(label);
                });
            },
            updatePermissionsForRole(role, containerSelector = '#gerenciarUsuarios .permission-grid') {
                const permissions = App.config.roles[role] || {};
                const container = document.querySelector(containerSelector);
                container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    const key = cb.dataset.permission;
                    cb.checked = !!permissions[key];
                });
            },
            _createUserCardHTML(user) {
                const getRoleInfo = (role) => {
                    const roles = { admin: ['Administrador', 'var(--color-primary)'], supervisor: ['Supervisor', 'var(--color-warning)'], tecnico: ['Técnico', 'var(--color-accent)'], colaborador: ['Colaborador', 'var(--color-purple)'], user: ['Utilizador', '#718096'] };
                    return roles[role] || ['Desconhecido', '#718096'];
                };
                const [roleName, roleColor] = getRoleInfo(user.role);
                const buttonsHTML = user.email.toLowerCase() === 'admin@agrovetor.com' ? '' : `
                    <button class="btn-excluir" style="background: ${user.active ? '#718096' : 'var(--color-success)'};" data-action="toggle" data-id="${user.id}">${user.active ? '<i class="fas fa-ban"></i> Desativar' : '<i class="fas fa-check"></i> Ativar'}</button>
                    <button class="btn-excluir" style="background: var(--color-info);" data-action="edit" data-id="${user.id}"><i class="fas fa-edit"></i> Editar</button>
                `;
                return `<div class="user-card"><div class="user-header"><div class="user-title">${user.username || user.email}<span class="user-role-badge" style="background: ${roleColor}; margin-left:10px; padding: 2px 8px; font-size: 12px; color: white; border-radius: 10px;">${roleName}</span></div><div class="user-status ${user.active ? '' : 'inactive'}" style="color: ${user.active ? 'var(--color-success)' : 'var(--color-danger)'}"><i class="fas fa-circle"></i> ${user.active ? 'Ativo' : 'Inativo'}</div></div><div class="user-actions" style="margin-top: 10px; display: flex; gap: 10px; justify-content: flex-end;">${buttonsHTML}</div></div>`;
            },
            renderUsersList() { const { list } = App.elements.users; list.innerHTML = App.state.users.map((u) => this._createUserCardHTML(u)).join(''); },
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
                if(planosOrdenados.length === 0) { lista.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--color-text-light);">Nenhuma inspeção planeada.</p>'; return; }
                planosOrdenados.forEach(plano => {
                    let status = plano.status;
                    const dataPlano = new Date(plano.dataPrevista + 'T03:00:00Z');
                    if (plano.status === 'Pendente' && dataPlano < hoje) { status = 'Atrasado'; }
                    const fazenda = App.state.fazendas.find(f => f.code === plano.fazendaCodigo);
                    const fazendaNome = fazenda ? `${fazenda.code} - ${fazenda.name}` : 'Desconhecida';
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
                const { id: planId, startDate, dailyRate, sequence } = App.state.activeHarvestPlan;
                
                tableBody.innerHTML = '';
                let grandTotalProducao = 0;
                let grandTotalArea = 0;
                let currentDate = startDate ? new Date(startDate + 'T03:00:00Z') : new Date();
                const dailyTon = parseFloat(dailyRate) || 1;

                sequence.forEach((group, index) => {
                    grandTotalProducao += group.totalProducao;
                    grandTotalArea += group.totalArea;

                    const diasNecessarios = dailyTon > 0 ? group.totalProducao / dailyTon : 0;
                    const dataEntrada = new Date(currentDate.getTime());
                    currentDate.setDate(currentDate.getDate() + diasNecessarios);
                    const dataSaida = new Date(currentDate.getTime());
                    
                    const idadeMediaMeses = App.actions.calculateAverageAge(group, startDate);
                    const diasAplicacao = App.actions.calculateMaturadorDays(group);

                    const row = tableBody.insertRow();
                    row.draggable = true;
                    row.dataset.id = group.id;
                    
                    row.innerHTML = `
                        <td data-label="Seq.">${index + 1}</td>
                        <td data-label="Fazenda">${group.fazendaCodigo} - ${group.fazendaName}</td>
                        <td data-label="Talhões" class="talhao-list-cell">${group.plots.map(p => p.talhaoName).join(', ')}</td>
                        <td data-label="Área (ha)">${group.totalArea.toFixed(2)}</td>
                        <td data-label="Prod. (ton)">${group.totalProducao.toFixed(2)}</td>
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
                    currentDate.setDate(currentDate.getDate() + 1);
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
                        <p>Produção Total Estimada: <span>${grandTotalProducao.toFixed(2)} ton</span></p>
                        <p>Área Total: <span>${grandTotalArea.toFixed(2)} ha</span></p>
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
            showConfirmationModal(message, onConfirm) {
                const { overlay, message: msgEl, confirmBtn, cancelBtn, closeBtn } = App.elements.confirmationModal;
                msgEl.textContent = message;

                const confirmHandler = () => {
                    onConfirm();
                    closeHandler();
                };
                const closeHandler = () => {
                    overlay.classList.remove('show');
                    confirmBtn.removeEventListener('click', confirmHandler);
                    cancelBtn.removeEventListener('click', closeHandler);
                    closeBtn.removeEventListener('click', closeHandler);
                };

                confirmBtn.addEventListener('click', confirmHandler);
                cancelBtn.addEventListener('click', closeHandler);
                closeBtn.addEventListener('click', closeHandler);
                overlay.classList.add('show');
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

                modalEls.permissionGrid.innerHTML = '';
                const permissionItems = App.config.menuConfig.flatMap(item => {
                    if (item.submenu) {
                        return item.submenu.filter(sub => sub.permission);
                    }
                    return item.permission ? [item] : [];
                });
                
                permissionItems.forEach(perm => {
                    if (!perm.permission) return;
                    const isChecked = user.permissions[perm.permission];
                    const label = document.createElement('label');
                    label.className = 'permission-item';
                    label.innerHTML = `<input type="checkbox" data-permission="${perm.permission}" ${isChecked ? 'checked' : ''}> <i class="${perm.icon}"></i> ${perm.label}`;
                    modalEls.permissionGrid.appendChild(label);
                });

                modalEls.overlay.classList.add('show');
            },
            closeUserEditModal() {
                App.elements.userEditModal.overlay.classList.remove('show');
            },
            applyTheme(theme) {
                document.body.className = theme;
                App.elements.userMenu.themeButtons.forEach(btn => {
                    btn.classList.toggle('active', btn.id === theme);
                });
                localStorage.setItem(App.config.themeKey, theme);
                if (App.state.currentUser) {
                    setTimeout(() => App.charts.renderAll(), 50);
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
                    if (!App.elements.userMenu.container.contains(e.target)) {
                        App.elements.userMenu.dropdown.classList.remove('show');
                        App.elements.userMenu.toggle.classList.remove('open');
                        App.elements.userMenu.toggle.setAttribute('aria-expanded', 'false');
                    }
                });

                App.elements.userMenu.toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dropdown = App.elements.userMenu.dropdown;
                    const toggle = App.elements.userMenu.toggle;
                    const isShown = dropdown.classList.toggle('show');
                    toggle.classList.toggle('open', isShown);
                    toggle.setAttribute('aria-expanded', isShown);
                });

                App.elements.userMenu.themeButtons.forEach(btn => {
                    btn.addEventListener('click', () => this.applyTheme(btn.id));
                });

                const chartModal = App.elements.chartModal;
                chartModal.closeBtn.addEventListener('click', () => App.charts.closeChartModal());
                chartModal.overlay.addEventListener('click', e => { if(e.target === chartModal.overlay) App.charts.closeChartModal(); });
                document.querySelectorAll('.btn-expand-chart').forEach(btn => {
                    btn.addEventListener('click', () => App.charts.openChartModal(btn.dataset.chartId));
                });

                App.elements.dashboard.btnAnalisar.addEventListener('click', () => App.gemini.getDashboardAnalysis());
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
                
                App.elements.companyConfig.logoUploadArea.addEventListener('click', () => App.elements.companyConfig.logoInput.click());
                App.elements.companyConfig.logoInput.addEventListener('change', (e) => App.actions.handleLogoUpload(e));
                App.elements.companyConfig.removeLogoBtn.addEventListener('click', () => App.actions.removeLogo());


                App.elements.cadastros.btnSaveFarm.addEventListener('click', () => App.actions.saveFarm());
                App.elements.cadastros.farmSelect.addEventListener('change', (e) => this.renderTalhaoList(e.target.value));
                App.elements.cadastros.talhaoList.addEventListener('click', e => { const btn = e.target.closest('button'); if(!btn) return; const { action, id } = btn.dataset; if(action === 'edit-talhao') App.actions.editTalhao(id); if(action === 'delete-talhao') App.actions.deleteTalhao(id); });
                App.elements.cadastros.btnSaveTalhao.addEventListener('click', () => App.actions.saveTalhao());
                App.elements.cadastros.csvUploadArea.addEventListener('click', () => App.elements.cadastros.csvFileInput.click());
                App.elements.cadastros.csvFileInput.addEventListener('change', (e) => App.actions.importFarmsFromCSV(e.target.files[0]));
                App.elements.cadastros.btnDownloadCsvTemplate.addEventListener('click', () => App.actions.downloadCsvTemplate());
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
            resetInactivityTimer() {
                clearTimeout(App.state.inactivityTimer);
                if (App.state.currentUser) {
                    App.state.inactivityTimer = setTimeout(() => {
                        App.ui.showAlert('Sessão expirada por inatividade.', 'warning');
                        App.auth.logout();
                    }, App.config.inactivityTimeout);
                }
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
                const currentPlanId = App.state.activeHarvestPlan ? App.state.activeHarvestPlan.id : null;

                App.state.harvestPlans.forEach(plan => {
                    if (currentPlanId && plan.id === currentPlanId) {
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
                if (App.state.activeHarvestPlan) {
                    App.state.activeHarvestPlan.sequence.forEach(group => {
                        if (editingGroupId && group.id == editingGroupId) {
                            return;
                        }
                        group.plots.forEach(plot => assignedIds.add(plot.talhaoId));
                    });
                }
                return Array.from(assignedIds);
            },
            async saveFarm() {
                const { farmCode, farmName } = App.elements.cadastros;
                const code = farmCode.value.trim();
                const name = farmName.value.trim().toUpperCase();
                if (!code || !name) { App.ui.showAlert("Código e Nome da fazenda são obrigatórios.", "error"); return; }
                
                const existingFarm = App.state.fazendas.find(f => f.code === code);
                if (existingFarm) {
                    App.ui.showAlert("Já existe uma fazenda com este código.", "error");
                    return;
                }

                App.ui.showConfirmationModal(`Tem a certeza que deseja guardar a fazenda ${name}?`, async () => {
                    try {
                        await App.data.addDocument('fazendas', { code, name, talhoes: [] });
                        App.ui.showAlert("Fazenda adicionada com sucesso!");
                        farmCode.value = ''; farmName.value = '';
                    } catch (error) {
                        App.ui.showAlert("Erro ao guardar fazenda.", "error");
                    }
                });
            },
            async editFarmName(farmId) {
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) return;

                const newName = prompt("Digite o novo nome para a fazenda:", farm.name);
                if (newName && newName.trim() !== '') {
                    App.ui.showConfirmationModal(`Tem a certeza que deseja alterar o nome da fazenda para "${newName.toUpperCase()}"?`, async () => {
                        await App.data.updateDocument('fazendas', farmId, { name: newName.toUpperCase() });
                        App.ui.showAlert("Nome da fazenda atualizado com sucesso!");
                    });
                }
            },
            async saveTalhao() {
                const { farmSelect, talhaoId, talhaoName, talhaoArea, talhaoProducao, talhaoCorte, talhaoVariedade, talhaoDistancia, talhaoUltimaColheita } = App.elements.cadastros;
                const farmId = farmSelect.value;
                if (!farmId) { App.ui.showAlert("Selecione uma fazenda.", "error"); return; }
                
                const farm = App.state.fazendas.find(f => f.id === farmId);
                if (!farm) { App.ui.showAlert("Fazenda selecionada não encontrada.", "error"); return; }
                
                const talhaoData = {
                    id: talhaoId.value ? parseInt(talhaoId.value) : Date.now(),
                    name: talhaoName.value.trim().toUpperCase(),
                    area: parseFloat(talhaoArea.value) || 0,
                    producao: parseFloat(talhaoProducao.value) || 0,
                    corte: parseInt(talhaoCorte.value) || 1,
                    variedade: talhaoVariedade.value.trim(),
                    distancia: parseFloat(talhaoDistancia.value) || 0,
                    dataUltimaColheita: talhaoUltimaColheita.value
                };
                if (!talhaoData.name || isNaN(talhaoData.area) || isNaN(talhaoData.producao)) { App.ui.showAlert("Nome, Área e Produção do talhão são obrigatórios e devem ser números válidos.", "error"); return; }
                
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
                        [talhaoId, talhaoName, talhaoArea, talhaoProducao, talhaoCorte, talhaoVariedade, talhaoDistancia, talhaoUltimaColheita].forEach(el => el.value = '');
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
                    talhaoEls.talhaoProducao.value = talhao.producao;
                    talhaoEls.talhaoCorte.value = talhao.corte;
                    talhaoEls.talhaoVariedade.value = talhao.variedade;
                    talhaoEls.talhaoDistancia.value = talhao.distancia;
                    talhaoEls.talhaoUltimaColheita.value = talhao.dataUltimaColheita;
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
                if (!file) return;

                App.ui.setLoading(true, "A carregar logo...");
                try {
                    const storageRef = ref(storage, 'company_assets/logo.png');
                    await uploadBytes(storageRef, file);
                    const downloadURL = await getDownloadURL(storageRef);
                    
                    await App.data.setDocument('config', 'company', { logoUrl: downloadURL });
                    App.ui.showAlert('Logo carregado com sucesso!');
                } catch (error) {
                    App.ui.showAlert('Erro ao carregar o logo.', 'error');
                } finally {
                    App.ui.setLoading(false);
                }
            },
            removeLogo() {
                App.ui.showConfirmationModal("Tem certeza que deseja remover o logotipo?", async () => {
                    App.ui.setLoading(true, "A remover logo...");
                    try {
                        const storageRef = ref(storage, 'company_assets/logo.png');
                        await deleteObject(storageRef);
                        await App.data.setDocument('config', 'company', { logoUrl: null });
                        App.ui.showAlert('Logo removido com sucesso!');
                    } catch (error) {
                        if (error.code !== 'storage/object-not-found') {
                           App.ui.showAlert('Erro ao remover o logo.', 'error');
                        } else {
                            await App.data.setDocument('config', 'company', { logoUrl: null });
                            App.ui.showAlert('Logo removido com sucesso!');
                        }
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
                App.ui.showConfirmationModal("Tem a certeza que deseja excluir este planeamento?", async () => {
                    await App.data.deleteDocument('planos', id);
                    App.ui.showAlert("Planeamento excluído.", "info");
                });
            },
            async verificarEAtualizarPlano(tipo, fazendaCodigo, talhao) {
                const planoPendente = App.state.planos.find(p => p.status === 'Pendente' && p.tipo === tipo && p.fazendaCodigo === fazendaCodigo && p.talhao.toLowerCase() === talhao.toLowerCase());
                if (planoPendente) {
                    await this.marcarPlanoComoConcluido(planoPendente.id);
                    App.ui.showAlert(`Planeamento correspondente para ${talhao} foi concluído automaticamente.`, 'info');
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
                        sequence: []
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
                        App.ui.showAlert('Preencha todos os campos de configuração da frente.', 'error');
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
                        App.ui.showAlert('Erro ao guardar o plano de colheita.', 'error');
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
            calculateAverageAge(group, startDate) {
                let totalAgeInDays = 0;
                let plotsWithDate = 0;
                group.plots.forEach(plot => {
                    const farm = App.state.fazendas.find(f => f.code === group.fazendaCodigo);
                    const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                        if (talhao && talhao.dataUltimaColheita && startDate) {
                        const dataInicioPlano = new Date(startDate + 'T03:00:00Z');
                        const dataUltima = new Date(talhao.dataUltimaColheita + 'T03:00:00Z');
                        if (!isNaN(dataInicioPlano) && !isNaN(dataUltima)) {
                            totalAgeInDays += Math.abs(dataInicioPlano - dataUltima);
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
                            App.ui.showAlert('Erro ao guardar inspeção.', 'error');
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
                                App.ui.showAlert('Lançamento de perda guardado offline. Será enviado quando houver conexão.', 'info');
                            }
                            this.verificarEAtualizarPlano('perda', newEntry.codigo, newEntry.talhao);
                        })
                        .catch((e) => {
                            App.ui.showAlert('Erro ao guardar lançamento de perda.', 'error');
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
                             App.ui.showAlert('O ficheiro CSV está vazio ou contém apenas o cabeçalho.', 'error'); return;
                         }
                         
                         App.ui.setLoading(true, `A iniciar importação de ${totalLines} linhas...`);
                         await new Promise(resolve => setTimeout(resolve, 100));

                         const fileHeaders = lines[0].split(';').map(h => h.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
                         const headerIndexes = {
                             farm_code: fileHeaders.indexOf('COD'), farm_name: fileHeaders.indexOf('FAZENDA'),
                             talhao_name: fileHeaders.indexOf('TALHAO'), talhao_area: fileHeaders.indexOf('AREA'),
                             talhao_producao: fileHeaders.indexOf('PRODUCAO'), talhao_variedade: fileHeaders.indexOf('VARIEDADE'),
                             talhao_corte: fileHeaders.indexOf('CORTE'),
                             talhao_distancia: fileHeaders.indexOf('DISTANCIA'),
                             talhao_ultima_colheita: fileHeaders.indexOf('DATAULTIMACOLHEITA'),
                         };

                         if (headerIndexes.farm_code === -1 || headerIndexes.farm_name === -1 || headerIndexes.talhao_name === -1) {
                             App.ui.showAlert('Cabeçalhos essenciais (Cód;FAZENDA;TALHÃO) não encontrados no ficheiro CSV.', 'error');
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
                                     talhoes: []
                                 };
                             }

                             const talhaoName = data[headerIndexes.talhao_name]?.trim().toUpperCase();
                             if(!talhaoName) continue;

                             let talhao = fazendasToUpdate[farmCode].talhoes.find(t => t.name.toUpperCase() === talhaoName);
                             if (talhao) { 
                                 talhao.area = parseFloat(data[headerIndexes.talhao_area]?.trim().replace(',', '.')) || talhao.area;
                                 talhao.producao = parseFloat(data[headerIndexes.talhao_producao]?.trim().replace(',', '.')) || talhao.producao;
                                 talhao.variedade = data[headerIndexes.talhao_variedade]?.trim() || talhao.variedade;
                                 talhao.corte = parseInt(data[headerIndexes.talhao_corte]?.trim()) || talhao.corte;
                                 talhao.distancia = parseFloat(data[headerIndexes.talhao_distancia]?.trim().replace(',', '.')) || talhao.distancia;
                                 talhao.dataUltimaColheita = data[headerIndexes.talhao_ultima_colheita]?.trim() || talhao.dataUltimaColheita;
                             } else { 
                                 fazendasToUpdate[farmCode].talhoes.push({
                                     id: Date.now() + i, name: talhaoName,
                                     area: parseFloat(data[headerIndexes.talhao_area]?.trim().replace(',', '.')) || 0,
                                     producao: parseFloat(data[headerIndexes.talhao_producao]?.trim().replace(',', '.')) || 0,
                                     variedade: data[headerIndexes.talhao_variedade]?.trim() || '',
                                     corte: parseInt(data[headerIndexes.talhao_corte]?.trim()) || 1,
                                     distancia: parseFloat(data[headerIndexes.talhao_distancia]?.trim().replace(',', '.')) || 0,
                                     dataUltimaColheita: data[headerIndexes.talhao_ultima_colheita]?.trim() || '',
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
                         App.ui.showAlert('Erro ao processar o ficheiro CSV.', 'error');
                         console.error(e);
                     } finally {
                         App.ui.setLoading(false);
                         App.elements.cadastros.csvFileInput.value = '';
                     }
                 };
                 reader.readAsText(file, 'ISO-8859-1');
            },
            downloadCsvTemplate() {
                const headers = "Cód;FAZENDA;TALHÃO;Área;Produção;Variedade;Corte;Distancia;DataUltimaColheita";
                const exampleRow = "4012;FAZ LAGOA CERCADA;T-01;50;4000;RB867515;2;10;2024-07-15";
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
                         if (totalLines <= 0) { App.ui.showAlert('O ficheiro CSV está vazio ou contém apenas o cabeçalho.', 'error'); return; }
                         
                         App.ui.setLoading(true, `A iniciar importação de ${totalLines} pessoas...`);
                         await new Promise(resolve => setTimeout(resolve, 100));

                         const fileHeaders = lines[0].split(';').map(h => h.trim().toUpperCase());
                         const headerIndexes = { matricula: fileHeaders.indexOf('MATRICULA'), name: fileHeaders.indexOf('NOME') };

                         if (headerIndexes.matricula === -1 || headerIndexes.name === -1) {
                             App.ui.showAlert('Cabeçalhos "Matricula" e "Nome" não encontrados.', 'error');
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
                         App.ui.showAlert('Erro ao processar o ficheiro CSV.', 'error');
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
                App.ui.showAlert("A sugestão de planeamento com IA ainda não foi implementada.", "info");
            }
        },

        charts: {
            renderAll() {
                this.renderKpiCards();
                this.renderTopBrocamentoChart();
                this.renderTopPerdaChart();
                this.renderEvolucaoMensalChart();
                this.renderInspecoesResponsavelChart();
                this.renderPerdaPorTipoChart();
                this.renderTopOperadoresChart();
            },
            _getThemeColors() {
                const styles = getComputedStyle(document.documentElement);
                return {
                    primary: styles.getPropertyValue('--color-primary').trim(),
                    primaryDark: styles.getPropertyValue('--color-primary-dark').trim(),
                    accent: styles.getPropertyValue('--color-accent').trim(),
                    text: styles.getPropertyValue('--color-text').trim(),
                    border: styles.getPropertyValue('--color-border').trim(),
                    danger: styles.getPropertyValue('--color-danger').trim(),
                    warning: styles.getPropertyValue('--color-warning').trim(),
                    info: styles.getPropertyValue('--color-info').trim(),
                    purple: styles.getPropertyValue('--color-purple').trim(),
                };
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
            openChartModal(chartId) {
                const originalChart = App.state.charts[chartId];
                if (!originalChart) return;

                const modal = App.elements.chartModal;
                const originalTitle = document.querySelector(`.chart-card [data-chart-id="${chartId}"]`).nextElementSibling.textContent;
                
                modal.title.textContent = originalTitle;
                modal.overlay.classList.add('show');
                
                const config = JSON.parse(JSON.stringify(originalChart.config._config));
                config.options.maintainAspectRatio = false;
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
            renderKpiCards() {
                const { kpiBrocamento, kpiPerda, kpiInspecoes, kpiFazendas } = App.elements.dashboard;

                const totalBrocado = App.state.registros.reduce((sum, reg) => sum + reg.brocado, 0);
                const totalEntrenos = App.state.registros.reduce((sum, reg) => sum + reg.entrenos, 0);
                const mediaPonderadaBroca = totalEntrenos > 0 ? ((totalBrocado / totalEntrenos) * 100) : 0;

                const totalPerda = App.state.perdas.reduce((sum, p) => sum + p.total, 0);
                const mediaPerda = App.state.perdas.length > 0 ? (totalPerda / App.state.perdas.length) : 0;

                const totalInspecoes = App.state.registros.length + App.state.perdas.length;
                const totalFazendas = App.state.fazendas.length;
                
                kpiBrocamento.innerHTML = `<div class="icon" style="background-color: var(--color-danger);"><i class="fas fa-bug"></i></div><div class="text"><div class="value">${mediaPonderadaBroca.toFixed(2)}%</div><div class="label">Média Brocamento</div></div>`;
                kpiPerda.innerHTML = `<div class="icon" style="background-color: var(--color-warning);"><i class="fas fa-chart-line"></i></div><div class="text"><div class="value">${mediaPerda.toFixed(2)} kg</div><div class="label">Média de Perda</div></div>`;
                kpiInspecoes.innerHTML = `<div class="icon" style="background-color: var(--color-info);"><i class="fas fa-clipboard-check"></i></div><div class="text"><div class="value">${totalInspecoes}</div><div class="label">Total Inspeções</div></div>`;
                kpiFazendas.innerHTML = `<div class="icon" style="background-color: var(--color-primary);"><i class="fas fa-tractor"></i></div><div class="text"><div class="value">${totalFazendas}</div><div class="label">Fazendas Cadastradas</div></div>`;
            },
            renderTopBrocamentoChart() {
                const themeColors = this._getThemeColors();
                const dadosPorFazenda = App.state.registros.reduce((acc, reg) => {
                    const fazendaKey = `${reg.codigo} - ${reg.fazenda}`;
                    if (!acc[fazendaKey]) {
                        acc[fazendaKey] = { totalBrocado: 0, totalEntrenos: 0 };
                    }
                    acc[fazendaKey].totalBrocado += reg.brocado;
                    acc[fazendaKey].totalEntrenos += reg.entrenos;
                    return acc;
                }, {});

                const mediasPonderadas = Object.entries(dadosPorFazenda).map(([key, value]) => ({
                    fazenda: key,
                    media: value.totalEntrenos > 0 ? (value.totalBrocado / value.totalEntrenos) * 100 : 0
                }));

                const top5 = mediasPonderadas.sort((a, b) => b.media - a.media).slice(0, 5);
                const labels = top5.map(item => item.fazenda);
                const data = top5.map(item => item.media.toFixed(2));

                this._createOrUpdateChart('graficoBrocamento', { type: 'bar', data: { labels, datasets: [{ label: 'Brocamento Ponderado (%)', data, backgroundColor: themeColors.danger }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: themeColors.text }, grid: { color: themeColors.border } }, x: { ticks: { color: themeColors.text }, grid: { color: themeColors.border } } }, plugins: { legend: { display: false } } } });
            },
            renderTopPerdaChart() {
                const themeColors = this._getThemeColors();
                const dadosPorFazenda = App.state.perdas.reduce((acc, p) => {
                    const fazendaKey = `${p.codigo} - ${p.fazenda}`;
                    if (!acc[fazendaKey]) {
                        acc[fazendaKey] = { totalPerda: 0, count: 0 };
                    }
                    acc[fazendaKey].totalPerda += p.total;
                    acc[fazendaKey].count++;
                    return acc;
                }, {});

                const medias = Object.entries(dadosPorFazenda).map(([key, value]) => ({
                    fazenda: key,
                    media: value.count > 0 ? value.totalPerda / value.count : 0
                }));
                
                const top5 = medias.sort((a, b) => b.media - a.media).slice(0, 5);
                const labels = top5.map(item => item.fazenda);
                const data = top5.map(item => item.media.toFixed(2));

                this._createOrUpdateChart('graficoPerda', { type: 'bar', data: { labels, datasets: [{ label: 'Média de Perda (kg)', data, backgroundColor: themeColors.warning }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: themeColors.text }, grid: { color: themeColors.border } }, x: { ticks: { color: themeColors.text }, grid: { color: themeColors.border } } }, plugins: { legend: { display: false } } } });
            },
            renderEvolucaoMensalChart() {
                const themeColors = this._getThemeColors();
                const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                
                const dadosBroca = App.state.registros.reduce((acc, reg) => {
                    const mes = new Date(reg.data + 'T03:00:00Z').getMonth();
                    if (!acc[mes]) acc[mes] = { totalBrocado: 0, totalEntrenos: 0 };
                    acc[mes].totalBrocado += reg.brocado;
                    acc[mes].totalEntrenos += reg.entrenos;
                    return acc;
                }, {});

                const dadosPerda = App.state.perdas.reduce((acc, p) => {
                    const mes = new Date(p.data + 'T03:00:00Z').getMonth();
                    if (!acc[mes]) acc[mes] = { totalPerda: 0, count: 0 };
                    acc[mes].totalPerda += p.total;
                    acc[mes].count++;
                    return acc;
                }, {});

                const mediasBroca = meses.map((_, i) => dadosBroca[i] ? ((dadosBroca[i].totalBrocado / dadosBroca[i].totalEntrenos) * 100).toFixed(2) : 0);
                const mediasPerda = meses.map((_, i) => dadosPerda[i] ? (dadosPerda[i].totalPerda / dadosPerda[i].count).toFixed(2) : 0);

                this._createOrUpdateChart('graficoEvolucaoMensal', {
                    type: 'line',
                    data: {
                        labels: meses,
                        datasets: [
                            { label: 'Brocamento (%)', data: mediasBroca, borderColor: themeColors.danger, backgroundColor: 'transparent', yAxisID: 'yBroca' },
                            { label: 'Perda (kg)', data: mediasPerda, borderColor: themeColors.warning, backgroundColor: 'transparent', yAxisID: 'yPerda' }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: {
                            yBroca: { type: 'linear', position: 'left', beginAtZero: true, ticks: { color: themeColors.danger }, grid: { drawOnChartArea: false } },
                            yPerda: { type: 'linear', position: 'right', beginAtZero: true, ticks: { color: themeColors.warning }, grid: { drawOnChartArea: false } },
                            x: { ticks: { color: themeColors.text }, grid: { color: themeColors.border } }
                        },
                        plugins: { legend: { labels: { color: themeColors.text } } }
                    }
                });
            },
            renderInspecoesResponsavelChart() {
                const themeColors = this._getThemeColors();
                const dadosPorResponsavel = [...App.state.registros, ...App.state.perdas].reduce((acc, item) => {
                    const responsavel = item.usuario || 'Não identificado';
                    acc[responsavel] = (acc[responsavel] || 0) + 1;
                    return acc;
                }, {});
                
                const labels = Object.keys(dadosPorResponsavel);
                const data = Object.values(dadosPorResponsavel);

                this._createOrUpdateChart('graficoInspecoesResponsavel', {
                    type: 'doughnut',
                    data: { labels, datasets: [{ data, backgroundColor: [themeColors.primary, themeColors.accent, themeColors.primaryDark, themeColors.info, themeColors.purple] }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: themeColors.text } }, datalabels: { color: '#fff', font: { weight: 'bold' } } } },
                    plugins: [ChartDataLabels]
                });
            },
            renderPerdaPorTipoChart() {
                const themeColors = this._getThemeColors();
                const perdaPorTipo = App.state.perdas.reduce((acc, p) => {
                    acc.canaInteira += p.canaInteira || 0;
                    acc.tolete += p.tolete || 0;
                    acc.toco += p.toco || 0;
                    acc.ponta += p.ponta || 0;
                    acc.estilhaco += p.estilhaco || 0;
                    acc.pedaco += p.pedaco || 0;
                    return acc;
                }, { canaInteira: 0, tolete: 0, toco: 0, ponta: 0, estilhaco: 0, pedaco: 0 });

                const labels = ['Cana Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço'];
                const data = Object.values(perdaPorTipo);
                const backgroundColors = [themeColors.danger, themeColors.warning, themeColors.purple, themeColors.info, themeColors.accent, themeColors.primaryDark];

                this._createOrUpdateChart('graficoPerdaPorTipo', {
                    type: 'pie',
                    data: { labels, datasets: [{ label: 'Perda por Tipo (kg)', data, backgroundColor: backgroundColors }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: themeColors.text } }, datalabels: { formatter: (value, ctx) => { let sum = 0; let dataArr = ctx.chart.data.datasets[0].data; dataArr.map(data => { sum += data; }); let percentage = (value*100 / sum).toFixed(2)+"%"; return percentage; }, color: '#fff' } } },
                    plugins: [ChartDataLabels]
                });
            },
            renderTopOperadoresChart() {
                const themeColors = this._getThemeColors();
                const dadosPorOperador = App.state.perdas.reduce((acc, p) => {
                    const operadorKey = p.operador || 'Não Identificado';
                    if (!acc[operadorKey]) {
                        acc[operadorKey] = { totalPerda: 0, count: 0 };
                    }
                    acc[operadorKey].totalPerda += p.total;
                    acc[operadorKey].count++;
                    return acc;
                }, {});

                const medias = Object.entries(dadosPorOperador).map(([key, value]) => ({
                    operador: key,
                    media: value.count > 0 ? value.totalPerda / value.count : 0
                }));

                const top5 = medias.sort((a, b) => b.media - a.media).slice(0, 5);
                const labels = top5.map(item => item.operador);
                const data = top5.map(item => item.media.toFixed(2));

                this._createOrUpdateChart('graficoTopOperadores', {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Perda Média por Operador (kg)', data, backgroundColor: themeColors.primary }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: themeColors.text }, grid: { color: themeColors.border } }, x: { beginAtZero: true, ticks: { color: themeColors.text }, grid: { color: themeColors.border } } }, plugins: { legend: { display: false } } }
                });
            }
        },

        reports: {
            _getFilteredData(sourceData, filterElements) {
                let data = [...sourceData];
                const filters = {
                    fazenda: filterElements.filtroFazenda?.value,
                    talhao: filterElements.filtroTalhao?.value,
                    turno: filterElements.filtroTurno?.value,
                    frente: filterElements.filtroFrente?.value,
                    operador: filterElements.filtroOperador?.value,
                    inicio: filterElements.filtroInicio?.value,
                    fim: filterElements.filtroFim?.value,
                };
                if(filters.fazenda) data = data.filter(d => d.codigo === filters.fazenda);
                if(filters.talhao) data = data.filter(d => d.talhao.toLowerCase().includes(filters.talhao.toLowerCase()));
                if(filters.turno) data = data.filter(d => d.turno === filters.turno);
                if(filters.frente) data = data.filter(d => d.frenteServico.toLowerCase().includes(filters.frente.toLowerCase()));
                if(filters.operador) data = data.filter(d => d.matricula === filters.operador);
                if(filters.inicio) data = data.filter(d => d.data >= filters.inicio);
                if(filters.fim) data = data.filter(d => d.data <= filters.fim);
                return data;
            },
            _createPdfWithHeaderFooter(doc, title) {
                const pageCount = doc.internal.getNumberOfPages();
                const logo = App.state.companyLogo;

                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    if (logo) {
                        try { 
                            doc.addImage(logo, 'PNG', 14, 6, 25, 12); 
                        } catch(e) { console.error("Erro ao adicionar logo:", e); }
                    }
                    doc.setFontSize(16);
                    doc.setFont(undefined, 'bold');
                    doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
                    doc.setFontSize(8);
                    doc.setFont(undefined, 'normal');
                    doc.text(new Date().toLocaleString('pt-BR'), doc.internal.pageSize.getWidth() - 14, 15, { align: 'right' });
                    doc.setDrawColor(224, 224, 224);
                    doc.line(14, 22, doc.internal.pageSize.getWidth() - 14, 22);

                    doc.setDrawColor(224, 224, 224);
                    doc.line(14, doc.internal.pageSize.getHeight() - 15, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 15);
                    doc.setFontSize(8);
                    doc.text(`Relatório gerado por: ${App.state.currentUser.username}`, 14, doc.internal.pageSize.getHeight() - 10);
                    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
                }

                doc.save(`${title.toLowerCase().replace(/\s/g, '_')}.pdf`);
                App.ui.showAlert('Relatório PDF gerado com sucesso!');
            },
            _generateCSV(filename, headers, bodyData) {
                let csvContent = "\uFEFF" + headers.map(h => `"${h}"`).join(';') + '\n';
                csvContent += bodyData.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(';')).join('\n');
                const encodedUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                App.ui.showAlert('Relatório Excel (CSV) gerado com sucesso!');
            },
            generateCustomHarvestReport(format) {
                const { select, optionsContainer } = App.elements.relatorioColheita;
                const planId = select.value;
                if (!planId) {
                    App.ui.showAlert("Por favor, selecione um plano de colheita.", "warning");
                    return;
                }

                const plan = App.state.harvestPlans.find(p => p.id == planId);
                if (!plan) {
                    App.ui.showAlert("Plano não encontrado.", "error");
                    return;
                }

                const options = {};
                optionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    options[cb.dataset.column] = cb.checked;
                });
                
                const baseHeaders = ['Seq.', 'Fazenda', 'Talhões', 'Área (ha)', 'Prod. (ton)'];
                const dynamicHeaders = [];
                if (options.variedade) dynamicHeaders.push('Variedade');
                if (options.idade) dynamicHeaders.push('Idade (m)');
                if (options.atr) dynamicHeaders.push('ATR');
                if (options.maturador) dynamicHeaders.push('Maturador');
                if (options.diasAplicacao) dynamicHeaders.push('Dias Aplic.');
                const finalHeaders = ['Entrada', 'Saída'];

                const fullHeaders = [...baseHeaders, ...dynamicHeaders, ...finalHeaders];
                const body = [];
                let currentDate = new Date(plan.startDate + 'T03:00:00Z');
                const dailyTon = parseFloat(plan.dailyRate) || 1;

                plan.sequence.forEach((group, index) => {
                    const diasNecessarios = dailyTon > 0 ? group.totalProducao / dailyTon : 0;
                    const dataEntrada = new Date(currentDate.getTime());
                    currentDate.setDate(currentDate.getDate() + diasNecessarios);
                    const dataSaida = new Date(currentDate.getTime());

                    const baseRow = [
                        index + 1,
                        `${group.fazendaCodigo} - ${group.fazendaName}`,
                        group.plots.map(p => p.talhaoName).join(', '),
                        group.totalArea.toFixed(2),
                        group.totalProducao.toFixed(2),
                    ];

                    const dynamicRow = [];
                    if (options.variedade) {
                        const varieties = new Set();
                        const farm = App.state.fazendas.find(f => f.code === group.fazendaCodigo);
                        group.plots.forEach(plot => {
                            const talhao = farm?.talhoes.find(t => t.id === plot.talhaoId);
                            if (talhao?.variedade) varieties.add(talhao.variedade);
                        });
                        dynamicRow.push(Array.from(varieties).join(', '));
                    }
                    if (options.idade) dynamicRow.push(App.actions.calculateAverageAge(group, plan.startDate));
                    if (options.atr) dynamicRow.push(group.atr || 'N/A');
                    if (options.maturador) dynamicRow.push(group.maturador || 'N/A');
                    if (options.diasAplicacao) dynamicRow.push(App.actions.calculateMaturadorDays(group));
                    
                    const finalRowData = [
                        dataEntrada.toLocaleDateString('pt-BR'),
                        dataSaida.toLocaleDateString('pt-BR')
                    ];
                    
                    body.push([...baseRow, ...dynamicRow, ...finalRowData]);
                    currentDate.setDate(currentDate.getDate() + 1);
                });

                const reportTitle = `Plano de Colheita - ${plan.frontName}`;
                if (format === 'pdf') {
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF({ orientation: 'landscape' });
                    doc.autoTable({
                        head: [fullHeaders],
                        body: body,
                        startY: 25,
                        headStyles: { fillColor: [46, 125, 50], textColor: 255 },
                        alternateRowStyles: { fillColor: [245, 245, 245] },
                        styles: { fontSize: 7 },
                        columnStyles: { 2: { cellWidth: 35 } }
                    });
                    this._createPdfWithHeaderFooter(doc, reportTitle);
                } else if (format === 'csv') {
                    this._generateCSV(`${plan.frontName.replace(/\s+/g, '_')}.csv`, fullHeaders, body);
                }
            },
            generateBrocamentoPDF() {
                const { filtroInicio, filtroFim, tipoRelatorio } = App.elements.broca;
                if (!filtroInicio.value || !filtroFim.value) {
                    App.ui.showAlert("Por favor, selecione a Data Início e a Data Fim para gerar o relatório.", "warning");
                    return;
                }
                const data = this._getFilteredData(App.state.registros, App.elements.broca);
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });
                const title = tipoRelatorio.value === 'A' ? 'Relatório Geral de Brocamento' : 'Relatório de Brocamento por Fazenda';
                const headers = [['Data', 'Talhão', 'Corte', 'Entrenós', 'Brocado', 'Brocamento (%)']];
                
                if (tipoRelatorio.value === 'A') {
                    const body = data.map(r => [r.data, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento]);
                    doc.autoTable({ head: headers, body: body, startY: 25, headStyles: { fillColor: [46, 125, 50], textColor: 255 }, alternateRowStyles: { fillColor: [245, 245, 245] } });
                } else {
                    let finalY = 25;
                    const groupedData = data.reduce((acc, reg) => {
                        const key = `${reg.codigo} - ${reg.fazenda}`;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(reg);
                        return acc;
                    }, {});

                    let grandTotalEntrenos = 0;
                    let grandTotalBrocado = 0;

                    Object.keys(groupedData).sort((a,b) => parseInt(a) - parseInt(b)).forEach(fazendaKey => {
                        const farmData = groupedData[fazendaKey];
                        const body = farmData.map(r => [r.data, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento]);
                        
                        let subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
                        let subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
                        grandTotalEntrenos += subTotalEntrenos;
                        grandTotalBrocado += subTotalBrocado;

                        if (finalY > 180) { doc.addPage(); finalY = 25; }
                        doc.setFontSize(12);
                        doc.setFont(undefined, 'bold');
                        doc.text(fazendaKey, 14, finalY);
                        
                        doc.autoTable({
                            head: headers, body: body, startY: finalY + 2,
                            headStyles: { fillColor: [46, 125, 50], textColor: 255 },
                            foot: [['Subtotal', '', '', subTotalEntrenos, subTotalBrocado, '']],
                            footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
                            alternateRowStyles: { fillColor: [245, 245, 245] }
                        });
                        finalY = doc.lastAutoTable.finalY + 10;
                    });
                    
                    if (finalY > 190) { doc.addPage(); finalY = 25; }
                    doc.setFontSize(12);
                    doc.setFont(undefined, 'bold');
                    doc.text(`Total Geral: Entrenós: ${grandTotalEntrenos} | Brocado: ${grandTotalBrocado}`, 14, finalY);
                }
                this._createPdfWithHeaderFooter(doc, title);
            },
            generateBrocamentoCSV() {
                    const { filtroInicio, filtroFim, tipoRelatorio } = App.elements.broca;
                if (!filtroInicio.value || !filtroFim.value) {
                    App.ui.showAlert("Por favor, selecione a Data Início e a Data Fim para gerar o relatório.", "warning");
                    return;
                }
                const data = this._getFilteredData(App.state.registros, App.elements.broca);
                const headers = ['Fazenda', 'Data', 'Talhão', 'Corte', 'Entrenós', 'Brocado', 'Brocamento (%)'];
                let body = [];

                if (tipoRelatorio.value === 'A') {
                    body = data.map(r => [`${r.codigo} - ${r.fazenda}`, r.data, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento]);
                    this._generateCSV('relatorio_geral_brocamento.csv', headers, body);
                } else {
                        const groupedData = data.reduce((acc, reg) => {
                            const key = `${reg.codigo} - ${reg.fazenda}`;
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(reg);
                            return acc;
                        }, {});

                    let grandTotalEntrenos = 0;
                    let grandTotalBrocado = 0;

                    Object.keys(groupedData).sort((a,b) => parseInt(a) - parseInt(b)).forEach(fazendaKey => {
                        const farmData = groupedData[fazendaKey];
                        farmData.forEach(r => {
                            body.push([fazendaKey, r.data, r.talhao, r.corte, r.entrenos, r.brocado, r.brocamento]);
                        });
                        let subTotalEntrenos = farmData.reduce((sum, r) => sum + r.entrenos, 0);
                        let subTotalBrocado = farmData.reduce((sum, r) => sum + r.brocado, 0);
                        grandTotalEntrenos += subTotalEntrenos;
                        grandTotalBrocado += subTotalBrocado;
                        body.push(['Subtotal', '', '', '', subTotalEntrenos, subTotalBrocado, '']);
                    });
                    body.push([]); // Linha vazia
                    body.push(['Total Geral', '', '', '', grandTotalEntrenos, grandTotalBrocado, '']);
                    this._generateCSV('relatorio_brocamento_por_fazenda.csv', headers, body);
                }
            },
            generatePerdaPDF() {
                const { filtroInicio, filtroFim } = App.elements.perda;
                if (!filtroInicio.value || !filtroFim.value) {
                    App.ui.showAlert("Por favor, selecione a Data Início e a Data Fim para gerar o relatório.", "warning");
                    return;
                }
                const data = this._getFilteredData(App.state.perdas, App.elements.perda);
                const isDetailed = App.elements.perda.tipoRelatorio.value === 'B';
                const finalTitle = isDetailed ? 'Relatório de Perda Detalhado' : 'Relatório de Perda Resumido';
                
                let headers, body;
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });
                const formatDate = (dateStr) => new Date(dateStr + 'T03:00:00Z').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

                if (isDetailed) {
                    headers = [['Mês', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Frota', 'C.Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço', 'Total']];
                    body = data.map(p => [formatDate(p.data), `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.frota, p.canaInteira, p.tolete, p.toco, p.ponta, p.estilhaco, p.pedaco, p.total]);
                } else {
                    headers = [['Mês', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Matrícula', 'Frota', 'Total']];
                    body = data.map(p => [formatDate(p.data), `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.matricula, p.frota, p.total]);
                }
                
                const grandTotal = data.reduce((sum, p) => sum + p.total, 0);
                const foot = isDetailed ? [['', '', '', '', '', '', '', '', '', '', '', '', 'Total Geral', grandTotal.toFixed(2)]] : [['', '', '', '', '', '', 'Total Geral', grandTotal.toFixed(2)]];

                doc.autoTable({
                    head: headers,
                    body: body,
                    foot: foot,
                    startY: 25,
                    headStyles: { fillColor: [46, 125, 50], textColor: 255 },
                    footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                    styles: { fontSize: 7 }
                });
                this._createPdfWithHeaderFooter(doc, finalTitle);
            },
            generatePerdaCSV() {
                const { filtroInicio, filtroFim } = App.elements.perda;
                if (!filtroInicio.value || !filtroFim.value) {
                    App.ui.showAlert("Por favor, selecione a Data Início e a Data Fim para gerar o relatório.", "warning");
                    return;
                }
                const data = this._getFilteredData(App.state.perdas, App.elements.perda);
                const isDetailed = App.elements.perda.tipoRelatorio.value === 'B';
                const formatDate = (dateStr) => new Date(dateStr + 'T03:00:00Z').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                
                let headers, body;

                if(isDetailed) {
                    headers = ['Mês', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Operador', 'Frota', 'Cana Inteira', 'Tolete', 'Toco', 'Ponta', 'Estilhaço', 'Pedaço', 'Total', 'Média'];
                    body = data.map(p => [formatDate(p.data), `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.operador, p.frota, p.canaInteira, p.tolete, p.toco, p.ponta, p.estilhaco, p.pedaco, p.total, p.media]);
                } else {
                    headers = ['Mês', 'Fazenda', 'Talhão', 'Frente', 'Turno', 'Matrícula', 'Frota', 'Total'];
                    body = data.map(p => [formatDate(p.data), `${p.codigo} - ${p.fazenda}`, p.talhao, p.frenteServico, p.turno, p.matricula, p.frota, p.total]);
                }
                
                const grandTotal = data.reduce((sum, p) => sum + p.total, 0);
                body.push([]);
                const totalRow = new Array(headers.length).fill('');
                totalRow[headers.length - (isDetailed ? 2 : 1)] = 'Total Geral';
                totalRow[headers.length - (isDetailed ? 1 : 0)] = grandTotal.toFixed(2);
                body.push(totalRow);
                
                this._generateCSV('relatorio_perda.csv', headers, body);
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

    // Inicia a aplicação
    App.init();
});
