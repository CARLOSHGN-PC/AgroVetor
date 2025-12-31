
// core/Router.js

class Router {
    constructor(appContext) {
        this.app = appContext; // Access to Database, Auth, UI
        this.activeTab = null;
        this.menuConfig = [
            // Moved from app.js config
            { label: 'Dashboard', icon: 'fas fa-tachometer-alt', target: 'dashboard', permission: 'dashboard', lazyLoadCollection: 'registros' },
            { label: 'Lançamentos', icon: 'fas fa-pen-to-square', submenu: [
                { label: 'Lançamento Broca', icon: 'fas fa-bug', target: 'lancamentoBroca', permission: 'lancamentoBroca' }
            ]},
            { label: 'Cadastros', icon: 'fas fa-book', target: 'cadastros', permission: 'configuracoes', lazyLoadCollection: 'fazendas' },
            // ... (Full menu config would be here)
        ];
    }

    init() {
        // Handle back button, initial route
        const lastTab = localStorage.getItem('agrovetor_lastActiveTab');
        if (lastTab) {
            this.showTab(lastTab);
        }
    }

    showTab(tabId) {
        // 1. Hide current
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
            el.hidden = true;
        });

        // 2. Show new
        const target = document.getElementById(tabId);
        if (target) {
            target.classList.add('active');
            target.hidden = false;
            this.activeTab = tabId;
            localStorage.setItem('agrovetor_lastActiveTab', tabId);
        }

        // 3. Lazy Load Logic (Crucial for Performance)
        this._handleLazyLoading(tabId);
    }

    _handleLazyLoading(tabId) {
        const companyId = this.app.auth.currentUser?.companyId;
        if (!companyId) return;

        // Find config for this tab
        let config = this.menuConfig.find(m => m.target === tabId);
        if (!config) {
            // Search submenus
            this.menuConfig.forEach(m => {
                if (m.submenu) {
                    const sub = m.submenu.find(s => s.target === tabId);
                    if (sub) config = sub;
                }
            });
        }

        if (config && config.lazyLoadCollection) {
            const collectionName = config.lazyLoadCollection;

            // Call Database service to subscribe ONLY now
            this.app.db.subscribeToCollection(collectionName, companyId, (data) => {
                console.log(`Lazy loaded ${data.length} items for ${collectionName}`);
                // Trigger UI update for this specific view
                // e.g., this.app.ui.renderList(tabId, data);
                // Dispatch event or call render directly
                const event = new CustomEvent('data-updated', { detail: { collection: collectionName, data } });
                window.dispatchEvent(event);
            });
        }
    }
}

export default Router;
