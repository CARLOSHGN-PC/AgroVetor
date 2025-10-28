// auth.js
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
    setLoading,
    showLoginMessage,
    showAppScreen,
    showTab,
    showOfflineUserSelection,
    showLoginScreen,
    hideImpersonationBanner,
    showAlert,
    updatePermissionsForRole,
    showAdminPasswordConfirmModal,
    closeAdminPasswordConfirmModal,
    showConfirmationModal,
    closeUserEditModal
} from './ui.js';

let App, db, auth, secondaryAuth;

function initAuth(_App, _db, _auth, _secondaryAuth) {
    App = _App;
    db = _db;
    auth = _auth;
    secondaryAuth = _secondaryAuth;
}

async function checkSession() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            setLoading(true, "A carregar dados do utilizador...");
            const userDoc = await App.data.getUserData(user.uid);

            if (userDoc && userDoc.active) {
                let companyDoc = null;
                if (userDoc.role !== 'super-admin' && userDoc.companyId) {
                    companyDoc = await App.data.getDocument('companies', userDoc.companyId);
                    if (!companyDoc || companyDoc.active === false) {
                        logout();
                        showLoginMessage("A sua empresa está desativada. Por favor, contate o suporte.", "error");
                        return;
                    }
                }

                App.state.currentUser = { ...user, ...userDoc };

                if (!App.state.currentUser.companyId && App.state.currentUser.role !== 'super-admin') {
                    logout();
                    showLoginMessage("A sua conta não está associada a uma empresa. Contacte o suporte.", "error");
                    return;
                }

                setLoading(true, "A carregar configurações...");
                try {
                    const globalConfigsDoc = await App.data.getDocument('global_configs', 'main');
                    App.state.globalConfigs = globalConfigsDoc || {};

                    if (companyDoc) {
                        App.state.companies = [companyDoc];
                    }

                    App.actions.saveUserProfileLocally(App.state.currentUser);
                    showAppScreen();
                    App.data.listenToAllData();

                    const draftRestored = await App.actions.checkForDraft();
                    if (!draftRestored) {
                        const lastTab = localStorage.getItem('agrovetor_lastActiveTab');
                        showTab(lastTab || 'dashboard');
                    }

                    if (navigator.onLine) {
                        App.actions.syncOfflineWrites();
                    }

                } catch (error) {
                    console.error("Falha crítica ao carregar dados iniciais:", error);
                    logout();
                    showLoginMessage("Não foi possível carregar as configurações da aplicação. Tente novamente.", "error");
                }

            } else {
                logout();
                showLoginMessage("A sua conta foi desativada ou não foi encontrada.");
            }
        } else {
            const localProfiles = App.actions.getLocalUserProfiles();
            if (localProfiles.length > 0 && !navigator.onLine) {
                showOfflineUserSelection(localProfiles);
            } else {
                showLoginScreen();
            }
        }
        setLoading(false);
    });
}

async function login() {
    const email = App.elements.loginUser.value.trim();
    const password = App.elements.loginPass.value;
    if (!email || !password) {
        showLoginMessage("Preencha e-mail e senha.");
        return;
    }
    setLoading(true, "A autenticar...");
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showLoginMessage("E-mail ou senha inválidos.");
        } else if (error.code === 'auth/network-request-failed') {
            showLoginMessage("Erro de rede. Verifique sua conexão e tente novamente.");
        } else {
            showLoginMessage("Ocorreu um erro ao fazer login.");
        }
        console.error("Erro de login:", error.code, error.message);
    } finally {
        setLoading(false);
    }
}

async function loginOffline(userId) {
    const localProfiles = App.actions.getLocalUserProfiles();
    const userProfile = localProfiles.find(p => p.uid === userId);
    if (userProfile) {
        App.state.currentUser = userProfile;
        showAppScreen();
        App.mapModule.loadOfflineShapes();
        App.data.listenToAllData();
    }
}

async function logout() {
    if (navigator.onLine) {
        await signOut(auth);
    }
    App.data.cleanupListeners();
    App.actions.stopGpsTracking();
    App.state.currentUser = null;

    if (App.state.isImpersonating) {
        App.state.isImpersonating = false;
        App.state.originalUser = null;
        hideImpersonationBanner();
    }

    clearTimeout(App.state.inactivityTimer);
    clearTimeout(App.state.inactivityWarningTimer);
    localStorage.removeItem('agrovetor_lastActiveTab');
    showLoginScreen();
}

