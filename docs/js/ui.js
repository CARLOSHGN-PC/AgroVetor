
// This module handles all UI-related logic and DOM manipulation.
// It will be initialized by the main app.js and provided with a reference
// to the global App object.

let App; // Reference to the global App object

export function initUI(globalApp) {
    App = globalApp;
    // Any other UI-specific initializations can go here
}

let loginOfflineCallback;
export function setLoginOfflineCallback(fn) {
    loginOfflineCallback = fn;
}

let logoutCallback;
export function setLogoutCallback(fn) {
    logoutCallback = fn;
}

export const ui = {
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
        this.setLoading(false);
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
            btn.addEventListener('click', () => {
                if (loginOfflineCallback) {
                    loginOfflineCallback(profile.uid)
                }
            });
            offlineUserList.appendChild(btn);
        });
        App.elements.loginScreen.style.display = 'flex';
        App.elements.appScreen.style.display = 'none';
        this.setLoading(false);
    },
    showAppScreen() {
        const { currentUser } = App.state;
        this.setLoading(false);
        App.elements.loginScreen.style.display = 'none';
        App.elements.appScreen.style.display = 'flex';
        App.elements.userMenu.container.style.display = 'block';
        App.elements.notificationBell.container.style.display = 'block';
        App.elements.userMenu.username.textContent = currentUser.username || currentUser.email;

        App.elements.headerTitle.innerHTML = `<i class="fas fa-leaf"></i> AgroVetor`;

        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 60000);

        setInterval(() => {
            if (App.state.armadilhas && App.state.armadilhas.length > 0) {
                App.mapModule.checkTrapStatusAndNotify();
            }
        }, 60000);

        this.renderMenu();
        App.actions.resetInactivityTimer();
        App.actions.loadNotificationHistory();
        App.mapModule.initMap();
        App.actions.startGpsTracking();
    },
    showAlert(message, type = 'success', duration = 3000) {
        const { alertContainer } = App.elements;
        if (!alertContainer) return;
        const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'info-circle', info: 'info-circle' };
        alertContainer.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${message}`;
        alertContainer.className = `show ${type}`;
        setTimeout(() => alertContainer.classList.remove('show'), duration);

        const notification = {
            title: type.charAt(0).toUpperCase() + type.slice(1),
            message: message,
            type: type,
            timestamp: new Date()
        };
        App.actions.saveNotification(notification);
    },
    showSystemNotification(title, message, type = 'info', options = {}) {
        const { list, count, noNotifications } = App.elements.notificationBell;
        const { logId = null } = options;

        const newNotification = {
            title: title,
            type: type,
            message: message,
            timestamp: new Date(),
            logId: logId
        };

        App.state.trapNotifications.unshift(newNotification);
        App.state.unreadNotificationCount++;

        this.updateNotificationBell();
        App.actions.saveNotification(newNotification);
    },
    updateDateTime() { App.elements.currentDateTime.innerHTML = `<i class="fas fa-clock"></i> ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`; },
    renderMenu() {
        const { menu } = App.elements;
        const { menuConfig } = App.config;
        const { currentUser } = App.state;
        menu.innerHTML = '';
        const menuContent = document.createElement('div');
        menuContent.className = 'menu-content';
        menu.appendChild(menuContent);

        const createMenuItem = (item) => {
            const { currentUser, companies } = App.state;
            const isSuperAdmin = currentUser.role === 'super-admin';

            const hasPermission = isSuperAdmin || (item.submenu ?
                item.submenu.some(sub => currentUser.permissions && currentUser.permissions[sub.permission]) :
                (currentUser.permissions && currentUser.permissions[item.permission]));

            if (!hasPermission) return null;

            if (!isSuperAdmin) {
                const userCompany = companies.find(c => c.id === currentUser.companyId);
                const subscribedModules = new Set(userCompany?.subscribedModules || []);

                const isVisible = item.submenu ?
                    item.submenu.some(sub => App.isFeatureGloballyActive(sub.permission) && subscribedModules.has(sub.permission)) :
                    (App.isFeatureGloballyActive(item.permission) && subscribedModules.has(item.permission));

                if (!isVisible) return null;
            }

            const btn = document.createElement('button');
            btn.className = 'menu-btn';
            btn.innerHTML = `<i class="${item.icon}"></i> <span>${item.label}</span>`;

            if (isSuperAdmin) {
                const isAnySubItemHidden = item.submenu && item.submenu.some(sub => !App.isFeatureGloballyActive(sub.permission));
                const isDirectItemHidden = !item.submenu && item.permission && !App.isFeatureGloballyActive(item.permission);

                if (isAnySubItemHidden || isDirectItemHidden) {
                    btn.classList.add('globally-disabled-feature');
                    btn.innerHTML += '<span class="feature-status-badge">Oculto</span>';
                }
            }

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

        const { currentUser, companies } = App.state;
        const userCompany = currentUser.role !== 'super-admin' ? companies.find(c => c.id === currentUser.companyId) : null;
        const subscribedModules = new Set(userCompany?.subscribedModules || []);

        parentItem.submenu.forEach(subItem => {
            const isSuperAdmin = currentUser.role === 'super-admin';
            const hasPermission = isSuperAdmin || (currentUser.permissions && currentUser.permissions[subItem.permission]);

            if (!hasPermission) return;

            const isGloballyActive = App.isFeatureGloballyActive(subItem.permission);
            const isSubscribed = isSuperAdmin || subscribedModules.has(subItem.permission);

            if (!isSuperAdmin && (!isGloballyActive || !isSubscribed)) {
                return;
            }

            const subBtn = document.createElement('button');
            subBtn.className = 'submenu-btn';
            subBtn.innerHTML = `<i class="${subItem.icon}"></i> ${subItem.label}`;

            if (isSuperAdmin && !isGloballyActive) {
                subBtn.classList.add('globally-disabled-feature');
                subBtn.innerHTML += '<span class="feature-status-badge">Oculto</span>';
            }

            if (!isSubscribed && !isSuperAdmin) {
                subBtn.classList.add('disabled-module');
                subBtn.title = "Módulo não disponível na sua subscrição.";
                subBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showAlert("Este módulo não está incluído na subscrição da sua empresa.", "warning", 5000);
                });
            } else {
                subBtn.addEventListener('click', () => {
                    this.closeAllMenus();
                    this.showTab(subItem.target);
                });
            }
            submenuContent.appendChild(subBtn);
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
    showTab(id) {
        const { currentUser, companies } = App.state;
        let requiredPermission = null;
        App.config.menuConfig.forEach(item => {
            if (item.target === id) {
                requiredPermission = item.permission;
            } else if (item.submenu) {
                const subItem = item.submenu.find(sub => sub.target === id);
                if (subItem) {
                    requiredPermission = subItem.permission;
                }
            }
        });

        if (requiredPermission && currentUser.role !== 'super-admin' && !App.state.isImpersonating) {
            const isGloballyActive = App.isFeatureGloballyActive(requiredPermission);
            if (!isGloballyActive) {
                this.showAlert("Esta funcionalidade não está ativa no momento.", "info", 5000);
                return;
            }

            const userCompany = companies.find(c => c.id === currentUser.companyId);
            if (!userCompany) {
                console.warn(`Tentativa de acesso ao módulo ${requiredPermission} sem dados da empresa carregados. A bloquear.`);
                return;
            }
            const subscribedModules = new Set(userCompany?.subscribedModules || []);
            if (!subscribedModules.has(requiredPermission)) {
                this.showAlert("Este módulo não está incluído na subscrição da sua empresa.", "warning", 5000);
                return;
            }
        }

        const currentActiveTab = document.querySelector('.tab-content.active');
        if (currentActiveTab && currentActiveTab.id !== id) {
            if (currentActiveTab.id === 'lancamentoCigarrinha') {
                this.clearForm(App.elements.cigarrinha.form);
            }
            if (currentActiveTab.id === 'lancamentoCigarrinhaAmostragem') {
                const amostragemEls = App.elements.cigarrinhaAmostragem;
                this.clearForm(amostragemEls.form);
                if (amostragemEls.amostrasContainer) {
                    amostragemEls.amostrasContainer.innerHTML = '';
                }
                if (amostragemEls.resultado) {
                    amostragemEls.resultado.textContent = '';
                }
            }
        }

        const mapContainer = App.elements.monitoramentoAereo.container;
        if (id === 'monitoramentoAereo') {
            mapContainer.classList.add('active');
            if (App.state.mapboxMap) {
                setTimeout(() => App.state.mapboxMap.resize(), 0);
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

        localStorage.setItem('agrovetor_lastActiveTab', id);
        this.closeAllMenus();
    },

    updateNotificationBell() {
        const { list, count, noNotifications } = App.elements.notificationBell;
        const notifications = App.state.trapNotifications;
        const unreadCount = App.state.unreadNotificationCount;

        list.innerHTML = '';

        if (notifications.length === 0) {
            noNotifications.style.display = 'flex';
            list.style.display = 'none';
        } else {
            noNotifications.style.display = 'none';
            list.style.display = 'block';

            notifications.forEach(notif => {
                const item = document.createElement('div');
                item.className = `notification-item ${notif.type}`;
                const timeAgo = this.timeSince(notif.timestamp);

                let iconClass = 'fa-info-circle';
                const lowerCaseTitle = (notif.title || '').toLowerCase();

                if (notif.trapId) {
                    item.dataset.trapId = notif.trapId;
                    iconClass = 'fa-bug';
                    if (notif.type === 'warning') iconClass = 'fa-exclamation-triangle';
                    if (notif.type === 'danger') iconClass = 'fa-exclamation-circle';
                } else if (lowerCaseTitle.includes('sincroniza')) {
                    iconClass = 'fa-sync-alt';
                    if (notif.logId) {
                        item.dataset.logId = notif.logId;
                    }
                    if (notif.type === 'success') iconClass = 'fa-check-circle';
                    if (notif.type === 'warning') iconClass = 'fa-exclamation-triangle';
                    if (notif.type === 'error') iconClass = 'fa-exclamation-circle';
                }

                const itemTitle = notif.title || (notif.trapId ? 'Armadilha Requer Atenção' : 'Notificação do Sistema');

                item.innerHTML = `
                    <i class="fas ${iconClass}"></i>
                    <div class="notification-item-content">
                        <p><strong>${itemTitle}</strong></p>
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
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        if (isNaN(date)) return "Data inválida";

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
        dashEls.plantioView.style.display = 'none';
        dashEls.cigarrinhaView.style.display = 'none';
        dashEls.climaView.style.display = 'none';

        App.charts.destroyAll();

        switch (viewName) {
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
                this.loadDashboardDates('aereo');
                setTimeout(() => App.charts.renderAereoDashboardCharts(), 150);
                break;
            case 'plantio':
                dashEls.plantioView.style.display = 'block';
                this.loadDashboardDates('plantio');
                setTimeout(() => App.charts.renderPlantioDashboardCharts(), 150);
                break;
            case 'cigarrinha':
                dashEls.cigarrinhaView.style.display = 'block';
                this.loadDashboardDates('cigarrinha');
                setTimeout(() => App.charts.renderCigarrinhaDashboardCharts(), 150);
                break;
            case 'clima':
                dashEls.climaView.style.display = 'block';
                this.loadDashboardDates('clima');
                setTimeout(() => App.charts.renderClimaDashboardCharts(), 150);
                break;
        }
    },
    loadDashboardDates(type) {
        const savedDates = App.actions.getDashboardDates(type);
        const startEl = document.getElementById(`${type}DashboardInicio`);
        const endEl = document.getElementById(`${type}DashboardFim`);

        if (startEl && endEl) {
            if (savedDates.start && savedDates.end) {
                startEl.value = savedDates.start;
                endEl.value = savedDates.end;
            } else {
                this.setDefaultDatesForDashboard(type);
            }
        }
    },
    setDefaultDatesForDashboard(type) {
        const today = new Date();
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
        const todayDate = today.toISOString().split('T')[0];

        const startEl = document.getElementById(`${type}DashboardInicio`);
        const endEl = document.getElementById(`${type}DashboardFim`);

        if(startEl && endEl) {
            startEl.value = firstDayOfYear;
            endEl.value = todayDate;
            App.actions.saveDashboardDates(type, firstDayOfYear, todayDate);
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
    showImpersonationBanner(companyName) {
        this.hideImpersonationBanner();

        const banner = document.createElement('div');
        banner.id = 'impersonation-banner';
        const bannerHeight = 40;

        Object.assign(banner.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: `${bannerHeight}px`,
            backgroundColor: 'var(--color-purple)', color: 'white', textAlign: 'center',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '14px', zIndex: '10001', boxSizing: 'border-box'
        });

        banner.innerHTML = `
            <i class="fas fa-eye" style="margin-right: 10px;"></i>
            <span>A visualizar como <strong>${companyName}</strong>.</span>
            <button id="stop-impersonating-btn" style="background: white; color: var(--color-purple); border: none; padding: 5px 10px; border-radius: 5px; margin-left: 20px; cursor: pointer; font-weight: bold;">Sair da Visualização</button>
        `;

        document.body.prepend(banner);
        document.body.style.paddingTop = `${bannerHeight}px`;

        const stopBtn = document.getElementById('stop-impersonating-btn');
        if (stopBtn) {
            // This will be connected to an action in the main app.js
            // stopBtn.addEventListener('click', App.actions.stopImpersonating);
        }
    },

    hideImpersonationBanner() {
        const banner = document.getElementById('impersonation-banner');
        if (banner) {
            banner.remove();
        }
        document.body.style.paddingTop = '0';
    },

    setupEventListeners() {
        if (App.elements.btnToggleMenu) App.elements.btnToggleMenu.addEventListener('click', () => {
            document.body.classList.toggle('mobile-menu-open');
            App.elements.menu.classList.toggle('open');
            App.elements.btnToggleMenu.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (App.elements.menu && !App.elements.menu.contains(e.target) && App.elements.btnToggleMenu && !App.elements.btnToggleMenu.contains(e.target)) {
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

        if (App.elements.userMenu.toggle) App.elements.userMenu.toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = App.elements.userMenu.dropdown;
            const toggle = App.elements.userMenu.toggle;
            const isShown = dropdown.classList.toggle('show');
            toggle.classList.toggle('open', isShown);
            toggle.setAttribute('aria-expanded', isShown);
            if (App.elements.notificationBell.dropdown) App.elements.notificationBell.dropdown.classList.remove('show');
        });

        if (App.elements.notificationBell.toggle) App.elements.notificationBell.toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = App.elements.notificationBell.dropdown;
            const isShown = dropdown.classList.toggle('show');
            if (isShown) {
                App.actions.markNotificationsAsRead();
            }
            if (App.elements.userMenu.dropdown) App.elements.userMenu.dropdown.classList.remove('show');
        });

        if (App.elements.userMenu.themeButtons) App.elements.userMenu.themeButtons.forEach(btn => {
            btn.addEventListener('click', () => this.applyTheme(btn.id));
        });

        const dashEls = App.elements.dashboard;
        const cardBroca = document.getElementById('card-broca');
        if (cardBroca) cardBroca.addEventListener('click', () => this.showDashboardView('broca'));
    }
};