function initiateUserCreation() {
    const els = App.elements.users;
    const email = els.username.value.trim();
    const password = els.password.value;
    const role = els.role.value;
    if (!email || !password) { showAlert("Preencha e-mail e senha.", "error"); return; }

    const permissions = {};
    els.permissionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        permissions[cb.dataset.permission] = cb.checked;
    });

    const userCreationAction = async () => {
        let targetCompanyId = App.state.currentUser.companyId;
        if (App.state.currentUser.role === 'super-admin') {
            targetCompanyId = App.elements.users.adminTargetCompanyUsers.value;
            if (!targetCompanyId) {
                throw new Error("Como Super Admin, você deve selecionar uma empresa alvo para criar o utilizador.");
            }
        }

        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUser = userCredential.user;
        await signOut(secondaryAuth);

        const userData = {
            username: email.split('@')[0], email, role, active: true, permissions, companyId: targetCompanyId
        };
        await App.data.createUserData(newUser.uid, userData);

        showAlert(`Utilizador ${email} criado com sucesso!`);
        els.username.value = '';
        els.password.value = '';
        els.role.value = 'user';
        updatePermissionsForRole('user');
    };

    App.state.adminAction = userCreationAction;
    showAdminPasswordConfirmModal();
}

async function executeAdminAction() {
    const adminPassword = App.elements.adminPasswordConfirmModal.passwordInput.value;
    if (!App.state.adminAction || typeof App.state.adminAction !== 'function') { return; }

    if (!navigator.onLine) {
        const userRole = App.state.currentUser?.role;
        if (userRole === 'admin' || userRole === 'super-admin') {
            setLoading(true, "A executar ação offline...");
            try {
                await App.state.adminAction();
                closeAdminPasswordConfirmModal();
            } catch (error) {
                showAlert(`Erro ao executar ação offline: ${error.message}`, "error");
            } finally {
                App.state.adminAction = null;
                App.elements.adminPasswordConfirmModal.passwordInput.value = '';
                setLoading(false);
            }
            return;
        }
    }

    if (!adminPassword) { showAlert("Por favor, insira a sua senha de administrador para confirmar.", "error"); return; }
    setLoading(true, "A autenticar e executar ação...");

    try {
        const adminUser = auth.currentUser;
        const credential = EmailAuthProvider.credential(adminUser.email, adminPassword);
        await reauthenticateWithCredential(adminUser, credential);

        await App.state.adminAction();
        closeAdminPasswordConfirmModal();

    } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') {
            showAlert("A sua senha de administrador está incorreta.", "error");
        } else if (error.code === 'auth/email-already-in-use') {
            showAlert("Este e-mail já está em uso por outro utilizador.", "error");
        } else if (error.code === 'auth/weak-password') {
            showAlert("A senha do novo utilizador deve ter pelo menos 6 caracteres.", "error");
        } else {
            showAlert(`Erro ao executar ação: ${error.message}`, "error");
            console.error("Erro na ação de administrador:", error);
        }
    } finally {
        App.state.adminAction = null;
        App.elements.adminPasswordConfirmModal.passwordInput.value = '';
        setLoading(false);
    }
}

async function deleteUser(userId) {
    const userToDelete = App.state.users.find(u => u.id === userId);
    if (!userToDelete) return;

    showConfirmationModal(`Tem a certeza que deseja EXCLUIR o utilizador ${userToDelete.username}? Esta ação não pode ser desfeita.`, async () => {
        try {
            await App.data.updateDocument('users', userId, { active: false });
            App.actions.removeUserProfileLocally(userId);
            showAlert(`Utilizador ${userToDelete.username} desativado.`);
            closeUserEditModal();
        } catch (error) {
            showAlert("Erro ao desativar utilizador.", "error");
        }
    });
}

async function toggleUserStatus(userId) {
    const user = App.state.users.find(u => u.id === userId);
    if (!user) return;
    const newStatus = !user.active;
    await App.data.updateDocument('users', userId, { active: newStatus });
    showAlert(`Utilizador ${user.username} ${newStatus ? 'ativado' : 'desativado'}.`);
}

async function resetUserPassword(userId) {
    const user = App.state.users.find(u => u.id === userId);
    if (!user || !user.email) return;

    showConfirmationModal(`Deseja enviar um e-mail de redefinição de senha para ${user.email}?`, async () => {
        try {
            await sendPasswordResetEmail(auth, user.email);
            showAlert(`E-mail de redefinição enviado para ${user.email}.`, 'success');
        } catch (error) {
            showAlert("Erro ao enviar e-mail de redefinição.", "error");
            console.error(error);
        }
    });
}

async function saveUserChanges(userId) {
    const modalEls = App.elements.userEditModal;
    const role = modalEls.role.value;
    const permissions = {};
    modalEls.permissionGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        permissions[cb.dataset.permission] = cb.checked;
    });

    await App.data.updateDocument('users', userId, { role, permissions });
    showAlert("Alterações guardadas com sucesso!");
    closeUserEditModal();
}

export {
    initAuth,
    checkSession,
    login,
    loginOffline,
    logout,
    initiateUserCreation,
    executeAdminAction,
    deleteUser,
    toggleUserStatus,
    resetUserPassword,
    saveUserChanges
};
